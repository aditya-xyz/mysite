const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chevron='<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>';
export function customSelectMarkup({key,label,value,options,open=false,disabled=false}){
 const selected=options.find(option=>option.value===value);
 return `<div class="pb-custom-select"><span id="select-label-${esc(key)}">${esc(label)}</span><button type="button" class="pb-select-trigger" role="combobox" aria-labelledby="select-label-${esc(key)} select-value-${esc(key)}" aria-haspopup="listbox" aria-expanded="${open}" aria-controls="select-list-${esc(key)}" data-select-control="${esc(key)}" ${disabled?'disabled':''}><span id="select-value-${esc(key)}">${esc(selected?.selectedLabel||selected?.label||value)}</span>${chevron}</button><div id="select-list-${esc(key)}" class="pb-select-list" popover="manual" role="listbox" aria-labelledby="select-label-${esc(key)}" ${open?'':'hidden'}>${options.map(option=>`<button type="button" role="option" tabindex="-1" aria-selected="${option.value===value}" data-select-option="${esc(key)}" data-select-value="${esc(option.value)}" ${option.disabled?'disabled aria-disabled="true"':''}><span>${esc(option.label)}</span><span aria-hidden="true">${option.value===value?'✓':''}</span></button>`).join('')}</div></div>`;
}
export function bindCustomSelect(root,onChange){
 const triggers=[...root.querySelectorAll('[data-select-control]')];
 let openKey=triggers.find(button=>button.getAttribute('aria-expanded')==='true')?.dataset.selectControl||null;
 const trigger=key=>triggers.find(button=>button.dataset.selectControl===key);
 const list=key=>root.querySelector(`[id="select-list-${key}"]`);
 const options=key=>[...root.querySelectorAll(`[data-select-option="${key}"]:not(:disabled)`)];
 function positionMenu(){
  if(!openKey)return;
  const menu=list(openKey),box=trigger(openKey).getBoundingClientRect();
  const top=box.bottom+5,viewport=window.visualViewport;
  const bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
  menu.style.setProperty('--menu-left',box.left+'px');
  menu.style.setProperty('--menu-top',top+'px');
  menu.style.setProperty('--menu-width',box.width+'px');
  menu.style.setProperty('--menu-room',Math.max(0,bottom-top-6)+'px');
 }
 let tracking;
 function showMenu(key){
  const menu=list(key);
  menu.hidden=false;
  if(!menu.showPopover)return;
  positionMenu();
  menu.showPopover();
  tracking=new AbortController();
  const events={signal:tracking.signal};
  window.addEventListener('resize',positionMenu,events);
  root.addEventListener('scroll',positionMenu,{...events,capture:true});
  window.visualViewport?.addEventListener('resize',positionMenu,events);
  window.visualViewport?.addEventListener('scroll',positionMenu,events);
 }
 function close(focus=false){
  if(!openKey)return;
  const button=trigger(openKey),menu=list(openKey);
  tracking?.abort();
  menu.hidePopover?.();
  menu.hidden=true;
  button.setAttribute('aria-expanded','false');
  openKey=null;
  if(focus)button.focus();
 }
 function open(key,index){
  close();
  openKey=key;
  trigger(key).setAttribute('aria-expanded','true');
  showMenu(key);
  if(index!==undefined){const buttons=options(key);buttons[Math.max(0,Math.min(index,buttons.length-1))]?.focus();}
 }
 if(openKey)showMenu(openKey);
 for(const button of triggers){
  const key=button.dataset.selectControl;
  button.onclick=()=>openKey===key?close():open(key);
  button.onkeydown=event=>{
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();const buttons=options(key),selected=buttons.findIndex(option=>option.getAttribute('aria-selected')==='true');
    open(key,event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,selected));
   }else if(event.key==='Escape'&&openKey){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==='Tab')close();
  };
 }
 root.querySelectorAll('[data-select-option]').forEach(button=>{
  const key=button.dataset.selectOption;
  button.onclick=()=>{close(true);onChange(key,button.dataset.selectValue);};
  button.onkeydown=event=>{
   const buttons=options(key),index=buttons.indexOf(button);
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
   else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==='Tab')close(true);
  };
 });
 const outside=event=>{if(openKey&&!event.target.closest('.pb-custom-select'))close();};
 const surface=root.closest('dialog')||root;surface.addEventListener('click',outside);
 return {get openKey(){return openKey;},destroy(){close();surface.removeEventListener('click',outside);}};
}
