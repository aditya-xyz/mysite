import {addressIsCurrent} from './address-editor.js';
import {mountPrintAdmin,prunePrintPermissions} from './print-admin.js';
import {photoUploadError,uploadPhoto,findUploadedPhoto,addPhotoToDraft,isFileDrag,bindPhotoDropzone} from './photo-upload.js';
import {sendApiRequest} from './api-request.js';
import QRCode from 'qrcode';
import {scrapbookConfig} from '../../web/config.js';
import {winterLights,winterSnowflake} from '../../web/seasonal.js';
import {createPreviewLoader} from './preview-loader.js';
import {peoplePickerMarkup,bindPeoplePicker} from './people-picker.js';
const app=document.querySelector('#app'),modal=document.querySelector('#modal'),modalContent=document.querySelector('#modal-content');
let selectedPhotoId='',photoFilter='all',photoEditorOpen=false;
let state,view=routeFromHash().view,editions=[],contacts=[],draftCache=new Map(),navigationGeneration=0,pendingRequests=0,dirty=false,busy=false,previewRecipient='',previewData=null,personalModes=new Set(),inviteData,editGeneration=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const retryFilesByYear=new Map(),removedPhotos=new Map();
const byId=id=>document.getElementById(id);
function sharedHeading(title){return !title||['A little of our year','A little of our year.'].includes(title.trim())?'Meanwhile, in our camera roll…':title;}
async function requestApi(path,data,signal){
  return sendApiRequest(path,data,signal);
}
async function api(path,data){
  if(!state)throw new Error('Choose a scrapbook first.');
  pendingRequests++;updateBadge();
  try{return await requestApi(`editions/${state.year}/${path}`,data);}
  finally{pendingRequests--;updateBadge();}
}
const editionViews=['story','photos','sharing','preview'];
function taskHref(task,year=state?.year){if(task==='directory')return '#people';return editionViews.includes(task)?`#scrapbooks/${year}/${task}`:'#'+task;}
function rememberDraft(){updateEditionSummary();if(state)draftCache.set(state.year,{state,dirty,personalModes:new Set(personalModes),editGeneration,previewData,previewRecipient});}
function updateEditionSummary(){
  if(!state)return;
  const summary=editions.find(e=>e.year===state.year);
  if(summary)Object.assign(summary,{title:state.draft.title,authors:state.draft.authors,version:state.version,publishedVersion:state.publishedVersion,isActive:state.isActive,publishedAt:state.publishedAt,photoCount:state.draft.photos.length,storyCount:state.draft.stories.length,peopleCount:new Set(state.people.flatMap(p=>p.memberIds||[p.person_id])).size});
}
let toastTimer,modalReturnFocus;
function toast(text){const el=byId('toast');el.textContent=text;el.dataset.visible='true';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.dataset.visible='false',6500);}
function mark(){prunePrintPermissions(state,contacts);editGeneration++;dirty=true;previewData=null;updateBadge();}
const icons={
  home:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  write:'<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m13 6 5 5"/>',
  photos:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  review:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2m-7 9 3 3 5-6"/>',
  server:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M12 6.5h5M12 17.5h5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5M9 12h12"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>'
};
const icon=name=>`<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.home}</svg>`;
const pages={
  home:{title:'Scrapbooks',section:'Studio'},
  scrapbooks:{title:'Scrapbooks',section:'Creative'},
  articles:{title:'Articles',section:'Creative'},
  new:{title:'Create a scrapbook',section:'Scrapbooks'},
  story:{title:'Write stories',section:'Scrapbook',description:'Set the scene, write an opening note, and add the moments you want to share.'},
  photos:{title:'Photos',section:'Scrapbook',description:'Upload originals, arrange your photos, and decide who can see each one.'},
  directory:{title:'People',section:'Creative',description:'Add someone once. Choose what to share with them in each scrapbook.'},
  sharing:{title:'Invitations',section:'Scrapbook',description:'Create scrapbook invitations for people in your directory. Photo assignments alone don’t grant access.'},
  preview:{title:'Review & publish',section:'Scrapbook',description:'Check your saved draft through a friend’s eyes before sharing it.'},
  server:{title:'Home server',section:'System'}
};
function routeFromHash(){
  const route=location.hash.slice(1),match=/^scrapbooks\/(\d{4})\/(story|photos|people|sharing|preview)$/.exec(route);
  if(match)return {view:match[2]==='people'?'sharing':match[2],year:Number(match[1])};
  if(route==='people')return {view:'directory'};
  if(['story','photos','sharing','preview'].includes(route))return {view:route,year:2026};
  return {view:['home','scrapbooks','articles','directory','new','server'].includes(route)?route:'home'};
}
function invitationFor(id){const matches=state?.people.filter(p=>(p.memberIds||[p.person_id]).includes(id))||[];return matches.find(p=>!p.revoked_at&&p.expires_at>Date.now()/1000)||matches[0];}
function accessStatus(id){const invitation=invitationFor(id);return !invitation?'Not invited':invitation.revoked_at?'Revoked':invitation.expires_at<=Date.now()/1000?'Expired':'Invited';}
function missingInvitations(){return [...new Set(state.draft.photos.filter(p=>!p.hidden).flatMap(p=>p.recipients))].filter(id=>accessStatus(id)!=='Invited');}
async function contactApi(path='',data){pendingRequests++;updateBadge();try{return await requestApi('contacts'+path,data);}finally{pendingRequests--;updateBadge();}}
function updateContacts(person){
  contacts=[...contacts.filter(p=>p.id!==person.id),{...contacts.find(p=>p.id===person.id),...person}].sort((a,b)=>a.name.localeCompare(b.name));
  const states=new Set([state,...[...draftCache.values()].map(c=>c.state)].filter(Boolean));
  for(const cached of states)cached.people=cached.people.map(invite=>invite.person_id===person.id?{...invite,name:person.name,phone:person.phone,addressedTo:invite.addressed_to||person.name}:invite);
  previewData=null;for(const cached of draftCache.values())cached.previewData=null;
}
function draftStatus(){return dirty?'Unsaved changes':state.publishedVersion===state.version?'Published':'Saved draft';}
function draftIssues(){
  const d=state.draft,issues=[];
  const descriptions=d.photos.filter(p=>!p.hidden&&!p.alt.trim()).length;
  const recipients=d.photos.filter(p=>!p.hidden&&personalModes.has(p.id)&&!p.recipients.length).length;
  const stories=d.stories.filter(s=>!s.title.trim()||!s.body.trim()).length;
  if(!d.photos.some(p=>!p.hidden))issues.push({view:'photos',text:'Include at least one photo'});
  if(descriptions)issues.push({view:'photos',text:`Add descriptions to ${descriptions} photo${descriptions===1?'':'s'}`});
  if(recipients)issues.push({view:'photos',text:`Choose recipients for ${recipients} personal photo${recipients===1?'':'s'}`});
  if(stories)issues.push({view:'story',text:`Finish ${stories} stor${stories===1?'y':'ies'}`});
  if(['authors','intro','note','sharedTitle'].some(key=>!d[key].trim()))issues.push({view:'story',text:'Complete the edition details'});
  const missing=missingInvitations();
  if(missing.length)issues.push({view:'sharing',text:`Invite ${missing.length} selected ${missing.length===1?'person':'people'} to this scrapbook`});
  return issues;
}
function updateBadge(){
  if(!state)return;
  const el=byId('draft-badge');if(el){el.textContent=draftStatus();el.classList.toggle('changed',dirty);}
  document.querySelectorAll('[data-busy]').forEach(b=>b.disabled=busy||pendingRequests>0);
  const previewButton=byId('open-preview');if(previewButton)previewButton.textContent=dirty?'Save & preview':'Preview';
  const publish=byId('publish');if(publish)publish.disabled=busy||pendingRequests>0||dirty||draftIssues().length>0;
}
async function load(year){
  const cached=draftCache.get(year);
  if(cached){({state,dirty,personalModes,editGeneration,previewData,previewRecipient}=cached);return;}
  state=await requestApi(`editions/${year}/state`);dirty=false;editGeneration=0;previewRecipient='';previewData=null;
  personalModes=new Set(state.draft.photos.filter(p=>p.audience==='personal'||p.recipients.length).map(p=>p.id));
}
function field(label,key,value,textarea=false,extra=''){
  return `<label class="field"><span>${esc(label)}</span>${textarea?`<textarea data-field="${key}" ${extra}>${esc(value)}</textarea>`:`<input data-field="${key}" value="${esc(value)}" ${extra}>`}</label>`;
}
function head(){
  const p=pages[view],edition=editionViews.includes(view),editing=['story','photos'].includes(view),review=view==='preview';
  const actions=edition?`<div class="page-actions"><span id="draft-badge" class="badge"></span><div class="actions"><button class="secondary" id="open-preview" data-busy>Preview</button>${editing||review?`<button class="secondary" id="save-draft" data-busy>Save draft</button>${review?'<button class="button" id="publish" data-busy>Publish edition…</button>':`<a class="button" href="${taskHref('preview')}" data-view="preview">Review & publish ${icon('arrow')}</a>`}`:''}</div></div>`:view==='directory'?'<button class="button" id="add-contact">+ Add a person</button>':'';
  return `${edition?scrapbookContext():''}<div class="page-head"><div><p class="kicker">${edition?'Scrapbook / '+state.year:p.section}</p><h1>${p.title}</h1><p class="lede">${p.description||''}</p></div>${actions}</div>${edition?flowSteps():''}`;
}
function editionCard(e){
  const cached=draftCache.get(e.year),unsaved=cached?.dirty,status=unsaved?'Unsaved changes':e.publishedVersion===e.version?'Published':'Draft';
  return `<a class="panel scrapbook-card" href="${taskHref('photos',e.year)}" data-view="photos" data-year="${e.year}"><div class="panel-heading"><span class="year-label">${e.year}</span><span class="badge ${status==='Published'?'active-badge':unsaved?'changed':''}">${status}</span></div><h2>${e.year} scrapbook</h2><p class="edition-access ${e.isActive?'active':'inactive'}">${e.isActive?'Active · Guest access open':e.publishedAt?'Inactive · Guest access closed':'Inactive · Not published'}</p><p>${esc(e.authors)}</p><div class="scrapbook-card-bottom"><span>${e.photoCount} photos · ${e.storyCount} stories · ${e.peopleCount} people</span><span>Open scrapbook ${icon('arrow')}</span></div></a>`;
}
function workspaceRow(target,title,description,iconName,badge=''){
  return `<section class="panel system-summary"><span class="task-icon">${icon(iconName)}</span><div><div class="inline-heading"><h2>${title}</h2>${badge?`<span class="badge">${badge}</span>`:''}</div><p>${description}</p></div><a class="quiet" href="#${target}" data-view="${target}" aria-label="View ${title} workspace">View workspace ${icon('arrow')}</a></section>`;
}
function home(){
  const current=editions.find(e=>e.isActive)||editions.find(e=>e.publishedAt)||editions[0];
  if(!current)return scrapbooks();
  const cached=current.year===state?.year?{state,dirty}:draftCache.get(current.year),issues=cached?.state?draftIssuesFor(cached.state):[];
  const other=editions.filter(e=>e!==current);
  return `<div class="page-head"><div><p class="kicker">Your collection</p><h1>Your year, coming together.</h1><p class="lede">A home for the photos, the people, and the little stories in between.</p></div><a class="button" href="#new" data-view="new">+ New scrapbook</a></div><section class="panel studio-feature"><img class="studio-cover" src="/studio-cover.svg" alt="An illustrated landscape on a scrapbook cover"><div class="studio-feature-copy"><div class="actions"><span class="badge ${current.isActive?'active-badge':''}">${current.isActive?'Active':'Draft'}</span><span class="badge ${cached?.dirty?'changed':''}">${cached?.dirty?'Unsaved changes':current.publishedVersion===current.version?'Published':'Unpublished changes'}</span></div><h2>${current.year}</h2><p class="studio-authors">${esc(current.authors)}</p><p class="hint">${current.photoCount} photos · ${current.peopleCount} people</p><div class="actions"><a class="button" href="${taskHref('photos',current.year)}" data-view="photos" data-year="${current.year}">Continue editing ${icon('arrow')}</a><button class="secondary" data-preview-edition="${current.year}">Preview as a guest</button></div></div></section><div class="studio-next"><section class="panel studio-checklist"><h2>A few finishing touches</h2><p class="hint">You can keep editing. Guests see the last published version.</p>${issues.length?issues.map(i=>`<a class="studio-task" href="${taskHref(i.view,current.year)}" data-view="${i.view}" data-year="${current.year}">${icon('arrow')} ${esc(i.text)}</a>`).join(''):`<a class="studio-task" href="${taskHref('photos',current.year)}" data-view="photos" data-year="${current.year}">${icon('photos')} Arrange photos, captions, and audiences ${icon('arrow')}</a><a class="studio-task" href="${taskHref('sharing',current.year)}" data-view="sharing" data-year="${current.year}">${icon('people')} Make room for your people ${icon('arrow')}</a>`}<a class="studio-review" href="${taskHref('preview',current.year)}" data-view="preview" data-year="${current.year}">Review changes before publishing ${icon('arrow')}</a></section><div class="studio-other">${other.map(editionCard).join('')||'<div class="panel studio-next-year"><p class="kicker">The next chapter</p><h2>A fresh page.</h2><p class="hint">Start another year whenever you’re ready.</p><a class="secondary" href="#new" data-view="new">Create a scrapbook</a></div>'}</div></div><p class="studio-footnote">One active scrapbook at a time. Publishing a new year closes access to the previous year.</p>`;
}
function draftIssuesFor(saved){
 const issues=[],photos=saved.draft.photos.filter(p=>!p.hidden),missing=photos.filter(p=>!p.alt.trim()).length;
 if(missing)issues.push({view:'photos',text:`${missing} photo${missing===1?' needs':'s need'} an accessibility description`});
 if(!photos.length)issues.push({view:'photos',text:'Include your first photo'});
 return issues;
}
function scrapbookContext(){return `<div class="scrapbook-context"><a class="quiet" href="#scrapbooks" data-view="scrapbooks">${icon('arrow')} All scrapbooks</a><label class="scrapbook-switcher"><span>Editing scrapbook</span><span class="select-control"><select id="edition-picker" aria-label="Choose a scrapbook">${editions.map(e=>`<option value="${e.year}" ${state.year===e.year?'selected':''}>${e.year} · ${esc(e.authors)}</option>`).join('')}</select></span></label></div>`;}
function articles(){return `${head()}<section class="panel server-empty"><span class="server-illustration">${icon('write')}</span><span class="badge">Not set up</span><h2>A place for your writing.</h2><p class="lede">Your article workspace will live here.<br>Drafting and publishing aren’t connected yet.</p></section>`;}
function scrapbooks(){return `<div class="page-head"><div><p class="kicker">Your collection</p><h1>Scrapbooks</h1><p class="lede">One scrapbook for each year. Open an existing one or start the next.</p></div></div><div class="scrapbook-grid">${editions.map(editionCard).join('')}<a class="panel new-scrapbook-card" href="#new" data-view="new"><span>+</span><strong>Create a scrapbook</strong><p>Start a new year with an empty draft.</p></a></div>`;}
function newScrapbook(){
  let year=new Date().getFullYear();while(editions.some(e=>e.year===year)&&year<=2100)year++;
  year=Math.min(year,2100);
  return `${head()}<div class="creation-grid"><form id="create-scrapbook" class="panel form-panel"><div class="section-heading"><h2>Start with the basics</h2><p class="hint">The year identifies this scrapbook. You can edit the authors and opening note later.</p></div><label class="field"><span>Year</span><input name="year" type="number" min="2000" max="2100" step="1" value="${year}" required></label><label class="field"><span>From</span><input name="authors" maxlength="100" value="Aditya & Angela" required></label><div class="actions"><button class="button" type="submit">Create draft & continue ${icon('arrow')}</button><a href="#scrapbooks" data-view="scrapbooks" class="quiet">Cancel</a></div><p class="error" id="creation-error" role="alert"></p></form><aside class="panel creation-guide"><p class="kicker">Build it step by step</p><h2>A year worth keeping.</h2><ol><li><strong>Write your stories</strong><span>Add an opening note and the moments that matter.</span></li><li><strong>Add your photos</strong><span>Arrange your memories and choose who sees each one.</span></li><li><strong>Choose what to share</strong><span>Create scrapbook invitations from your People directory.</span></li><li><strong>Review & publish</strong><span>See it through a friend’s eyes, then share when ready.</span></li></ol><p class="hint">Starts with no photos, stories, or invitations. Existing scrapbooks stay unchanged.</p></aside></div>`;
}
function flowSteps(){return `<nav class="flow-steps" aria-label="Scrapbook creation steps">${[['photos','Photos'],['story','Story'],['sharing','Invitations'],['preview','Review & publish']].map(([task,label],i)=>`<a href="${taskHref(task)}" data-view="${task}" ${view===task?'aria-current="step"':''}>${label}</a>`).join('')}</nav>`;}
function continueFlow(next,save=true){return `<div class="flow-footer"><a class="quiet" href="#scrapbooks" data-view="scrapbooks">${icon('arrow')} All scrapbooks</a>${save?`<button class="button" data-continue="${next}" data-busy>Save & continue to ${next==='photos'?'photos':'sharing'} ${icon('arrow')}</button>`:`<a class="button" href="${taskHref(next)}" data-view="${next}">Continue to review ${icon('arrow')}</a>`}</div>`;}
function story(){const d=state.draft;return `${head()}<div class="notice">You’re editing a private draft. Save your work, then go to Review & publish when it’s ready.</div><div class="editor-width"><section class="panel form-panel"><div class="section-heading"><h2>Edition details</h2><p class="hint">The introduction your friends see when they open the scrapbook.</p></div>${field('From','authors',d.authors,false,'maxlength="100"')}${field('Invitation introduction','intro',d.intro,true,'maxlength="1000"')}${field('Opening note','note',d.note,true,'class="long-note" maxlength="10000"')}${field('Shared photo heading','sharedTitle',sharedHeading(d.sharedTitle),false,'maxlength="150"')}</section><section class="panel form-panel"><div class="row-head"><div><h2>Stories</h2><p class="hint">A trip, a milestone, or an ordinary day worth remembering.</p></div><button class="secondary" id="add-story" ${d.stories.length>=20?'disabled':''}>+ Add a story</button></div>${d.stories.map((s,i)=>`<article class="story-card" data-story="${esc(s.id)}"><div class="row-head"><span class="kicker">Story ${i+1}</span><button class="quiet danger" data-remove-story="${esc(s.id)}">Remove from draft</button></div>${field('Title','story-title',s.title,false,'maxlength="150"')}${field('Story','story-body',s.body,true,'maxlength="10000"')}</article>`).join('')||'<div class="empty">No stories yet.<span>Your opening note and photos are enough to start. Add a story whenever you have one.</span></div>'}</section></div>${continueFlow('photos')}`;}
function missingPhotoDescriptions(){return state.draft.photos.flatMap((photo,index)=>photo.hidden||photo.alt.trim()?[]:[{photo,index}]);}
function focusPhotoDescription(id){
  selectedPhotoId=id;photoFilter='all';photoEditorOpen=true;if(view==='photos')render();
  const card=[...app.querySelectorAll('[data-photo]')].find(el=>el.dataset.photo===id),input=card?.querySelector('[data-field="alt"]');
  if(!input)return;
  card.scrollIntoView({block:'center',behavior:'instant'});input.focus({preventScroll:true});
}
function updatePhotoValidation(){
  app.querySelectorAll('[data-photo]').forEach(card=>{
    const input=card.querySelector('[data-field="alt"]'),missing=!state.draft.photos.find(p=>p.id===card.dataset.photo).hidden&&!input.value.trim();
    if(missing)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
    card.querySelector('[data-description-error]').hidden=!missing;
  });
}
function photoCard(p,i){const personal=personalModes.has(p.id),hasOriginal=!!state.media.find(m=>m.id===p.id)?.has_original;return `<article class="photo-editor ${p.hidden?'is-hidden':''}" data-photo="${esc(p.id)}"><img src="/api/editions/${state.year}/media/${esc(p.id)}/preview" alt="${esc(p.alt||'Photo awaiting description')}" loading="lazy"><div class="photo-fields"><div class="photo-visibility"><p class="kicker photo-number">Photo ${i+1}${p.hidden?' · Hidden':''}</p><button class="secondary" data-toggle-hidden aria-pressed="${!!p.hidden}" aria-label="${p.hidden?'Unhide':'Hide'} photo ${i+1}">${p.hidden?'Unhide photo':'Hide photo'}</button></div>${p.hidden?'<p class="hint hidden-photo-hint">Hidden from previews and the next publication. Your place, caption, description, and people are kept. You can assign people later.</p>':''}<div class="photo-tools"><div class="actions"><button class="icon-button" data-move="up" aria-label="Move photo ${i+1} earlier" ${i===0?'disabled':''}>↑</button><button class="icon-button" data-move="down" aria-label="Move photo ${i+1} later" ${i===state.draft.photos.length-1?'disabled':''}>↓</button></div><button class="quiet danger" data-remove-photo>Remove from draft</button></div>${!state.media.find(m=>m.id===p.id)?.has_viewer?`<button class="secondary" data-generate-previews="${esc(p.id)}">Generate lighter previews</button><p class="hint">Uses the original when available. Updates the next publication; the original stays unchanged.</p>`:''}${field('Caption','caption',p.caption,false,'maxlength="500"')}${field('Describe the photo for accessibility','alt',p.alt,false,`maxlength="500" aria-describedby="description-error-${esc(p.id)}" ${!p.hidden&&!p.alt.trim()?'aria-invalid="true"':''}`)}<p class="error photo-description-error" id="description-error-${esc(p.id)}" data-description-error ${p.hidden||p.alt.trim()?'hidden':''}>Add a description of what’s visible in this photo.</p><label class="field"><span>Who can see this photo?</span><span class="select-control"><select data-audience><option value="shared" ${!personal?'selected':''}>Everyone invited</option><option value="personal" ${personal?'selected':''}>Selected people</option></select></span></label><p class="hint">${personal?(hasOriginal?'Invitations including a selected person can view and save the original.':'Invitations including a selected person can view this sample. No original is available.'):'Everyone invited can view the preview. The original stays private.'}</p>${personal?peoplePickerMarkup(p.id,`People for photo ${i+1}`,{compact:true}):''}</div></article>`;}
function photos(){const used=new Set(state.draft.photos.map(p=>p.id)),unused=state.media.filter(m=>!used.has(m.id));const chosen=state.draft.photos.find(p=>p.id===selectedPhotoId)||state.draft.photos[0];if(chosen)selectedPhotoId=chosen.id;return `${head()}<div class="photo-filter-bar" role="group" aria-label="Filter photos">${[['all','All'],['personal','Photos for selected'],['shared','Photos for all'],['hidden','Hidden'],['attention','Needs attention']].map(([key,label])=>`<button class="photo-filter" data-photo-filter="${key}" aria-pressed="${photoFilter===key}">${label} <span>${state.draft.photos.filter(p=>matchesPhotoFilter(p,key)).length}</span></button>`).join('')}</div>${state.draft.photos.length?'<details class="photo-bulk-tools"><summary>Organize the whole scrapbook</summary><div class="photo-visibility-actions"><p class="hint">Making a small test scrapbook? Hide all photos, then unhide just the ones you want to include.</p><div class="actions"><button class="secondary" id="hide-all-photos" data-busy>Hide all photos</button><button class="quiet" id="unhide-all-photos" data-busy>Unhide all photos</button></div></div></details>':''}<div class="upload-zone" id="photo-dropzone" role="group" aria-label="Add original photos" aria-describedby="upload-hint upload-status"><div><p>Drop photos here, or choose files</p><span class="hint" id="upload-hint">JPEG, PNG, or WebP · under 100 MB each<br>Originals keep their metadata. Previews are smaller and omit EXIF.</span></div><input id="upload" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple aria-label="Upload original photos"></div><p id="upload-status" role="status" aria-live="polite" aria-atomic="true"></p>${retryFilesByYear.get(state.year)?.length?`<button class="secondary" id="retry-uploads">Retry remaining ${retryFilesByYear.get(state.year).length} photos</button>`:''}<div class="photo-workspace"><div class="photo-grid">${state.draft.photos.filter(p=>matchesPhotoFilter(p,photoFilter)).map(p=>{const i=state.draft.photos.indexOf(p);return `<button type="button" class="photo-tile ${p.hidden?'is-hidden':''}" data-select-photo="${esc(p.id)}" aria-pressed="${chosen?.id===p.id}" aria-label="Edit photo ${i+1}: ${esc(p.caption||'Untitled photo')}"><img src="/api/editions/${state.year}/media/${esc(p.id)}/preview" alt="${esc(p.alt)}" loading="lazy" decoding="async"><span class="photo-tile-caption">${esc(p.caption||'Add a caption')}</span><span class="photo-tile-meta">Photo ${i+1} · ${p.hidden?'Hidden':personalModes.has(p.id)?`${p.recipients.length} selected people`:'Everyone invited'}${!p.hidden&&!p.alt.trim()?' · Description needed':''}</span></button>`;}).join('')||'<div class="empty">No photos in this view.</div>'}</div><aside class="photo-inspector" id="photo-inspector" aria-label="Selected photo editor">${chosen?`<div class="inspector-heading"><h2>Photo ${state.draft.photos.indexOf(chosen)+1}</h2><button class="quiet" id="done-photo-edit">Done editing ${icon('check')}</button></div>${photoCard(chosen,state.draft.photos.indexOf(chosen))}`:'<p class="hint">Choose a photo to give it a story.</p>'}</aside></div>${unused.length?`<section class="library"><h3>Already uploaded</h3><p class="hint">Reuse these photos or permanently delete unused originals and previews. Published photos stay protected.</p><div class="library-items">${unused.map(m=>`<article class="library-item"><button data-add-media="${esc(m.id)}" aria-label="Add ${esc(m.filename)} to draft" ${m.deletion_pending?'disabled':''}>${!m.deletion_pending?`<img src="/api/editions/${state.year}/media/${esc(m.id)}/preview" alt="">`:''}${esc(m.filename)}<br>${m.deletion_pending?'Deletion pending':'+ Add to draft'}</button><button class="quiet danger" data-delete-media="${esc(m.id)}" aria-label="Delete ${esc(m.filename)} permanently">${m.deletion_pending?'Retry deletion':'Delete permanently'}</button></article>`).join('')}</div></section>`:''}${continueFlow('sharing')}`;}
function matchesPhotoFilter(p,filter){return filter==='all'||filter==='hidden'&&p.hidden||filter==='attention'&&!p.hidden&&!p.alt.trim()||filter==='personal'&&!p.hidden&&personalModes.has(p.id)||filter==='shared'&&!p.hidden&&!personalModes.has(p.id);}
function mailingSummary(person){let a;try{a=JSON.parse(person.mailing_address);}catch{}return a?`<address>${[a.line1,a.line2,[a.city,a.state,a.postalCode].filter(Boolean).join(', ')].filter(Boolean).map(esc).join('<br>')}</address><span class="badge ${addressIsCurrent(person)?'active-badge':''}">${addressIsCurrent(person)?'Verified US address':person.address_verified?'Verification expired':'Not verified'}</span>`:'<span class="no-address">No address yet</span>';}
function directoryRows(query=''){
  const matches=contacts.filter(p=>(p.name+' '+(p.phone||'')).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return matches.map(p=>`<article class="person"><div class="person-identity"><span class="person-avatar">${esc(p.name.slice(0,1).toUpperCase())}</span><div><strong>${esc(p.name)}</strong><p>${esc(p.phone||'No phone number · Can join a shared invitation')}</p></div></div><div class="person-address">${mailingSummary(p)}</div><div class="person-actions"><button class="secondary" data-edit-contact="${esc(p.id)}">Edit details</button><button class="quiet danger" data-delete-contact="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button></div></article>`).join('')||'<div class="empty">No people found.<span>Add someone to your directory, or try a different search.</span></div>';
}
function directory(){return `${head()}<div class="notice">Adding a person never sends a message or grants scrapbook access. Invitations are managed separately in each scrapbook.</div><section class="panel people-panel"><div class="row-head"><h2>Your people <span class="badge">${contacts.length}</span></h2><label class="directory-search"><span class="sr-only">Search people</span><input id="directory-search" type="search" placeholder="Search people…" autocomplete="off"></label></div><div class="people-list" id="directory-list">${directoryRows()}</div></section>`;}
function invitationStatus(invite){return invite.revoked_at?'Revoked':invite.expires_at<=Date.now()/1000?'Expired':'Invited';}
function sharingRows(query=''){
  const q=query.toLocaleLowerCase();
  const invitations=state.people.filter(i=>(i.addressedTo+' '+i.name+' '+i.phone+' '+(i.memberIds||[]).map(id=>contacts.find(p=>p.id===id)?.name||'').join(' ')).toLocaleLowerCase().includes(q));
  return invitations.map(invite=>{
    const status=invitationStatus(invite),members=(invite.memberIds||[invite.person_id]).map(id=>contacts.find(p=>p.id===id)?.name||'Unknown person');
    return `<details class="person invitation-row" name="invitations-${state.year}" data-print-invitation="${esc(invite.id)}"><summary class="invitation-summary"><span class="person-avatar">${icon('people')}</span><span class="invitation-heading"><strong>${esc(invite.addressedTo)}</strong><span>${members.length} ${members.length===1?'person':'people'} · Code to ${esc(invite.name)}</span></span><span class="badge ${status==='Invited'?'active-badge':''}">${status}</span><span class="invitation-expand"><span class="when-closed">More details</span><span class="when-open">Less details</span><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></span></summary><div class="invitation-options"><div class="invitation-meta"><p>Includes ${esc(members.join(' & '))}</p><p>Code to ${esc(invite.name)} · •••• ${esc(invite.phone.slice(-4))}</p><p>${invite.share_socials?'Instagram links shown':'Instagram links hidden'}</p></div><div class="actions"><button class="quiet" data-reset-downloads="${esc(invite.id)}">Reset download limits</button><button class="secondary" data-view-link="${esc(invite.id)}">${invite.has_link?'View link & QR':'Restore link & QR'}</button><button class="secondary" data-edit-invitation="${esc(invite.id)}">Edit invitation</button><button class="quiet" data-invite="${esc(invite.id)}">Create fresh link</button>${!invite.revoked_at?`<button class="quiet danger" data-revoke="${esc(invite.id)}">Revoke access</button>`:''}</div></div></details>`;
  }).join('')||'<div class="empty">No invitations found.<span>Create one for a person, couple, or household.</span></div>';
}
function sharing(){return `${head()}<div class="notice">One invitation, one QR code, one verification phone. Everyone included can view photos assigned to any person on that invitation. Creating or editing an invitation never sends a text.</div><section class="panel people-panel"><div class="row-head"><div><h2>Invitations <span class="badge">${state.people.length}</span></h2><a class="hint" href="#people" data-view="directory">Manage People directory</a></div><button class="button" id="new-invitation">+ Create invitation</button></div><label class="field"><span class="sr-only">Search invitations</span><input id="sharing-search" type="search" placeholder="Search invitations or people…" autocomplete="off"></label><div class="people-list" id="sharing-list">${sharingRows()}</div></section><p class="hint">Twilio trial verification contacts must still be verified in Twilio before receiving login codes. Invitation changes apply immediately; photo edits require publishing.</p>${continueFlow('preview',false)}`;}
function preview(){
  const issues=draftIssues();
  return `${head()}<section class="panel review-summary"><div><h2>Publication check</h2><p class="hint">${dirty?'Save your changes to review the latest draft.':state.publishedVersion===state.version?'This saved draft is already published.':state.publishedAt?'Publishing replaces the edition your invited friends see.':'Publish this scrapbook when you’re ready for invited friends to open it.'}</p></div><span class="badge ${issues.length||dirty?'changed':'active-badge'}">${issues.length?'Details needed':dirty?'Save needed':'Ready to review'}</span><div class="review-checks">${issues.length?issues.map(i=>`<a href="${taskHref(i.view)}" data-view="${i.view}">${icon('arrow')}${esc(i.text)}</a>`).join(''):`<span>${icon('check')} ${state.draft.photos.filter(p=>!p.hidden).length} included photos with descriptions and audiences${state.draft.photos.some(p=>p.hidden)?` · ${state.draft.photos.filter(p=>p.hidden).length} hidden`:''}</span><span>${icon('check')} Edition details complete${state.draft.stories.length?' · '+state.draft.stories.length+' stories':''}</span>`}</div></section>`;
}
function server(){return `${head()}<div class="panel server-empty"><span class="server-illustration">${icon('server')}</span><span class="badge">Not connected</span><h2>Your home server, at a glance.</h2><p class="lede">A dedicated place for your services, storage, and backups.<br>There’s no server connected yet, so no health data is available.</p><div class="server-capabilities"><div>${icon('server')}<strong>Service health</strong><span>Availability and resource usage</span></div><div>${icon('photos')}<strong>Storage</strong><span>Disk capacity and usage</span></div><div>${icon('review')}<strong>Backups</strong><span>Last run and backup status</span></div></div><p class="hint">Monitoring can be connected here when your home server is ready.</p></div>`;}
function previewFooter(shareSocials=false){
  const credit=(name,url)=>{
    try{const target=new URL(url);if(target.protocol==='https:'&&['instagram.com','www.instagram.com'].includes(target.hostname))return `<a href="${esc(target.href)}" target="_blank" rel="noopener noreferrer" aria-label="${name} on Instagram">${name}</a>`;}catch{}
    return name;
  };
  const links=shareSocials?scrapbookConfig.instagram:{};
  return `<footer class="preview-footer"><div class="footer-ornament" aria-hidden="true">${winterSnowflake}</div><div class="footer-ornament footer-ornament-bottom" aria-hidden="true">${winterSnowflake}</div><p class="footer-closing">Here’s to the next chapter—<br><em>and having you in it.</em></p><span>By ${credit('Aditya',links.aditya)} & ${credit('Angela',links.angela)}, with help from ${credit('Pixel',links.pixel)}</span></footer>`;
}
function previewMarkup(d){
  const chapter=personal=>d.photos.filter(p=>p.personal===personal).map(p=>`<figure><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async"><figcaption>${esc(p.caption)}${p.canSave?' · Original can be saved':''}</figcaption></figure>`).join('');
  return `<article class="preview"><div class="preview-opening-note"><span class="preview-edition-stamp"><img class="header-pixel" src="/pixel-santa.png" alt="Pixel wearing a Santa hat" width="369" height="400" decoding="async"><span class="kicker">${state.year} · ${esc(d.authors)}</span></span>${winterLights}</div><div class="recipient-greeting"><h1 class="recipient-name">Hey <strong>${esc(d.name)}</strong>,</h1><p class="recipient-welcome">we’re glad you’re here.</p></div><p class="prose">${esc(d.note)}</p><p><em>With love, ${esc(d.authors)}</em></p>${d.photos.some(p=>p.personal)?`<section aria-label="Photos selected for ${esc(d.name)}"><div class="gallery">${chapter(true)}</div></section>`:''}<h2>${esc(sharedHeading(d.sharedTitle))}</h2><div class="gallery">${chapter(false)}</div>${d.stories.map(s=>`<section><h2>${esc(s.title)}</h2><p class="prose">${esc(s.body)}</p></section>`).join('')}${previewFooter(d.shareSocials)}</article>`;
}
function previewOptions(){
  return `<option value="" ${!previewRecipient?'selected':''}>Shared photos only</option><optgroup label="Invitations">${state.people.map(i=>`<option value="invite:${esc(i.id)}" ${previewRecipient==='invite:'+i.id?'selected':''}>${esc(i.addressedTo)}</option>`).join('')}</optgroup><optgroup label="Individual people">${contacts.map(p=>`<option value="${esc(p.id)}" ${previewRecipient===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</optgroup>`;
}
const previewLoader=createPreviewLoader({
  load:({year,recipient},signal)=>requestApi(`editions/${year}/preview?`+(recipient.startsWith('invite:')?'invitation='+encodeURIComponent(recipient.slice(7)):'recipient='+encodeURIComponent(recipient)),undefined,signal),
  onLoading:()=>{previewData=null;byId('edition-preview').setAttribute('aria-busy','true');byId('edition-preview').innerHTML='<p class="preview-loading" role="status">Opening this edition…</p>';},
  onResult:data=>{previewData=data;byId('edition-preview').removeAttribute('aria-busy');byId('edition-preview').innerHTML=previewMarkup(data);},
  onError:error=>{byId('edition-preview').removeAttribute('aria-busy');byId('edition-preview').innerHTML=`<div class="preview-loading"><p class="error" role="alert">${esc(error.message)}</p><button class="secondary" id="retry-preview">Try again</button></div>`;byId('retry-preview').onclick=loadPreview;}
});
function loadPreview(){return previewLoader.show({year:state.year,recipient:previewRecipient});}
async function openPreview(){
  if(busy||pendingRequests||modal.open)return;
  try{
    if(dirty)await saveDraft();
    if(dirty)throw new Error('Your draft changed while saving. Save again to preview the latest changes.');
    if(view==='preview')render();
    modalReturnFocus=()=>byId('open-preview')?.focus({preventScroll:true});
    modal.classList.add('preview-dialog');
    showModal(`<div class="preview-dialog-header"><p class="kicker">${state.year} · Private draft</p><h2>Preview scrapbook</h2><p class="hint">Saved draft · No SMS sent · Nothing is published</p><label class="field"><span>Preview for</span><span class="select-control"><select id="preview-person">${previewOptions()}</select></span></label></div><div id="edition-preview" class="preview-dialog-body"></div>`);
    document.querySelector('.modal-close').setAttribute('aria-label','Close preview');
    byId('preview-person').onchange=event=>{previewRecipient=event.target.value;loadPreview();};
    await loadPreview();
  }catch(error){toast(error.message);}
}
function render(){
  updateEditionSummary();
  document.querySelectorAll('.sidebar [data-view]').forEach(link=>{
    if(link.dataset.view===view||((view==='home'||view==='new'||editionViews.includes(view))&&link.dataset.view==='scrapbooks'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  const section=editionViews.includes(view)?'Scrapbooks / '+state.year:pages[view].section;
  byId('breadcrumb').textContent=section+' / '+pages[view].title;
  document.title=pages[view].title+(editionViews.includes(view)?' · '+state.year:'')+' · Aditya';
  app.dataset.view=view;app.dataset.photoEditor=String(photoEditorOpen);
  app.innerHTML=({home,scrapbooks,articles,directory,new:newScrapbook,story,photos,sharing,preview,server}[view]||home)();updateBadge();bind();mountPrintAdmin({view,state,contacts,api,requestApi,mark,saveDraft,showModal,updateContacts,render,toast});
}
function closeNavigation(restoreFocus=false){document.body.classList.remove('nav-open');document.querySelector('.workspace').inert=false;byId('nav-toggle').setAttribute('aria-expanded','false');byId('nav-backdrop').hidden=true;if(restoreFocus)byId('nav-toggle').focus();}
function showValidationDialog(){
  const missing=missingPhotoDescriptions(),audiences=state.draft.photos.flatMap((p,index)=>!p.hidden&&personalModes.has(p.id)&&!p.recipients.length?[{photo:p,index}]:[]);
  const photoLabel=({photo,index})=>`Photo ${index+1} · ${esc(photo.caption.trim()||state.media.find(m=>m.id===photo.id)?.filename||'Untitled photo')}`;
  const other=draftIssues().filter(issue=>!/^Add descriptions to |^Choose recipients for /.test(issue.text));
  showModal(`<p class="kicker">Before we share</p><h2>A few little things to finish</h2><p class="hint">Choose an item to fix it. Nothing has been published.</p>${missing.length?`<h3 class="validation-heading">Accessibility descriptions</h3><ul class="validation-links">${missing.map(item=>`<li><button class="quiet" data-validation-photo="${esc(item.photo.id)}" data-validation-field="alt">${photoLabel(item)}</button></li>`).join('')}</ul>`:''}${audiences.length?`<h3 class="validation-heading">Choose people or hide these photos</h3><ul class="validation-links">${audiences.map(item=>`<li><button class="quiet" data-validation-photo="${esc(item.photo.id)}">${photoLabel(item)}</button></li>`).join('')}</ul>`:''}${other.length?`<h3 class="validation-heading">Scrapbook details</h3><ul class="validation-links">${other.map(issue=>`<li><button class="quiet" data-validation-view="${issue.view}">${esc(issue.text)}</button></li>`).join('')}</ul>`:''}<button class="secondary" id="close-validation">Keep editing</button>`);
  byId('close-validation').onclick=()=>modal.close();
  modalContent.querySelectorAll('[data-validation-photo]').forEach(button=>button.onclick=async()=>{const id=button.dataset.validationPhoto,field=button.dataset.validationField;modal.close();selectedPhotoId=id;photoFilter='all';photoEditorOpen=true;await navigate('photos');if(field==='alt')focusPhotoDescription(id);else byId('photo-inspector')?.scrollIntoView({block:'center',behavior:'instant'});});
  modalContent.querySelectorAll('[data-validation-view]').forEach(button=>button.onclick=async()=>{modal.close();await navigate(button.dataset.validationView);});
}
async function navigate(next,push=true,year=state?.year){
  if(!pages[next])next='home';
  if(busy||pendingRequests||modal.open){toast(modal.open?'Close the dialog before switching tasks.':'Wait for the current change to finish.');if(!push)history.replaceState(null,'',taskHref(view));return;}
  closeNavigation();rememberDraft();const generation=++navigationGeneration;
  const oldView=view,oldState=state;
  busy=true;updateBadge();
  try{
    if(next==='directory')contacts=(await requestApi('contacts')).people;
    if(editionViews.includes(next)){
      year=Number(year||editions[0]?.year);
      if(!Number.isInteger(year))next='scrapbooks';
      else if(state?.year!==year)await load(year);
    }
    if(generation!==navigationGeneration)return;
    if(next==='preview'&&draftIssues().length){busy=false;if(!push)history.replaceState(null,'',taskHref(view));showValidationDialog();return;}
    view=next;
    const hash=taskHref(next,year);if(push&&location.hash!==hash)history.pushState(null,'',hash);
    busy=false;render();window.scrollTo(0,0);app.focus({preventScroll:true});
  }catch(error){view=oldView;state=oldState;history.replaceState(null,'',taskHref(view));toast(error.message);}
  finally{busy=false;updateBadge();}
}
function bind(){
  app.querySelectorAll('[data-preview-edition]').forEach(b=>b.onclick=async()=>{await navigate('photos',true,Number(b.dataset.previewEdition));openPreview();});
  app.querySelectorAll('[data-photo-filter]').forEach(b=>b.onclick=()=>{photoFilter=b.dataset.photoFilter;render();});
  app.querySelectorAll('[data-select-photo]').forEach(b=>b.onclick=()=>{selectedPhotoId=b.dataset.selectPhoto;photoEditorOpen=true;render();if(innerWidth<=800)byId('photo-inspector')?.scrollIntoView({block:'start',behavior:'instant'});});
  byId('done-photo-edit')?.addEventListener('click',()=>{photoEditorOpen=false;render();app.querySelector(`[data-select-photo="${selectedPhotoId}"]`)?.focus({preventScroll:true});});
  byId('edition-picker')?.addEventListener('change',event=>{const previous=state.year;navigate(view,true,Number(event.target.value));event.target.value=String(previous);});
  byId('create-scrapbook')?.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;busy=true;
    try{
      const data=Object.fromEntries(new FormData(form));data.year=Number(data.year);data.title=`Scrapbook ${data.year}`;
      const result=await requestApi('editions',data);
      editions=(await requestApi('editions')).editions;busy=false;await navigate('story',true,result.year);
    }catch(error){byId('creation-error').textContent=error.message;button.disabled=false;}finally{busy=false;}
  });
  app.querySelectorAll('[data-continue]').forEach(button=>button.onclick=async()=>{try{await saveDraft();await navigate(button.dataset.continue);}catch(error){toast(error.message);}});

  byId('save-draft')?.addEventListener('click',()=>saveDraft().then(()=>{if(view==='preview')render();}).catch(e=>toast(e.message)));
  byId('publish')?.addEventListener('click',confirmPublish);
  app.querySelectorAll('[data-field]').forEach(input=>input.oninput=()=>{
    const photo=input.closest('[data-photo]'),story=input.closest('[data-story]');
    if(photo)state.draft.photos.find(p=>p.id===photo.dataset.photo)[input.dataset.field]=input.value;
    else if(story)state.draft.stories.find(s=>s.id===story.dataset.story)[input.dataset.field==='story-title'?'title':'body']=input.value;
    else state.draft[input.dataset.field]=input.value;mark();
    if(photo)updatePhotoValidation();
  });
  byId('add-story')?.addEventListener('click',()=>{state.draft.stories.push({id:crypto.randomUUID(),title:'',body:''});mark();render();app.querySelector('[data-story]:last-child input')?.focus();});
  app.querySelectorAll('[data-remove-story]').forEach(b=>b.onclick=()=>{state.draft.stories=state.draft.stories.filter(s=>s.id!==b.dataset.removeStory);mark();render();});
  app.querySelectorAll('[data-photo]').forEach(card=>{
    const p=state.draft.photos.find(p=>p.id===card.dataset.photo);
    card.querySelector('[data-audience]').onchange=e=>{if(e.target.value==='personal'){personalModes.add(p.id);p.audience='personal';}else{personalModes.delete(p.id);p.audience='shared';p.recipients=[];}mark();render();};
    card.querySelector('[data-toggle-hidden]').onclick=()=>{p.hidden=!p.hidden;mark();render();[...app.querySelectorAll('[data-photo]')].find(el=>el.dataset.photo===p.id)?.querySelector('[data-toggle-hidden]').focus({preventScroll:true});};
    const picker=card.querySelector('[data-picker]');
    if(picker)bindPeoplePicker(picker,{people:()=>contacts,selected:()=>p.recipients,status:accessStatus,toggle:id=>{p.recipients=p.recipients.includes(id)?p.recipients.filter(value=>value!==id):[...p.recipients,id];mark();},add:query=>addPerson({photoId:p.id,name:query})});
    card.querySelector('[data-remove-photo]').onclick=()=>{removedPhotos.set(`${state.year}/${p.id}`,structuredClone(p));state.draft.photos=state.draft.photos.filter(item=>item.id!==p.id);mark();render();};
    card.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const i=state.draft.photos.indexOf(p),j=i+(b.dataset.move==='up'?-1:1);[state.draft.photos[i],state.draft.photos[j]]=[state.draft.photos[j],state.draft.photos[i]];mark();render();});
  });
  for(const [id,hidden] of [['hide-all-photos',true],['unhide-all-photos',false]])byId(id)?.addEventListener('click',()=>{state.draft.photos.forEach(p=>p.hidden=hidden);mark();render();byId(id)?.focus({preventScroll:true});});
  app.querySelectorAll('[data-add-media]').forEach(b=>b.onclick=()=>{try{attachMedia(state.media.find(m=>m.id===b.dataset.addMedia));render();}catch(error){toast(error.message);}});
  app.querySelectorAll('[data-delete-media]').forEach(b=>b.onclick=()=>deleteMedia(b.dataset.deleteMedia));
  byId('retry-uploads')?.addEventListener('click',()=>uploadFiles(retryFilesByYear.get(state.year)||[]));
  app.querySelectorAll('[data-generate-previews]').forEach(button=>button.onclick=()=>generatePreviews(button.dataset.generatePreviews));
  byId('upload')?.addEventListener('change',event=>uploadFiles(Array.from(event.target.files||[])));
  const dropzone=byId('photo-dropzone');
  if(dropzone)bindPhotoDropzone(dropzone,{isBusy:()=>busy||pendingRequests>0||modal.open,onFiles:uploadFiles,onError:message=>{byId('upload-status').textContent=message;}});
  byId('add-contact')?.addEventListener('click',()=>addPerson());
  byId('directory-search')?.addEventListener('input',e=>{byId('directory-list').innerHTML=directoryRows(e.target.value);bindContactActions();});
  byId('sharing-search')?.addEventListener('input',e=>{byId('sharing-list').innerHTML=sharingRows(e.target.value);bindSharingActions();});
  bindContactActions();bindSharingActions();
  byId('open-preview')?.addEventListener('click',openPreview);
}
async function saveDraft(){
  if(busy)throw new Error('Wait for the current change to finish.');
  if(state.draft.photos.some(p=>!p.hidden&&personalModes.has(p.id)&&!p.recipients.length))throw new Error('Select at least one person for each included personal photo, or hide it until you’re ready.');
  const missingDescriptions=missingPhotoDescriptions();
  if(missingDescriptions.length){
    if(view!=='photos'&&!modal.open)await navigate('photos');
    updatePhotoValidation();const first=missingDescriptions[0];focusPhotoDescription(first.photo.id);
    const label=first.photo.caption.trim()||state.media.find(m=>m.id===first.photo.id)?.filename||'Untitled photo';
    throw new Error(`Photo ${first.index+1} (“${label}”) needs an accessibility description.${missingDescriptions.length>1?` ${missingDescriptions.length===2?'1 more photo also needs a description.':`${missingDescriptions.length-1} more photos also need descriptions.`}`:''}`);
  }
  const saveGeneration=editGeneration;busy=true;updateBadge();try{const result=await api('draft',{draft:state.draft,version:state.version});state.version=result.version;if(result.printInvitations)state.draft.printInvitations=result.printInvitations;if(result.printAddressKeys)state.draft.printAddressKeys=result.printAddressKeys;dirty=editGeneration!==saveGeneration;updateEditionSummary();toast('Draft saved. Your changes stay private until you publish.');}finally{busy=false;updateBadge();}
}
function showModal(html){modalContent.innerHTML=html;const title=modalContent.querySelector('h2');if(title){title.id='modal-title';modal.setAttribute('aria-labelledby','modal-title');}if(!modal.open)modal.showModal();}
let previewCloseTimer;
function closeModal(){
  if(!modal.open||modal.classList.contains('is-closing'))return;
  if(!modal.classList.contains('preview-dialog')||matchMedia('(prefers-reduced-motion: reduce)').matches){modal.close();return;}
  previewLoader.cancel();modal.classList.add('is-closing');previewCloseTimer=setTimeout(()=>modal.close(),220);
}
document.querySelector('.modal-close').onclick=closeModal;
modal.addEventListener('cancel',event=>{if(modal.classList.contains('preview-dialog')){event.preventDefault();closeModal();}});
modal.addEventListener('click',event=>{if(event.target===modal&&modal.classList.contains('preview-dialog')){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
modal.addEventListener('animationend',event=>{if(event.target===modal&&event.animationName==='preview-out')modal.close();});
modal.addEventListener('close',()=>{clearTimeout(previewCloseTimer);previewLoader.cancel();modal.classList.remove('preview-dialog','is-closing');document.querySelector('.modal-close').setAttribute('aria-label','Close dialog');inviteData=null;modalContent.innerHTML='';const restore=modalReturnFocus;modalReturnFocus=null;restore?.();});
function confirmPublish(){
  if(busy)return;
  if(draftIssues().length){toast('Complete the publication check before publishing.');return;}
  if(dirty){toast('Save your draft before publishing.');return;}
  showModal(`<p class="kicker">Publish ${state.year}</p><h2>Ready to share?</h2><p>Publishing makes ${state.year} the active scrapbook and closes guest access to every other year. Your invited friends will see the saved stories, captions, and photo assignments. Personal photos are shared with invitations that include any of the selected people.</p><p class="hint">${state.draft.photos.filter(p=>!p.hidden).length} included photos · ${state.draft.photos.filter(p=>p.hidden).length} hidden · ${state.draft.stories.length} stories</p><button class="button" id="confirm-publish">Publish this edition</button><p class="error" id="modal-error"></p>`);
  byId('confirm-publish').onclick=async e=>{e.target.disabled=true;try{const result=await api('publish',{version:state.version});state.publishedVersion=result.publishedVersion;state.isActive=true;for(const e of editions)e.isActive=e.year===state.year;for(const cached of draftCache.values())cached.state.isActive=cached.state.year===state.year;state.publishedAt=Math.floor(Date.now()/1000);modal.close();render();updateEditionSummary();toast(`Your ${state.year} scrapbook is published.`);}catch(error){byId('modal-error').textContent=error.message;e.target.disabled=false;}};
}
function bindContactActions(){app.querySelectorAll('[data-edit-contact]').forEach(button=>button.onclick=()=>editPerson(button.dataset.editContact));app.querySelectorAll('[data-delete-contact]').forEach(button=>button.onclick=()=>deletePerson(button.dataset.deleteContact));}
function bindSharingActions(){
  app.querySelectorAll('.invitation-row').forEach(row=>row.ontoggle=()=>{if(row.open)app.querySelectorAll('.invitation-row[open]').forEach(other=>{if(other!==row)other.open=false;});});
  app.querySelectorAll('[data-view-link]').forEach(button=>button.onclick=()=>viewInvitationLink(button.dataset.viewLink));
  byId('new-invitation')?.addEventListener('click',()=>editInvitation());
  app.querySelectorAll('[data-edit-invitation]').forEach(button=>button.onclick=()=>editInvitation(button.dataset.editInvitation));
  app.querySelectorAll('[data-invite]').forEach(button=>button.onclick=()=>confirmInvitation(button.dataset.invite));
  app.querySelectorAll('[data-reset-downloads]').forEach(button=>button.onclick=()=>resetDownloads(button.dataset.resetDownloads));
  app.querySelectorAll('[data-revoke]').forEach(button=>button.onclick=()=>confirmRevoke(button.dataset.revoke));
}
function addPerson({photoId='',name=''}={}){
  if(photoId)modalReturnFocus=()=>app.querySelector(`[data-picker="${photoId}"] .picker-summary`)?.focus();
  showModal(`<p class="kicker">People directory</p><h2>Add a person</h2><form id="person-form"><label class="field"><span>Name</span><input name="name" value="${esc(name)}" required maxlength="100" autocomplete="off"></label><label class="field"><span>Phone, optional · include country code</span><input name="phone" type="tel" placeholder="+1…" autocomplete="off"></label><p class="hint">Saves them to People${photoId?' and selects them for this photo':''}. Only the verification contact needs a phone number. This doesn’t invite them to a scrapbook or send a text.</p><button class="button">${photoId?'Add & select person':'Add person'}</button><p class="error" id="modal-error" role="alert"></p></form>`);
  byId('person-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
    try{
      const result=await contactApi('',Object.fromEntries(new FormData(form)));updateContacts(result.person);
      if(photoId){const photo=state.draft.photos.find(p=>p.id===photoId);photo.recipients=[...new Set([...photo.recipients,result.person.id])];mark();}
      modal.close();render();
      if(photoId)app.querySelector(`[data-picker="${photoId}"] .picker-summary`)?.focus();
      toast(photoId?'Person added and selected. Create their invitation in Sharing when ready.':'Person added. No invitation was created.');
    }catch(error){byId('modal-error').textContent=error.message;button.disabled=false;}
  };
}
function deletePerson(id){
 const person=contacts.find(p=>p.id===id);if(!person)return;
 showModal(`<p class="kicker">People directory</p><h2>Delete ${esc(person.name)}?</h2><p>This permanently removes their contact details and saved mailing address. People still used in a saved scrapbook or invitation cannot be deleted.</p><div class="actions"><button class="secondary" id="cancel-delete-person">Keep person</button><button class="button danger" id="confirm-delete-person">Delete person</button></div><p class="error" role="alert" id="delete-person-error"></p>`);
 byId('cancel-delete-person').onclick=()=>modal.close();
 byId('confirm-delete-person').onclick=async e=>{e.target.disabled=true;try{const references=[state,...[...draftCache.values()].map(c=>c.state)].filter(Boolean).some(s=>s.draft.photos.some(p=>p.recipients.includes(id)));if(references)throw new Error('This person is assigned to a photo in an open draft. Remove them from that photo and save the draft first.');await contactApi(`/${id}/delete`,{version:person.version});contacts=contacts.filter(p=>p.id!==id);modal.close();render();toast('Person deleted.');}catch(error){byId('delete-person-error').textContent=error.message;e.target.disabled=false;}};
}
function editPerson(id){
  const person=contacts.find(p=>p.id===id);
  showModal(`<p class="kicker">People directory</p><h2>Edit ${esc(person.name)}</h2><form id="person-form"><label class="field"><span>Name</span><input name="name" value="${esc(person.name)}" required maxlength="100" autocomplete="off"></label><label class="field"><span>Phone, optional · include country code</span><input name="phone" type="tel" value="${esc(person.phone)}" autocomplete="off"></label><p class="hint">Updates this person across all scrapbooks. Changing their verification phone signs out their invitations across all scrapbooks and cancels pending login codes. Existing invitation links stay the same.</p><button class="button">Save person</button><p class="error" id="modal-error" role="alert"></p></form>`);
  byId('person-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
    try{const result=await contactApi(`/${id}/details`,{...Object.fromEntries(new FormData(form)),version:person.version});updateContacts(result.person);modal.close();render();toast('Person updated across scrapbooks.');}
    catch(error){byId('modal-error').textContent=error.message;button.disabled=false;}
  };
}
function editInvitation(id=''){
  const invitation=state.people.find(i=>i.id===id),members=[...(invitation?.memberIds||[])];
  let contactId=invitation?.person_id||'',customGreeting=!!invitation;
  showModal(`<p class="kicker">Sharing · ${state.year}</p><h2>${invitation?'Edit invitation':'Create an invitation'}</h2><form id="invitation-form">${peoplePickerMarkup('invitation','Included people',{hint:'Everyone included shares access to photos assigned to any of them. Add missing people in the People workspace first.',allowAdd:false})}<label class="field"><span>Verification contact</span><span class="select-control"><select id="verification-contact" required></select></span></label><p class="hint">One person receives the login code. Select someone included above who has a phone number.</p><label class="field"><span>Addressed to</span><input id="addressed-to" name="addressedTo" value="${esc(invitation?.addressedTo||'')}" placeholder="Ben & Jerry" required maxlength="200"></label><label class="socials-toggle"><input id="share-socials" type="checkbox" ${invitation?.share_socials?'checked':''}><span><strong>Share our socials</strong><span>Show our Instagram links in the footer. Every invitation uses scrapbook.adityapatil.xyz.</span></span></label><div class="notice" id="invitation-summary"></div><p class="hint">${invitation?'Your existing invitation token stays the same. The socials setting only controls Instagram footer links; saved older links still work. Changing included people or the verification contact signs out this invitation’s sessions. Access changes immediately.':'Creates one shared invitation link and QR code. No text is sent.'}</p><button class="button">${invitation?'Save invitation':'Create invitation & QR'}</button><p class="error" id="modal-error" role="alert"></p></form>`);
  const greeting=byId('addressed-to'),contact=byId('verification-contact');
  function update(){
    const selected=members.map(id=>contacts.find(p=>p.id===id)).filter(Boolean),eligible=selected.filter(p=>p.phone);
    if(!eligible.some(p=>p.id===contactId))contactId=eligible[0]?.id||'';
    contact.innerHTML=eligible.length?eligible.map(p=>`<option value="${esc(p.id)}" ${contactId===p.id?'selected':''}>${esc(p.name)} · •••• ${esc(p.phone.slice(-4))}</option>`).join(''):'<option value="">Choose an included person with a phone</option>';
    if(!customGreeting)greeting.value=selected.map(p=>p.name).join(' & ');
    const verifier=eligible.find(p=>p.id===contactId);
    byId('invitation-summary').textContent=members.length?`For ${greeting.value||'your people'} · ${members.length} ${members.length===1?'person':'people'} included${verifier?' · Code to '+verifier.name:''}`:'Choose who this invitation is for.';
  }
  bindPeoplePicker(modalContent.querySelector('[data-picker]'),{people:()=>contacts,selected:()=>members,status:()=>'',toggle:id=>{const at=members.indexOf(id);if(at>=0)members.splice(at,1);else members.push(id);update();},add:()=>{}});
  contact.onchange=()=>{contactId=contact.value;update();};greeting.oninput=()=>{customGreeting=true;update();};update();
  byId('invitation-form').onsubmit=async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button.button');button.disabled=true;
    try{
      const data={memberIds:members,verificationContactId:contactId,addressedTo:greeting.value,shareSocials:byId('share-socials').checked,...(invitation?{version:invitation.version}:{})};
      const result=await api(invitation?`invitations/${id}/details`:'invitations',data);
      const name=greeting.value;await refreshPeople();
      if(invitation){modal.close();toast('Invitation updated. The existing link and QR still work.');}else await showInvitation(name,result.url);
    }catch(error){byId('modal-error').textContent=error.message;button.disabled=false;}
  };
}
async function refreshPeople(){const latest=await api('state');state.people=latest.people;previewData=null;updateEditionSummary();render();}
function confirmInvitation(id){const person=state.people.find(p=>p.id===id);showModal(`<p class="kicker">Invitation for ${esc(person.addressedTo)}</p><h2>Create a fresh link?</h2><p>This replaces their previous invitation and signs out their current sessions. It won’t send a text.</p><button class="button" id="create-invite">Create new invitation</button><p class="error" id="modal-error"></p>`);byId('create-invite').onclick=async e=>{e.target.disabled=true;try{const data=await api(`people/${id}/invite`,{});await refreshPeople();await showInvitation(person.addressedTo,data.url);}catch(error){byId('modal-error').textContent=error.message;e.target.disabled=false;}};}
function confirmRevoke(id){const person=state.people.find(p=>p.id===id);showModal(`<p class="kicker">Access for ${esc(person.addressedTo)}</p><h2>Close their invitation?</h2><p>Their link and current sessions will stop working immediately. You can create a new invitation later.</p><button class="button" id="confirm-revoke">Revoke access</button><p class="error" id="modal-error"></p>`);byId('confirm-revoke').onclick=async e=>{e.target.disabled=true;try{await api(`people/${id}/revoke`,{});await refreshPeople();modal.close();toast('Invitation and sessions revoked.');}catch(error){byId('modal-error').textContent=error.message;e.target.disabled=false;}};}
async function viewInvitationLink(id){
  const invite=state.people.find(i=>i.id===id);
  if(invite.has_link){
    try{const result=await api(`invitations/${id}/link`,{});await showInvitation(result.name,result.url);}catch(error){toast(error.message);}return;
  }
  showModal(`<p class="kicker">Invitation link</p><h2>Restore your original link</h2><p>Older invitation tokens were stored as hashes, so we can’t recreate them. Paste the original link once to store an encrypted copy and reopen its QR whenever you need. This keeps the same invitation and sessions.</p><form id="restore-link-form"><label class="field"><span>Original invitation link</span><input id="original-invitation-url" type="url" required autocomplete="off"></label><button class="button">Restore link & QR</button><p class="error" id="modal-error" role="alert"></p></form>`);
  byId('restore-link-form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;try{const result=await api(`invitations/${id}/link`,{url:byId('original-invitation-url').value});await refreshPeople();await showInvitation(result.name,result.url);}catch(error){byId('modal-error').textContent=error.message;button.disabled=false;}};
}
async function showInvitation(name,url){const qr=await QRCode.toDataURL(url,{width:700,margin:4,color:{dark:'#202529',light:'#f4eddf'}});inviteData={name,url,qr};showModal(`<p class="kicker">Just for ${esc(name)}</p><h2>A little invitation.</h2><img class="qr" src="${qr}" alt="Personalized invitation QR code"><label class="field"><span>Invitation link</span><input class="invitation-url" value="${esc(url)}" readonly></label><p class="hint">Reopen this link and QR from Sharing at any time. Your invitation token is stored encrypted.</p><div class="actions"><button class="button" id="copy-invite">Copy link</button><a class="secondary" href="${qr}" download="invitation.png">Save QR</a><button class="secondary" id="save-invite">Save link</button></div>`);byId('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('Invitation link copied.');}catch{modal.querySelector('input').select();toast('Select and copy the invitation link.');}};byId('save-invite').onclick=()=>download(new Blob([url+'\n'],{type:'text/plain'}),'invitation.txt');}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function resetDownloads(id){
  const invite=state.people.find(i=>i.id===id);
  showModal(`<p class="kicker">Downloads · ${esc(invite.addressedTo)}</p><h2>Reset download limits?</h2><p>Restores five original-file requests per photo for this invitation. Its link, login sessions, and photo access stay the same.</p><button class="button" id="reset-downloads">Reset limits</button><p class="error" id="modal-error" role="alert"></p>`);
  byId('reset-downloads').onclick=async event=>{event.target.disabled=true;try{await api(`invitations/${id}/downloads/reset`,{});modal.close();toast('Original download limits reset for this invitation.');}catch(error){byId('modal-error').textContent=error.message;event.target.disabled=false;}};
}
async function makePreviews(file){
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  async function encode(edge,quality){
    const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(!blob)throw new Error('The browser couldn’t prepare a photo preview.');return blob;
  }
  try{const [preview,viewer]=await Promise.all([encode(800,.78),encode(2400,.86)]);return {preview,viewer};}finally{bitmap.close();}
}
async function generatePreviews(id){
  if(busy||pendingRequests)return;busy=true;updateBadge();
  const media=state.media.find(m=>m.id===id);
  try{
    const response=await fetch(`/api/editions/${state.year}/media/${id}/${media.has_original?'original':'preview'}`);
    if(!response.ok)throw new Error('Could not read this photo. Refresh and try again.');
    const {preview,viewer}=await makePreviews(await response.blob()),form=new FormData();
    form.set('preview',preview,'grid.jpg');form.set('viewer',viewer,'viewer.jpg');await api(`media/${id}/previews`,form);
    media.has_viewer=true;mark();render();toast('Previews generated. Save and publish when ready; the live edition is unchanged.');
  }catch(error){toast(error.message);}finally{busy=false;updateBadge();}
}
function attachMedia(media){
  const existing=state.media.find(item=>item.id===media.id);
  if(existing)Object.assign(existing,media);else state.media.unshift(media);
  const remembered=removedPhotos.get(`${state.year}/${media.id}`);
  const added=addPhotoToDraft(state.draft,{...media,draftPhoto:remembered||media.draftPhoto});
  if(added){const photo=state.draft.photos.find(p=>p.id===media.id);if(photo.audience==='personal'||photo.recipients.length)personalModes.add(media.id);mark();}
  return added;
}
function deleteMedia(id){
  if(busy||pendingRequests)return;
  const media=state.media.find(m=>m.id===id);if(!media)return;
  showModal(`<p class="kicker">Photo library</p><h2>Delete this photo permanently?</h2><p>${esc(media.filename)}</p><p>This deletes the original and all its previews from private storage. It cannot be undone. Old sample photos are also removed from the sample gallery. Photos still used in a saved draft or published scrapbook cannot be deleted.</p><button class="button danger" id="confirm-delete-media">Delete permanently</button><p class="error" id="modal-error" role="alert"></p>`);
  byId('confirm-delete-media').onclick=async event=>{
    event.target.disabled=true;
    try{await api(`media/${id}/delete`,{confirm:true});state.media=state.media.filter(m=>m.id!==id);removedPhotos.delete(`${state.year}/${id}`);modal.close();render();toast('Photo and previews deleted permanently.');}
    catch(error){byId('modal-error').textContent=error.message;event.target.disabled=false;}
  };
}
async function uploadFiles(files){
  if(busy||pendingRequests||modal.open){toast('Wait for the current change to finish before adding more photos.');return;}
  const status=byId('upload-status'),input=byId('upload'),zone=byId('photo-dropzone');
  const error=photoUploadError(files);
  if(error){status.textContent=error;input.value='';return;}
  busy=true;updateBadge();input.disabled=true;zone.setAttribute('aria-busy','true');
  const completed=[];let failure,reused=0,skipped=0;const year=state.year;retryFilesByYear.delete(year);
  for(const [i,file] of files.entries()){
    try{
      const progress=percent=>{status.textContent=`Uploading ${i+1} of ${files.length}: ${file.name} · ${percent}%`;};
      const retry=attempt=>{status.textContent=`Checking ${i+1} of ${files.length}: ${file.name} · retry ${attempt} of 3…`;};
      status.textContent=`Checking ${i+1} of ${files.length}: ${file.name}`;
      const existing=await findUploadedPhoto(file,api,path=>sendApiRequest(`editions/${year}/${path}`,undefined,undefined,fetch,true),undefined,retry);
      if(existing.media){if(attachMedia(existing.media))reused++;else skipped++;continue;}
      if(state.draft.photos.length>=300)throw new Error('A scrapbook can contain up to 300 photos.');
      status.textContent=`Preparing ${i+1} of ${files.length}: ${file.name}`;
      const previews=await makePreviews(file);
      progress(0);
      const media=await uploadPhoto(file,previews,api,progress,undefined,retry,existing.hash);
      if(attachMedia(media)){if(media.reused)reused++;else completed.push(media);}else skipped++;
    }catch(error){failure=error;retryFilesByYear.set(year,files.slice(i));break;}
  }
  busy=false;render();byId('upload-status').textContent=failure?`${completed.length} uploaded, ${reused} reused, ${skipped} already in draft. ${failure.message} Use Retry remaining photos to continue.`:`${completed.length} uploaded, ${reused} reused, ${skipped} already in draft. Add descriptions and choose recipients, then save your draft.`;
}
// Prevent a file dropped outside the upload area from replacing the editor tab.
for(const type of ['dragover','drop'])document.addEventListener(type,event=>{
  if(view!=='photos'||!isFileDrag(event))return;event.preventDefault();
  if(type==='dragover')event.dataTransfer.dropEffect=event.target.closest?.('#photo-dropzone')&&!busy&&!pendingRequests&&!modal.open?'copy':'none';
});
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
document.addEventListener('click',event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();app.focus();return;}
  const link=event.target.closest('a[data-view]');
  if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();navigate(link.dataset.view,true,Number(link.dataset.year)||state?.year);
});
byId('nav-toggle').onclick=()=>{
  const open=!document.body.classList.contains('nav-open');
  document.body.classList.toggle('nav-open',open);document.querySelector('.workspace').inert=open;byId('nav-toggle').setAttribute('aria-expanded',String(open));byId('nav-backdrop').hidden=!open;
  if(open)document.querySelector('.sidebar [aria-current="page"]')?.focus();
};
document.addEventListener('keydown',event=>{
  if(!document.body.classList.contains('nav-open'))return;
  if(event.key==='Escape'){event.preventDefault();closeNavigation(true);}
  if(event.key==='Tab'){
    const links=[...byId('sidebar').querySelectorAll('a[href],button:not([disabled]),select')],first=links[0],last=links.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
byId('nav-backdrop').onclick=()=>closeNavigation(true);
byId('nav-close').onclick=()=>closeNavigation(true);

window.matchMedia('(min-width: 801px)').addEventListener('change',e=>{if(e.matches)closeNavigation();});
window.addEventListener('hashchange',()=>{const route=routeFromHash();if(route.view!==view||(route.year&&route.year!==state?.year))navigate(route.view,false,route.year);});
window.addEventListener('beforeunload',e=>{if(dirty||busy||pendingRequests||[...draftCache].some(([year,cached])=>year!==state?.year&&cached.dirty)){e.preventDefault();e.returnValue='';}});
try{const [catalogue,directory]=await Promise.all([requestApi('editions'),requestApi('contacts')]);editions=catalogue.editions;contacts=directory.people;const route=routeFromHash();if(editionViews.includes(route.view))await load(route.year||editions[0]?.year);render();}catch(error){app.innerHTML=`<p class="kicker">Private workspace</p><h1>Sign in to continue</h1><p class="lede">${esc(error.message)}</p><a class="button" href="/">Try again</a>`;}
