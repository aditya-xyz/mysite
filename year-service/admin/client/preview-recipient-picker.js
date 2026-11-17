const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const collator=new Intl.Collator('en',{sensitivity:'base',numeric:true});
export function previewRecipientChoices(invites,contacts){
 const names=new Map(contacts.map(p=>[p.id,p.name]));
 const sorted=items=>items.sort((a,b)=>collator.compare(a.label,b.label)||collator.compare(a.detail,b.detail)||a.value.localeCompare(b.value));
 return [{value:'',label:'Shared photos only',detail:'',group:''},...sorted(invites.map(i=>({value:'invite:'+i.id,label:i.addressedTo||i.name,detail:(i.memberIds||[i.person_id]).map(id=>names.get(id)||'').filter(Boolean).join(' & '),group:'Invitations'}))),...sorted(contacts.map(p=>({value:p.id,label:p.name,detail:'',group:'Individual people'})))];
}
export function filterPreviewRecipients(choices,query){const q=query.trim().toLocaleLowerCase();return choices.filter(c=>(c.label+' '+c.detail).toLocaleLowerCase().includes(q));}
export function previewRecipientPickerMarkup(){return `<div class="field preview-recipient-picker"><label for="preview-person">Preview for</label><div class="preview-recipient-control"><input id="preview-person" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="preview-recipient-list" placeholder="Search invites or people…" autocomplete="off"><button type="button" data-preview-toggle aria-label="Show recipients">⌄</button></div><div class="preview-recipient-menu" hidden><div id="preview-recipient-list" role="listbox" aria-label="Preview recipients"></div><p class="hint" data-preview-empty hidden>No matching invites or people.</p></div><span class="sr-only" role="status" aria-live="polite" data-preview-status></span></div>`;}
export function bindPreviewRecipientPicker(root,{choices,value='',onChange}){
 const input=root.querySelector('#preview-person'),menu=root.querySelector('.preview-recipient-menu'),list=root.querySelector('[role=listbox]'),toggle=root.querySelector('[data-preview-toggle]');
 let selected=value,query='',active=-1,matches=[];
 const label=()=>choices.find(c=>c.value===selected)?.label||'Shared photos only';
 function close(){menu.hidden=true;input.value=label();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');toggle.setAttribute('aria-label','Show recipients');active=-1;}
 function paint(){
  matches=filterPreviewRecipients(choices,query);if(active>=matches.length)active=matches.length-1;
  let group=null;list.innerHTML=matches.map((c,i)=>{const heading=c.group&&c.group!==group?`<div class="preview-recipient-group">${esc(c.group)}</div>`:'';group=c.group;return heading+`<div role="option" id="preview-recipient-${i}" data-preview-option="${i}" aria-selected="${c.value===selected}" class="preview-recipient-option ${i===active?'is-active':''}"><strong>${esc(c.label)}</strong>${c.detail?`<small>${esc(c.detail)}</small>`:''}</div>`;}).join('');
  root.querySelector('[data-preview-empty]').hidden=matches.length>0;
  if(active>=0)input.setAttribute('aria-activedescendant','preview-recipient-'+active);else input.removeAttribute('aria-activedescendant');
  list.querySelectorAll('[data-preview-option]').forEach(option=>{option.onpointerdown=e=>e.preventDefault();option.onclick=()=>choose(Number(option.dataset.previewOption));});
 }
 function open(){menu.hidden=false;input.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Hide recipients');paint();}
 function choose(index){const c=matches[index];if(!c)return;selected=c.value;query='';onChange(selected);close();root.querySelector('[data-preview-status]').textContent='Preview for '+c.label;input.focus();}
 input.value=label();input.onfocus=()=>input.select();input.onclick=()=>{query='';active=-1;open();};input.oninput=()=>{query=input.value;active=-1;open();};
 input.onkeydown=e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(menu.hidden){query='';open();}if(matches.length){active=active<0?(e.key==='ArrowDown'?0:matches.length-1):(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;paint();list.querySelector('#preview-recipient-'+active)?.scrollIntoView({block:'nearest'});}}
  else if(e.key==='Enter'){e.preventDefault();if(menu.hidden){query='';open();}else if(matches.length)choose(active<0?0:active);}
  else if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();query='';close();}
  else if(e.key==='Tab')close();
 };
 toggle.onpointerdown=e=>e.preventDefault();toggle.onclick=()=>{if(menu.hidden){query='';active=-1;input.focus();open();}else close();};
 root.onfocusout=e=>{if(!root.contains(e.relatedTarget))close();};
}
