import {photoUploadError,isFileDrag,bindPhotoDropzone} from './photo-upload.js';
import QRCode from 'qrcode';
import {peoplePickerMarkup,bindPeoplePicker} from './people-picker.js';
const app=document.querySelector('#app'),modal=document.querySelector('#modal'),modalContent=document.querySelector('#modal-content');
let state,view=routeFromHash().view,editions=[],contacts=[],draftCache=new Map(),navigationGeneration=0,pendingRequests=0,dirty=false,busy=false,previewRecipient='',previewData=null,personalModes=new Set(),inviteData,editGeneration=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId=id=>document.getElementById(id);
async function requestApi(path,data){
  const multipart=data instanceof FormData;
  const response=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:multipart?{}:{'Content-Type':'application/json'},body:multipart?data:JSON.stringify(data)});
  let result;try{result=await response.json();}catch{throw new Error('Your sign-in may have expired. Refresh this page to sign in again.');}
  if(!response.ok)throw new Error(result.error||'Something went wrong. Please try again.');return result;
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
  if(summary)Object.assign(summary,{title:state.draft.title,authors:state.draft.authors,version:state.version,publishedVersion:state.publishedVersion,publishedAt:state.publishedAt,photoCount:state.draft.photos.length,storyCount:state.draft.stories.length,peopleCount:new Set(state.people.flatMap(p=>p.memberIds||[p.person_id])).size});
}
let toastTimer,modalReturnFocus;
function toast(text){const el=byId('toast');el.textContent=text;el.dataset.visible='true';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.dataset.visible='false',6500);}
function mark(){editGeneration++;dirty=true;previewData=null;updateBadge();}
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
  home:{title:'Overview',section:'Workspace'},
  scrapbooks:{title:'Scrapbooks',section:'Creative'},
  articles:{title:'Articles',section:'Creative'},
  new:{title:'Create a scrapbook',section:'Scrapbooks'},
  story:{title:'Write stories',section:'Scrapbook',description:'Set the scene, write an opening note, and add the moments you want to share.'},
  photos:{title:'Manage photos',section:'Scrapbook',description:'Upload originals, arrange your photos, and decide who can see each one.'},
  directory:{title:'People',section:'Creative',description:'Add someone once. Choose what to share with them in each scrapbook.'},
  sharing:{title:'Sharing',section:'Scrapbook',description:'Create scrapbook invitations for people in your directory. Photo assignments alone don’t grant access.'},
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
function missingInvitations(){return [...new Set(state.draft.photos.flatMap(p=>p.recipients))].filter(id=>accessStatus(id)!=='Invited');}
async function contactApi(path='',data){pendingRequests++;updateBadge();try{return await requestApi('contacts'+path,data);}finally{pendingRequests--;updateBadge();}}
function updateContacts(person){
  contacts=[...contacts.filter(p=>p.id!==person.id),person].sort((a,b)=>a.name.localeCompare(b.name));
  const states=new Set([state,...[...draftCache.values()].map(c=>c.state)].filter(Boolean));
  for(const cached of states)cached.people=cached.people.map(invite=>invite.person_id===person.id?{...invite,name:person.name,phone:person.phone,addressedTo:invite.addressed_to||person.name}:invite);
  previewData=null;for(const cached of draftCache.values())cached.previewData=null;
}
function draftStatus(){return dirty?'Unsaved changes':state.publishedVersion===state.version?'Published':'Saved draft';}
function draftIssues(){
  const d=state.draft,issues=[];
  const descriptions=d.photos.filter(p=>!p.alt.trim()).length;
  const recipients=d.photos.filter(p=>personalModes.has(p.id)&&!p.recipients.length).length;
  const stories=d.stories.filter(s=>!s.title.trim()||!s.body.trim()).length;
  if(!d.photos.length)issues.push({view:'photos',text:'Add at least one photo'});
  if(descriptions)issues.push({view:'photos',text:`Add descriptions to ${descriptions} photo${descriptions===1?'':'s'}`});
  if(recipients)issues.push({view:'photos',text:`Choose recipients for ${recipients} personal photo${recipients===1?'':'s'}`});
  if(stories)issues.push({view:'story',text:`Finish ${stories} stor${stories===1?'y':'ies'}`});
  if(['title','authors','intro','note','sharedTitle'].some(key=>!d[key].trim()))issues.push({view:'story',text:'Complete the edition details'});
  const missing=missingInvitations();
  if(missing.length)issues.push({view:'sharing',text:`Invite ${missing.length} selected ${missing.length===1?'person':'people'} to this scrapbook`});
  return issues;
}
function updateBadge(){
  if(!state)return;
  const el=byId('draft-badge');if(el){el.textContent=draftStatus();el.classList.toggle('changed',dirty);}
  document.querySelectorAll('[data-busy]').forEach(b=>b.disabled=busy||pendingRequests>0);
  const publish=byId('publish');if(publish)publish.disabled=busy||pendingRequests>0||dirty||draftIssues().length>0;
}
async function load(year){
  const cached=draftCache.get(year);
  if(cached){({state,dirty,personalModes,editGeneration,previewData,previewRecipient}=cached);return;}
  state=await requestApi(`editions/${year}/state`);dirty=false;editGeneration=0;previewRecipient='';previewData=null;
  personalModes=new Set(state.draft.photos.filter(p=>p.recipients.length).map(p=>p.id));
}
function field(label,key,value,textarea=false,extra=''){
  return `<label class="field"><span>${esc(label)}</span>${textarea?`<textarea data-field="${key}" ${extra}>${esc(value)}</textarea>`:`<input data-field="${key}" value="${esc(value)}" ${extra}>`}</label>`;
}
function head(){
  const p=pages[view],editing=['story','photos'].includes(view),review=view==='preview';
  return `${editionViews.includes(view)?scrapbookContext():''}<div class="page-head"><div><p class="kicker">${editionViews.includes(view)?'Scrapbook / '+state.year:p.section}</p><h1>${p.title}</h1><p class="lede">${p.description||''}</p></div>${editing||review?`<div class="page-actions"><span id="draft-badge" class="badge"></span><div class="actions"><button class="secondary" id="save-draft" data-busy>Save draft</button>${review?'<button class="button" id="publish" data-busy>Publish edition…</button>':`<a class="button" href="${taskHref('preview')}" data-view="preview">Review & publish ${icon('arrow')}</a>`}</div></div>`:view==='directory'?'<button class="button" id="add-contact">+ Add a person</button>':''}</div>${editionViews.includes(view)?flowSteps():''}`;
}
function editionCard(e){
  const cached=draftCache.get(e.year),unsaved=cached?.dirty,status=unsaved?'Unsaved changes':e.publishedVersion===e.version?'Published':'Draft';
  return `<a class="panel scrapbook-card" href="${taskHref('story',e.year)}" data-view="story" data-year="${e.year}"><div class="panel-heading"><span class="year-label">${e.year}</span><span class="badge ${status==='Published'?'active-badge':unsaved?'changed':''}">${status}</span></div><h2>${esc(e.title||'Untitled scrapbook')}</h2><p>${esc(e.authors)}</p><div class="scrapbook-card-bottom"><span>${e.photoCount} photos · ${e.storyCount} stories · ${e.peopleCount} people</span><span>Open scrapbook ${icon('arrow')}</span></div></a>`;
}
function workspaceRow(target,title,description,iconName,badge=''){
  return `<section class="panel system-summary"><span class="task-icon">${icon(iconName)}</span><div><div class="inline-heading"><h2>${title}</h2>${badge?`<span class="badge">${badge}</span>`:''}</div><p>${description}</p></div><a class="quiet" href="#${target}" data-view="${target}" aria-label="View ${title} workspace">View workspace ${icon('arrow')}</a></section>`;
}
function home(){return `<div class="page-head"><div><h1>Overview</h1></div></div><div class="workspace-list">${workspaceRow('scrapbooks','Scrapbooks','Create a yearly scrapbook and share it with your people.','photos')}${workspaceRow('server','Home server','Service health, storage, and backups will have a home here.','server','Not connected')}${workspaceRow('articles','Articles','A space to write and manage your blog posts.','write','Not set up')}</div>`;}
function scrapbookContext(){return `<div class="scrapbook-context"><a class="quiet" href="#scrapbooks" data-view="scrapbooks">${icon('arrow')} All scrapbooks</a><label class="scrapbook-switcher"><span>Editing scrapbook</span><span class="select-control"><select id="edition-picker" aria-label="Choose a scrapbook">${editions.map(e=>`<option value="${e.year}" ${state.year===e.year?'selected':''}>${e.year} · ${esc(e.title||'Untitled scrapbook')}</option>`).join('')}</select></span></label></div>`;}
function articles(){return `${head()}<section class="panel server-empty"><span class="server-illustration">${icon('write')}</span><span class="badge">Not set up</span><h2>A place for your writing.</h2><p class="lede">Your article workspace will live here.<br>Drafting and publishing aren’t connected yet.</p></section>`;}
function scrapbooks(){return `<div class="page-head"><div><p class="kicker">Your collection</p><h1>Scrapbooks</h1><p class="lede">One scrapbook for each year. Open an existing one or start the next.</p></div></div><div class="scrapbook-grid">${editions.map(editionCard).join('')}<a class="panel new-scrapbook-card" href="#new" data-view="new"><span>+</span><strong>Create a scrapbook</strong><p>Start a new year with an empty draft.</p></a></div>`;}
function newScrapbook(){
  let year=new Date().getFullYear();while(editions.some(e=>e.year===year)&&year<=2100)year++;
  year=Math.min(year,2100);
  return `${head()}<div class="creation-grid"><form id="create-scrapbook" class="panel form-panel"><div class="section-heading"><h2>Start with the basics</h2><p class="hint">You can edit the title and authors later. The year identifies this scrapbook.</p></div><label class="field"><span>Year</span><input name="year" type="number" min="2000" max="2100" step="1" value="${year}" required></label><label class="field"><span>Scrapbook title</span><input name="title" maxlength="150" value="Our year, ${year}." required></label><label class="field"><span>From</span><input name="authors" maxlength="100" value="Aditya & Angela" required></label><div class="actions"><button class="button" type="submit">Create draft & continue ${icon('arrow')}</button><a href="#scrapbooks" data-view="scrapbooks" class="quiet">Cancel</a></div><p class="error" id="creation-error" role="alert"></p></form><aside class="panel creation-guide"><p class="kicker">Build it step by step</p><h2>A year worth keeping.</h2><ol><li><strong>Write your stories</strong><span>Add an opening note and the moments that matter.</span></li><li><strong>Add your photos</strong><span>Arrange your memories and choose who sees each one.</span></li><li><strong>Choose what to share</strong><span>Create scrapbook invitations from your People directory.</span></li><li><strong>Review & publish</strong><span>See it through a friend’s eyes, then share when ready.</span></li></ol><p class="hint">Starts with no photos, stories, or invitations. Existing scrapbooks stay unchanged.</p></aside></div>`;
}
function flowSteps(){return `<nav class="flow-steps" aria-label="Scrapbook creation steps">${[['story','Stories'],['photos','Photos'],['sharing','Sharing'],['preview','Review & publish']].map(([task,label],i)=>`<a href="${taskHref(task)}" data-view="${task}" ${view===task?'aria-current="step"':''}><span>${i+1}</span>${label}</a>`).join('')}</nav>`;}
function continueFlow(next,save=true){return `<div class="flow-footer"><a class="quiet" href="#scrapbooks" data-view="scrapbooks">${icon('arrow')} All scrapbooks</a>${save?`<button class="button" data-continue="${next}" data-busy>Save & continue to ${next==='photos'?'photos':'sharing'} ${icon('arrow')}</button>`:`<a class="button" href="${taskHref(next)}" data-view="${next}">Continue to review ${icon('arrow')}</a>`}</div>`;}
function story(){const d=state.draft;return `${head()}<div class="notice">You’re editing a private draft. Save your work, then go to Review & publish when it’s ready.</div><div class="editor-width"><section class="panel form-panel"><div class="section-heading"><h2>Edition details</h2><p class="hint">The introduction your friends see when they open the scrapbook.</p></div><div class="form-grid">${field('Edition title','title',d.title,false,'maxlength="150"')}${field('From','authors',d.authors,false,'maxlength="100"')}</div>${field('Invitation introduction','intro',d.intro,true,'maxlength="1000"')}${field('Opening note','note',d.note,true,'class="long-note" maxlength="10000"')}${field('Shared chapter title','sharedTitle',d.sharedTitle,false,'maxlength="150"')}</section><section class="panel form-panel"><div class="row-head"><div><h2>Stories</h2><p class="hint">A trip, a milestone, or an ordinary day worth remembering.</p></div><button class="secondary" id="add-story" ${d.stories.length>=20?'disabled':''}>+ Add a story</button></div>${d.stories.map((s,i)=>`<article class="story-card" data-story="${esc(s.id)}"><div class="row-head"><span class="kicker">Story ${i+1}</span><button class="quiet danger" data-remove-story="${esc(s.id)}">Remove from draft</button></div>${field('Title','story-title',s.title,false,'maxlength="150"')}${field('Story','story-body',s.body,true,'maxlength="10000"')}</article>`).join('')||'<div class="empty">No stories yet.<span>Your opening note and photos are enough to start. Add a story whenever you have one.</span></div>'}</section></div>${continueFlow('photos')}`;}
function photoCard(p,i){const personal=personalModes.has(p.id),hasOriginal=!!state.media.find(m=>m.id===p.id)?.has_original;return `<article class="photo-editor" data-photo="${esc(p.id)}"><img src="/api/editions/${state.year}/media/${esc(p.id)}/preview" alt="${esc(p.alt||'Photo awaiting description')}" loading="lazy"><div class="photo-fields"><div class="photo-tools"><div class="actions"><button class="icon-button" data-move="up" aria-label="Move photo ${i+1} earlier" ${i===0?'disabled':''}>↑</button><button class="icon-button" data-move="down" aria-label="Move photo ${i+1} later" ${i===state.draft.photos.length-1?'disabled':''}>↓</button></div><button class="quiet danger" data-remove-photo>Remove from draft</button></div>${field('Caption','caption',p.caption,false,'maxlength="500"')}${field('Describe the photo for accessibility','alt',p.alt,false,'maxlength="500"')}<label class="field"><span>Who can see this photo?</span><span class="select-control"><select data-audience><option value="shared" ${!personal?'selected':''}>Everyone invited</option><option value="personal" ${personal?'selected':''}>Selected people</option></select></span></label><p class="hint">${personal?(hasOriginal?'Invitations including a selected person can view and save the original.':'Invitations including a selected person can view this sample. No original is available.'):'Everyone invited can view the preview. The original stays private.'}</p>${personal?peoplePickerMarkup(p.id,`People for photo ${i+1}`):''}</div></article>`;}
function photos(){const used=new Set(state.draft.photos.map(p=>p.id)),unused=state.media.filter(m=>!used.has(m.id));return `${head()}<div class="row-head"><div><h2>Photos & little moments</h2><p class="hint">Arrange the photos, add their stories, and choose who gets each one.</p></div><span class="badge">${state.draft.photos.length} photos</span></div><div class="upload-zone" id="photo-dropzone" role="group" aria-label="Add original photos" aria-describedby="upload-hint upload-status"><div><p>Drop photos here, or choose files</p><span class="hint" id="upload-hint">JPEG, PNG, or WebP · up to 25 MB each<br>Originals keep their metadata. Previews are smaller and omit EXIF.</span></div><input id="upload" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple aria-label="Upload original photos"></div><p id="upload-status" role="status" aria-live="polite" aria-atomic="true"></p><div class="photo-grid">${state.draft.photos.map(photoCard).join('')||'<div class="empty">Your first photo goes here.</div>'}</div>${unused.length?`<section class="library"><h3>Already uploaded</h3><p class="hint">Removed photos stay here so you can add them back. They aren’t published unless they’re in the draft.</p><div class="library-items">${unused.map(m=>`<button data-add-media="${esc(m.id)}" aria-label="Add ${esc(m.filename)} to draft"><img src="/api/editions/${state.year}/media/${esc(m.id)}/preview" alt="">${esc(m.filename)}<br>+ Add to draft</button>`).join('')}</div></section>`:''}${continueFlow('sharing')}`;}
function directoryRows(query=''){
  const matches=contacts.filter(p=>(p.name+' '+(p.phone||'')).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return matches.map(p=>`<article class="person"><div class="person-identity"><span class="person-avatar">${esc(p.name.slice(0,1).toUpperCase())}</span><div><strong>${esc(p.name)}</strong><p>${esc(p.phone||'No phone number · Can join a shared invitation')}</p></div></div><button class="secondary" data-edit-contact="${esc(p.id)}">Edit details</button></article>`).join('')||'<div class="empty">No people found.<span>Add someone to your directory, or try a different search.</span></div>';
}
function directory(){return `${head()}<div class="notice">Adding a person never sends a message or grants scrapbook access. Invitations are managed separately in each scrapbook.</div><section class="panel people-panel"><div class="row-head"><h2>Your people <span class="badge">${contacts.length}</span></h2><label class="directory-search"><span class="sr-only">Search people</span><input id="directory-search" type="search" placeholder="Search people…" autocomplete="off"></label></div><div class="people-list" id="directory-list">${directoryRows()}</div></section>`;}
function invitationStatus(invite){return invite.revoked_at?'Revoked':invite.expires_at<=Date.now()/1000?'Expired':'Invited';}
function sharingRows(query=''){
  const q=query.toLocaleLowerCase();
  const invitations=state.people.filter(i=>(i.addressedTo+' '+i.name+' '+i.phone+' '+(i.memberIds||[]).map(id=>contacts.find(p=>p.id===id)?.name||'').join(' ')).toLocaleLowerCase().includes(q));
  return invitations.map(invite=>{
    const status=invitationStatus(invite),members=(invite.memberIds||[invite.person_id]).map(id=>contacts.find(p=>p.id===id)?.name||'Unknown person');
    return `<article class="person invitation-row"><div class="person-identity"><span class="person-avatar">${icon('people')}</span><div><strong>${esc(invite.addressedTo)}</strong><p>Includes ${esc(members.join(' & '))}</p><p>Code to ${esc(invite.name)} · •••• ${esc(invite.phone.slice(-4))}</p></div></div><span class="badge ${status==='Invited'?'active-badge':''}">${status}</span><div class="actions"><button class="secondary" data-edit-invitation="${esc(invite.id)}">Edit invitation</button><button class="quiet" data-invite="${esc(invite.id)}">Create fresh link</button>${!invite.revoked_at?`<button class="quiet danger" data-revoke="${esc(invite.id)}">Revoke access</button>`:''}</div></article>`;
  }).join('')||'<div class="empty">No invitations found.<span>Create one for a person, couple, or household.</span></div>';
}
function sharing(){return `${head()}<div class="notice">One invitation, one QR code, one verification phone. Everyone included can view photos assigned to any person on that invitation. Creating or editing an invitation never sends a text.</div><section class="panel people-panel"><div class="row-head"><div><h2>Invitations <span class="badge">${state.people.length}</span></h2><a class="hint" href="#people" data-view="directory">Manage People directory</a></div><button class="button" id="new-invitation">+ Create invitation</button></div><label class="field"><span class="sr-only">Search invitations</span><input id="sharing-search" type="search" placeholder="Search invitations or people…" autocomplete="off"></label><div class="people-list" id="sharing-list">${sharingRows()}</div></section><p class="hint">Twilio trial verification contacts must still be verified in Twilio before receiving login codes. Invitation changes apply immediately; photo edits require publishing.</p>${continueFlow('preview',false)}`;}
function preview(){
  const issues=draftIssues();
  return `${head()}<section class="panel review-summary"><div><h2>Publication check</h2><p class="hint">${dirty?'Save your changes to review the latest draft.':state.publishedVersion===state.version?'This saved draft is already published.':state.publishedAt?'Publishing replaces the edition your invited friends see.':'Publish this scrapbook when you’re ready for invited friends to open it.'}</p></div><span class="badge ${issues.length||dirty?'changed':'active-badge'}">${issues.length?'Details needed':dirty?'Save needed':'Ready to review'}</span><div class="review-checks">${issues.length?issues.map(i=>`<a href="${taskHref(i.view)}" data-view="${i.view}">${icon('arrow')}${esc(i.text)}</a>`).join(''):`<span>${icon('check')} ${state.draft.photos.length} photos with descriptions and audiences</span><span>${icon('check')} Edition details complete${state.draft.stories.length?' · '+state.draft.stories.length+' stories':''}</span>`}</div></section><section class="panel preview-panel"><div class="section-heading"><h2>Preview as a friend</h2><p class="hint">Shows the saved draft. No text is sent and no recipient session is created.</p></div><div class="preview-controls"><label class="field"><span>Preview for</span><span class="select-control"><select id="preview-person"><option value="">Shared photos only</option><optgroup label="Invitations">${state.people.map(i=>`<option value="invite:${esc(i.id)}" ${previewRecipient==='invite:'+i.id?'selected':''}>${esc(i.addressedTo)}</option>`).join('')}</optgroup><optgroup label="Individual people">${contacts.map(p=>`<option value="${esc(p.id)}" ${previewRecipient===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</optgroup></select></span></label><button class="secondary" id="load-preview" data-busy>${dirty?'Save draft & preview':'Open preview'}</button></div><div id="edition-preview">${previewData?previewMarkup(previewData):'<div class="empty preview-empty">Choose a recipient and open the preview.<span>Check which photos they’ll see before publishing.</span></div>'}</div></section>`;
}
function server(){return `${head()}<div class="panel server-empty"><span class="server-illustration">${icon('server')}</span><span class="badge">Not connected</span><h2>Your home server, at a glance.</h2><p class="lede">A dedicated place for your services, storage, and backups.<br>There’s no server connected yet, so no health data is available.</p><div class="server-capabilities"><div>${icon('server')}<strong>Service health</strong><span>Availability and resource usage</span></div><div>${icon('photos')}<strong>Storage</strong><span>Disk capacity and usage</span></div><div>${icon('review')}<strong>Backups</strong><span>Last run and backup status</span></div></div><p class="hint">Monitoring can be connected here when your home server is ready.</p></div>`;}
function previewMarkup(d){const chapter=personal=>d.photos.filter(p=>p.personal===personal).map(p=>`<figure><img src="${esc(p.src)}" alt="${esc(p.alt)}"><figcaption>${esc(p.caption)}${p.canSave?' · Original can be saved':''}</figcaption></figure>`).join('');return `<article class="preview"><p class="kicker">${state.year} · ${esc(d.authors)}</p><h1>${esc(d.title)}</h1><p>Hey ${esc(d.name)}, we’re glad you’re here.</p><p class="prose">${esc(d.note)}</p><p><em>With love, ${esc(d.authors)}</em></p>${d.photos.some(p=>p.personal)?`<h2>For you, ${esc(d.name)}</h2><div class="gallery">${chapter(true)}</div>`:''}<h2>${esc(d.sharedTitle)}</h2><div class="gallery">${chapter(false)}</div>${d.stories.map(s=>`<section><h2>${esc(s.title)}</h2><p class="prose">${esc(s.body)}</p></section>`).join('')}</article>`;}
function render(){
  updateEditionSummary();
  document.querySelectorAll('.sidebar [data-view]').forEach(link=>{
    if(link.dataset.view===view||((view==='new'||editionViews.includes(view))&&link.dataset.view==='scrapbooks'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  const section=editionViews.includes(view)?'Scrapbooks / '+state.year:pages[view].section;
  byId('breadcrumb').textContent=section+' / '+pages[view].title;
  document.title=pages[view].title+(editionViews.includes(view)?' · '+state.year:'')+' · Aditya';
  app.innerHTML=({home,scrapbooks,articles,directory,new:newScrapbook,story,photos,sharing,preview,server}[view]||home)();updateBadge();bind();
}
function closeNavigation(restoreFocus=false){document.body.classList.remove('nav-open');document.querySelector('.workspace').inert=false;byId('nav-toggle').setAttribute('aria-expanded','false');byId('nav-backdrop').hidden=true;if(restoreFocus)byId('nav-toggle').focus();}
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
    view=next;
    const hash=taskHref(next,year);if(push&&location.hash!==hash)history.pushState(null,'',hash);
    busy=false;render();window.scrollTo(0,0);app.focus({preventScroll:true});
  }catch(error){view=oldView;state=oldState;history.replaceState(null,'',taskHref(view));toast(error.message);}
  finally{busy=false;updateBadge();}
}
function bind(){
  byId('edition-picker')?.addEventListener('change',event=>{const previous=state.year;navigate(view,true,Number(event.target.value));event.target.value=String(previous);});
  byId('create-scrapbook')?.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;busy=true;
    try{
      const data=Object.fromEntries(new FormData(form));data.year=Number(data.year);
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
  });
  byId('add-story')?.addEventListener('click',()=>{state.draft.stories.push({id:crypto.randomUUID(),title:'',body:''});mark();render();app.querySelector('[data-story]:last-child input')?.focus();});
  app.querySelectorAll('[data-remove-story]').forEach(b=>b.onclick=()=>{state.draft.stories=state.draft.stories.filter(s=>s.id!==b.dataset.removeStory);mark();render();});
  app.querySelectorAll('[data-photo]').forEach(card=>{
    const p=state.draft.photos.find(p=>p.id===card.dataset.photo);
    card.querySelector('[data-audience]').onchange=e=>{if(e.target.value==='personal')personalModes.add(p.id);else{personalModes.delete(p.id);p.recipients=[];}mark();render();};
    const picker=card.querySelector('[data-picker]');
    if(picker)bindPeoplePicker(picker,{people:()=>contacts,selected:()=>p.recipients,status:accessStatus,toggle:id=>{p.recipients=p.recipients.includes(id)?p.recipients.filter(value=>value!==id):[...p.recipients,id];mark();},add:query=>addPerson({photoId:p.id,name:query})});
    card.querySelector('[data-remove-photo]').onclick=()=>{state.draft.photos=state.draft.photos.filter(item=>item.id!==p.id);mark();render();};
    card.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const i=state.draft.photos.indexOf(p),j=i+(b.dataset.move==='up'?-1:1);[state.draft.photos[i],state.draft.photos[j]]=[state.draft.photos[j],state.draft.photos[i]];mark();render();});
  });
  app.querySelectorAll('[data-add-media]').forEach(b=>b.onclick=()=>{state.draft.photos.push({id:b.dataset.addMedia,caption:'',alt:'',recipients:[]});mark();render();});
  byId('upload')?.addEventListener('change',event=>uploadFiles(Array.from(event.target.files||[])));
  const dropzone=byId('photo-dropzone');
  if(dropzone)bindPhotoDropzone(dropzone,{isBusy:()=>busy||pendingRequests>0||modal.open,onFiles:uploadFiles,onError:message=>{byId('upload-status').textContent=message;}});
  byId('add-contact')?.addEventListener('click',()=>addPerson());
  byId('directory-search')?.addEventListener('input',e=>{byId('directory-list').innerHTML=directoryRows(e.target.value);bindContactActions();});
  byId('sharing-search')?.addEventListener('input',e=>{byId('sharing-list').innerHTML=sharingRows(e.target.value);bindSharingActions();});
  bindContactActions();bindSharingActions();
  byId('preview-person')?.addEventListener('change',e=>{previewRecipient=e.target.value;previewData=null;byId('edition-preview').innerHTML='';});
  byId('load-preview')?.addEventListener('click',async()=>{try{if(dirty)await saveDraft();previewData=await api('preview?'+(previewRecipient.startsWith('invite:')?'invitation='+encodeURIComponent(previewRecipient.slice(7)):'recipient='+encodeURIComponent(previewRecipient)));render();}catch(e){toast(e.message);}});
}
async function saveDraft(){
  if(busy)throw new Error('Wait for the current change to finish.');
  if(state.draft.photos.some(p=>personalModes.has(p.id)&&!p.recipients.length))throw new Error('Select at least one person for every personal photo.');
  if(state.draft.photos.some(p=>!p.alt.trim()))throw new Error('Add an accessibility description for each photo before saving.');
  const saveGeneration=editGeneration;busy=true;updateBadge();try{const result=await api('draft',{draft:state.draft,version:state.version});state.version=result.version;dirty=editGeneration!==saveGeneration;updateEditionSummary();toast('Draft saved. Your changes stay private until you publish.');}finally{busy=false;updateBadge();}
}
function showModal(html){modalContent.innerHTML=html;const title=modalContent.querySelector('h2');if(title){title.id='modal-title';modal.setAttribute('aria-labelledby','modal-title');}if(!modal.open)modal.showModal();}
document.querySelector('.modal-close').onclick=()=>modal.close();
modal.addEventListener('close',()=>{inviteData=null;modalContent.innerHTML='';const restore=modalReturnFocus;modalReturnFocus=null;restore?.();});
function confirmPublish(){
  if(busy)return;
  if(draftIssues().length){toast('Complete the publication check before publishing.');return;}
  if(dirty){toast('Save your draft before publishing.');return;}
  showModal(`<p class="kicker">Publish ${state.year}</p><h2>Ready to share?</h2><p>Your invited friends will see the saved stories, captions, and photo assignments. Personal photos are shared with invitations that include any of the selected people.</p><p class="hint">${state.draft.photos.length} photos · ${state.draft.stories.length} stories</p><button class="button" id="confirm-publish">Publish this edition</button><p class="error" id="modal-error"></p>`);
  byId('confirm-publish').onclick=async e=>{e.target.disabled=true;try{const result=await api('publish',{version:state.version});state.publishedVersion=result.publishedVersion;state.publishedAt=Math.floor(Date.now()/1000);modal.close();render();updateEditionSummary();toast(`Your ${state.year} scrapbook is published.`);}catch(error){byId('modal-error').textContent=error.message;e.target.disabled=false;}};
}
function bindContactActions(){app.querySelectorAll('[data-edit-contact]').forEach(button=>button.onclick=()=>editPerson(button.dataset.editContact));}
function bindSharingActions(){
  byId('new-invitation')?.addEventListener('click',()=>editInvitation());
  app.querySelectorAll('[data-edit-invitation]').forEach(button=>button.onclick=()=>editInvitation(button.dataset.editInvitation));
  app.querySelectorAll('[data-invite]').forEach(button=>button.onclick=()=>confirmInvitation(button.dataset.invite));
  app.querySelectorAll('[data-revoke]').forEach(button=>button.onclick=()=>confirmRevoke(button.dataset.revoke));
}
function addPerson({photoId='',name=''}={}){
  if(photoId)modalReturnFocus=()=>app.querySelector(`[data-picker="${photoId}"] .picker-input`)?.focus();
  showModal(`<p class="kicker">People directory</p><h2>Add a person</h2><form id="person-form"><label class="field"><span>Name</span><input name="name" value="${esc(name)}" required maxlength="100" autocomplete="off"></label><label class="field"><span>Phone, optional · include country code</span><input name="phone" type="tel" placeholder="+1…" autocomplete="off"></label><p class="hint">Saves them to People${photoId?' and selects them for this photo':''}. Only the verification contact needs a phone number. This doesn’t invite them to a scrapbook or send a text.</p><button class="button">${photoId?'Add & select person':'Add person'}</button><p class="error" id="modal-error" role="alert"></p></form>`);
  byId('person-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
    try{
      const result=await contactApi('',Object.fromEntries(new FormData(form)));updateContacts(result.person);
      if(photoId){const photo=state.draft.photos.find(p=>p.id===photoId);photo.recipients=[...new Set([...photo.recipients,result.person.id])];mark();}
      modal.close();render();
      if(photoId)app.querySelector(`[data-picker="${photoId}"] .picker-input`)?.focus();
      toast(photoId?'Person added and selected. Create their invitation in Sharing when ready.':'Person added. No invitation was created.');
    }catch(error){byId('modal-error').textContent=error.message;button.disabled=false;}
  };
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
  showModal(`<p class="kicker">Sharing · ${state.year}</p><h2>${invitation?'Edit invitation':'Create an invitation'}</h2><form id="invitation-form">${peoplePickerMarkup('invitation','Included people',{hint:'Everyone included shares access to photos assigned to any of them. Add missing people in the People workspace first.',allowAdd:false})}<label class="field"><span>Verification contact</span><span class="select-control"><select id="verification-contact" required></select></span></label><p class="hint">One person receives the login code. Select someone included above who has a phone number.</p><label class="field"><span>Addressed to</span><input id="addressed-to" name="addressedTo" value="${esc(invitation?.addressedTo||'')}" placeholder="Ben & Jerry" required maxlength="200"></label><div class="notice" id="invitation-summary"></div><p class="hint">${invitation?'Your existing QR code and link stay the same. Changing included people or the verification contact signs out this invitation’s sessions. Access changes immediately.':'Creates one shared invitation link and QR code. No text is sent.'}</p><button class="button">${invitation?'Save invitation':'Create invitation & QR'}</button><p class="error" id="modal-error" role="alert"></p></form>`);
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
      const data={memberIds:members,verificationContactId:contactId,addressedTo:greeting.value,...(invitation?{version:invitation.version}:{})};
      const result=await api(invitation?`invitations/${id}/details`:'invitations',data);
      const name=greeting.value;await refreshPeople();
      if(invitation){modal.close();toast('Invitation updated. The existing link and QR still work.');}else await showInvitation(name,result.url);
    }catch(error){byId('modal-error').textContent=error.message;button.disabled=false;}
  };
}
async function refreshPeople(){const latest=await api('state');state.people=latest.people;previewData=null;updateEditionSummary();render();}
function confirmInvitation(id){const person=state.people.find(p=>p.id===id);showModal(`<p class="kicker">Invitation for ${esc(person.addressedTo)}</p><h2>Create a fresh link?</h2><p>This replaces their previous invitation and signs out their current sessions. It won’t send a text.</p><button class="button" id="create-invite">Create new invitation</button><p class="error" id="modal-error"></p>`);byId('create-invite').onclick=async e=>{e.target.disabled=true;try{const data=await api(`people/${id}/invite`,{});await refreshPeople();await showInvitation(person.addressedTo,data.url);}catch(error){byId('modal-error').textContent=error.message;e.target.disabled=false;}};}
function confirmRevoke(id){const person=state.people.find(p=>p.id===id);showModal(`<p class="kicker">Access for ${esc(person.addressedTo)}</p><h2>Close their invitation?</h2><p>Their link and current sessions will stop working immediately. You can create a new invitation later.</p><button class="button" id="confirm-revoke">Revoke access</button><p class="error" id="modal-error"></p>`);byId('confirm-revoke').onclick=async e=>{e.target.disabled=true;try{await api(`people/${id}/revoke`,{});await refreshPeople();modal.close();toast('Invitation and sessions revoked.');}catch(error){byId('modal-error').textContent=error.message;e.target.disabled=false;}};}
async function showInvitation(name,url){const qr=await QRCode.toDataURL(url,{width:700,margin:4,color:{dark:'#202529',light:'#f4eddf'}});inviteData={name,url,qr};showModal(`<p class="kicker">Just for ${esc(name)}</p><h2>A little invitation.</h2><img class="qr" src="${qr}" alt="Personalized invitation QR code"><label class="field"><span>Invitation link</span><input class="invitation-url" value="${esc(url)}" readonly></label><p class="hint">Save this link now. We don’t retain the readable invitation token.</p><div class="actions"><button class="button" id="copy-invite">Copy link</button><a class="secondary" href="${qr}" download="invitation.png">Save QR</a><button class="secondary" id="save-invite">Save link</button></div>`);byId('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('Invitation link copied.');}catch{modal.querySelector('input').select();toast('Select and copy the invitation link.');}};byId('save-invite').onclick=()=>download(new Blob([url+'\n'],{type:'text/plain'}),'invitation.txt');}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function makePreview(file){
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob)throw new Error('The browser couldn’t prepare a preview for this photo.');return blob;
}
async function uploadFiles(files){
  if(busy||pendingRequests||modal.open){toast('Wait for the current change to finish before adding more photos.');return;}
  const status=byId('upload-status'),input=byId('upload'),zone=byId('photo-dropzone');
  const error=photoUploadError(files,state.draft.photos.length);
  if(error){status.textContent=error;input.value='';return;}
  busy=true;updateBadge();input.disabled=true;zone.setAttribute('aria-busy','true');
  const completed=[];let failure;
  for(const [i,file] of files.entries()){
    try{status.textContent=`Uploading ${i+1} of ${files.length}: ${file.name}`;
      const preview=await makePreview(file),form=new FormData();form.set('original',file);form.set('preview',preview,'preview.jpg');const media=await api('upload',form);completed.push(media);state.media.unshift(media);state.draft.photos.push({id:media.id,caption:'',alt:'',recipients:[]});mark();
    }catch(error){failure=error;break;}
  }
  busy=false;render();byId('upload-status').textContent=failure?`${completed.length} uploaded. ${failure.message}`:`${completed.length} uploaded. Add descriptions and choose recipients, then save your draft.`;
}
// Prevent a file dropped outside the upload area from replacing the editor tab.
for(const type of ['dragover','drop'])document.addEventListener(type,event=>{
  if(view!=='photos'||!isFileDrag(event))return;event.preventDefault();
  if(type==='dragover')event.dataTransfer.dropEffect=event.target.closest?.('#photo-dropzone')&&!busy&&!pendingRequests&&!modal.open?'copy':'none';
});
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
document.addEventListener('click',event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();app.focus();return;}
  const link=event.target.closest('[data-view]');
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
