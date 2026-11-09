const app = document.querySelector('#app');
const dialog = document.querySelector('#photo');
const save = document.querySelector('#save');
let preparedFile, selected, journal, saveMode = 'share', generation = 0;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, data) {
  const response = await fetch('/api/' + path, data === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Please try again.');
  return result;
}
function applyBrand(authors='Aditya & Angela') { document.querySelector('.signature').textContent=authors.toLowerCase()+'.'; document.title='2026 · '+authors; const footer=document.querySelector('footer > span');footer.textContent='Made with love, '+authors; }
function titleMarkup(title) { return !title || title==='A year in little moments.' ? 'A year in<br><em>little moments.</em>' : escape(title); }
function message(error) { app.innerHTML = `<section class="entry"><p class="kicker">A private edition</p><h1>A little<br><em>patience.</em></h1><p>${escape(error.message)}</p><button class="text-button" id="retry">Try again</button></section>`; document.querySelector('#retry').onclick = start; }
async function start() {
  try {
    // Invitation secrets travel in the fragment, never the request URL or Referer.
    const raw = location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(raw)) { history.replaceState(null, '', location.pathname); await api('open', {token:raw}); }
    try { journal = await api('journal'); showJournal(); return; } catch {}
    const invite = await api('invitation');
    applyBrand(invite.authors);
    app.innerHTML = `<section class="entry"><p class="kicker">A little something for ${escape(invite.name)}</p><h1>${titleMarkup(invite.title)}</h1><p class="intro">${escape(invite.intro || "A few places, some familiar faces, and the everyday things worth keeping. We’d love to share them with you.")}</p><p>We’ll send a code to your phone ending in <strong>${escape(invite.phoneHint)}</strong>.</p><button class="button" id="send">Text me a code →</button><p class="error" role="alert" id="error"></p><p class="signoff">With love, ${escape(invite.authors || "Aditya & Angela")}</p></section>`;
    document.querySelector('#send').onclick = async e => { e.target.disabled = true; try { await api('send', {}); showCode(invite); } catch (error) { document.querySelector('#error').textContent = error.message; e.target.disabled = false; } };
  } catch (error) { message(error); }
}
function showCode(invite) {
  app.innerHTML = `<form class="entry"><p class="kicker">Your invitation</p><h1>Welcome <em>in.</em></h1><p>A text is on its way to your phone ending in ${escape(invite.phoneHint)}.</p><label for="code">Six-digit access code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-describedby="error"/><p id="error" class="error" role="alert"></p><button class="button" type="submit">Step inside →</button><br><button class="text-button" id="resend" type="button" disabled>Resend available in 60 seconds</button><p class="hint">Your code expires in ten minutes.</p></form>`;
  let remaining = 60;
  const resend = document.querySelector('#resend');
  const timer = setInterval(() => { if (!resend.isConnected) {clearInterval(timer); return;} remaining--; resend.textContent = remaining > 0 ? `Resend available in ${remaining} seconds` : 'Text me a new code'; if (remaining <= 0) {resend.disabled=false; clearInterval(timer);} },1000);
  resend.onclick = async () => {resend.disabled=true; try {await api('send',{}); showCode(invite);} catch(error) {document.querySelector('#error').textContent=error.message;resend.disabled=false;} };
  const input = document.querySelector('#code'); input.focus(); input.oninput = () => {input.value=input.value.replace(/\D/g,'');};
  app.querySelector('form').onsubmit = async e => {e.preventDefault(); const button=app.querySelector('[type=submit]');button.disabled=true;try {await api('verify',{code:input.value});journal=await api('journal');showJournal();} catch(error){document.querySelector('#error').textContent=error.message;button.disabled=false;}};
}
function showJournal() {
  applyBrand(journal.authors);
  const cards = personal => journal.photos.filter(p=>p.personal===personal).map(p=>`<button class="card" data-photo="${escape(p.id)}" aria-label="Open photo: ${escape(p.caption)}"><img src="${escape(p.src)}" alt="${escape(p.alt)}" loading="lazy"/><span>${escape(p.caption)}</span></button>`).join('');
  const hasPersonal=journal.photos.some(p=>p.personal), sharedTitle=journal.sharedTitle || 'A little of our year';
  const stories=(journal.stories || []).map(s=>`<section class="letter"><h2>${escape(s.title)}</h2><p class="prose">${escape(s.body)}</p></section>`).join('');
  app.innerHTML = `<section class="letter"><p class="kicker">The opening note</p><h1>${journal.title ? titleMarkup(journal.title) : 'A little<br><em>look back.</em>'}</h1><p class="intro">Hey ${escape(journal.name)}, we’re glad you’re here.</p><p class="prose">${escape(journal.note || 'We wanted to make a little space for the photos with a story behind them, the ordinary days worth remembering, and the people who make it all feel like home.')}</p><p class="signoff">With love, ${escape(journal.authors || 'Aditya & Angela')}</p>${!journal.title?'<p class="hint">These are illustrative samples while we test your invitation. Real memories will come later.</p>':''}</section><nav class="journal-nav">${hasPersonal?`<a href="#for-you">For you, ${escape(journal.name)}</a>`:''}<a href="#our-year">${escape(sharedTitle)}</a></nav>${hasPersonal?`<section id="for-you"><h2>For you, ${escape(journal.name)}</h2><div class="grid">${cards(true)}</div></section>`:''}<section id="our-year"><h2>${escape(sharedTitle)}</h2><div class="grid">${cards(false)}</div></section>${stories}<button class="text-button" id="logout">Close my edition</button>`;
  app.querySelectorAll('[data-photo]').forEach(button => button.onclick=()=>openPhoto(journal.photos.find(p=>p.id===button.dataset.photo)));
  document.querySelector('#logout').onclick=async()=>{await api('logout',{});journal=null;start();};
  window.scrollTo(0,0);
}
async function openPhoto(photo) {
  selected=photo;preparedFile=null;saveMode='share';const current=++generation;
  dialog.querySelector('img').src=photo.src;dialog.querySelector('img').alt=photo.alt;dialog.querySelector('p').textContent=photo.caption;
  document.querySelector('#save-status').textContent='';save.hidden=!photo.canSave;save.disabled=true;save.textContent='Preparing original…';dialog.showModal();
  if (!photo.canSave) return;
  try {
    const response=await fetch(photo.src+'/original');if(!response.ok) throw new Error('Could not load the original. Reopen the photo to try again.');
    const blob=await response.blob();
    if(current!==generation) return;
    const filename=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'photo.jpg';
    preparedFile=new File([blob],filename,{type:blob.type});save.textContent='Save photo';save.disabled=false;
  } catch(error) {if(current===generation) document.querySelector('#save-status').textContent=error.message;}
}
save.onclick=async()=>{
  if(!preparedFile || !selected?.canSave) return;
  const file=preparedFile;
  try {
    if(saveMode==='share' && navigator.canShare?.({files:[file]})) {await navigator.share({files:[file]});return;}
    const url=URL.createObjectURL(file), a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    document.querySelector('#save-status').textContent='Original downloaded. Your browser chooses where it saves.';
  } catch(error) {if(error.name!=='AbortError'){saveMode='download';document.querySelector('#save-status').textContent='Tap Save photo again to download the original.';}}
};
dialog.querySelector('.close').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>{generation++;preparedFile=null;selected=null;dialog.querySelector('img').removeAttribute('src');});
start();
