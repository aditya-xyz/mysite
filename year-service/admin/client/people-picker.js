const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function peoplePickerMarkup(photoId,label,{hint="Select multiple people. Adding someone doesn’t invite them to this scrapbook.",allowAdd=true}={}){
  const id='recipients-'+photoId;
  return `<div class="recipient-picker" data-picker="${escape(photoId)}"><span class="picker-label" id="${id}-label">${escape(label)}</span><div class="picker-control"><div class="picker-chips"></div><input type="text" class="picker-input" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" aria-labelledby="${id}-label" aria-describedby="${id}-hint" placeholder="Search people…" autocomplete="off"></div><div class="picker-menu" hidden><div role="listbox" aria-multiselectable="true" id="${id}-list" aria-labelledby="${id}-label" class="picker-options"></div><button type="button" class="picker-add" ${allowAdd?'':'hidden'}>+ Add a new person…</button></div><p class="hint picker-hint" id="${id}-hint">${escape(hint)}</p><span class="sr-only picker-announcement" role="status" aria-live="polite"></span></div>`;
}

export function bindPeoplePicker(root,{people,selected,status,toggle,add}){
  const input=root.querySelector('.picker-input'),menu=root.querySelector('.picker-menu'),options=root.querySelector('.picker-options'),chips=root.querySelector('.picker-chips'),addButton=root.querySelector('.picker-add');
  let active=-1,matches=[];
  function close(){menu.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function renderChips(){
    chips.innerHTML=selected().map(id=>{
      const person=people().find(p=>p.id===id),name=person?.name||'Unknown person',access=status(id);
      return `<span class="person-chip ${!access||access==='Invited'?'':'needs-invitation'}"><span>${escape(name)}${!access||access==='Invited'?'':`<small>${escape(access)}</small>`}</span><button type="button" data-remove="${escape(id)}" aria-label="Remove ${escape(name)}">×</button></span>`;
    }).join('');
    chips.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{
      const name=people().find(p=>p.id===button.dataset.remove)?.name||'Person';toggle(button.dataset.remove);renderChips();paint();input.focus();root.querySelector('.picker-announcement').textContent=name+' removed.';
    });
  }
  function paint(){
    const query=input.value.trim().toLocaleLowerCase();matches=people().filter(p=>(p.name+' '+(p.phone||'')).toLocaleLowerCase().includes(query));
    if(active>=matches.length)active=matches.length-1;
    options.innerHTML=matches.map((person,i)=>`<div role="option" id="${options.id}-${i}" aria-selected="${selected().includes(person.id)}" class="picker-option ${i===active?'highlighted':''}" data-option="${i}"><span><strong>${escape(person.name)}</strong><small>${person.phone?'•••• '+escape(person.phone.slice(-4)):'No phone needed'}${status(person.id)?' · '+escape(status(person.id)):''}</small></span><span aria-hidden="true">${selected().includes(person.id)?'✓':'+'}</span></div>`).join('')||'<p class="picker-no-results">No matching people.</p>';
    options.querySelectorAll('[data-option]').forEach(option=>{
      option.onpointerdown=event=>event.preventDefault();
      option.onclick=()=>choose(Number(option.dataset.option));
    });
    addButton.textContent=query?`+ Add “${input.value.trim()}” as a new person…`:'+ Add a new person…';
    if(active>=0&&!menu.hidden)input.setAttribute('aria-activedescendant',`${options.id}-${active}`);else input.removeAttribute('aria-activedescendant');
  }
  function open(){menu.hidden=false;input.setAttribute('aria-expanded','true');paint();}
  function choose(index){
    const person=matches[index];if(!person)return;
    const removing=selected().includes(person.id);toggle(person.id);input.value='';active=-1;renderChips();paint();input.focus();
    root.querySelector('.picker-announcement').textContent=person.name+(removing?' removed.':' selected.');
  }
  input.onfocus=open;input.onclick=open;input.oninput=()=>{active=-1;open();};
  input.onkeydown=event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(menu.hidden)open();
      if(matches.length){active=active<0?(event.key==='ArrowDown'?0:matches.length-1):(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;paint();options.children[active]?.scrollIntoView({block:'nearest'});}
    }else if(event.key==='Enter'){
      event.preventDefault();if(menu.hidden){open();return;}
      if(matches.length)choose(active<0?0:active);else add(input.value.trim());
    }else if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();close();
    }
  };
  addButton.onclick=()=>add(input.value.trim());
  root.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();input.focus();close();}};
  root.onfocusout=()=>setTimeout(()=>{if(!root.contains(document.activeElement))close();},0);
  renderChips();paint();
}
