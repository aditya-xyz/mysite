// Apply before styles load, including on the invitation login and policy pages.
(()=>{
  // Start everyone on System once; subsequent explicit choices use this versioned key.
  const root=document.documentElement,key='scrapbook-color-mode-v2';
  const system=window.matchMedia('(prefers-color-scheme: dark)');
  let mode='system',menu;
  try{const saved=localStorage.getItem(key);if(saved==='dark'||saved==='light')mode=saved;}catch{}
  const labels={system:'System',dark:'Dark',light:'Light'};
  function apply(){
    const dark=mode==='dark'||(mode==='system'&&system.matches);
    root.dataset.palette=dark?'night':'moss';
    root.dataset.colorMode=mode;
    // Safari 27.3 Adaptive Dark Mode: keep BOTH schemes advertised.
    // A single scheme (including “only light”) can re-enable recoloring there.
    root.style.colorScheme='light dark';
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content','light dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#17251d':'#f7f3e8');
    const button=document.getElementById('theme-toggle');
    if(button){button.hidden=false;button.title=`Color theme: ${labels[mode]}`;button.setAttribute('aria-label',button.title);}
    menu?.querySelectorAll('[data-mode]').forEach(item=>item.setAttribute('aria-checked',String(item.dataset.mode===mode)));
  }
  apply();
  system.addEventListener('change',()=>{if(mode==='system')apply();});
  window.addEventListener('storage',event=>{if(event.key!==key&&event.key!==null)return;mode=event.newValue==='dark'||event.newValue==='light'?event.newValue:'system';apply();});
  function bind(){
    const button=document.getElementById('theme-toggle');if(!button)return;
    button.removeAttribute('aria-pressed');
    button.setAttribute('aria-haspopup','menu');
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls','theme-menu');
    button.insertAdjacentHTML('afterbegin','<svg class="theme-system" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>');
    menu=document.createElement('div');menu.id='theme-menu';menu.className='theme-menu';menu.hidden=true;
    menu.setAttribute('role','menu');menu.setAttribute('aria-label','Color theme');
    menu.innerHTML=Object.entries(labels).map(([value,label])=>`<button type="button" role="menuitemradio" data-mode="${value}" aria-checked="false" tabindex="-1"><span>${label}</span><span class="theme-check" aria-hidden="true">✓</span></button>`).join('');
    document.body.append(menu);
    const items=[...menu.querySelectorAll('[data-mode]')];
    function position(){const box=button.getBoundingClientRect();menu.style.top=`${box.bottom+8}px`;menu.style.left=`${Math.max(8,Math.min(box.right-menu.offsetWidth,window.innerWidth-menu.offsetWidth-8))}px`;}
    function close(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
    function open(last=false){menu.hidden=false;position();button.setAttribute('aria-expanded','true');(last?items.at(-1):items.find(item=>item.dataset.mode===mode)).focus();}
    button.addEventListener('click',()=>menu.hidden?open():close());
    button.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open(event.key==='ArrowUp');}});
    menu.addEventListener('click',event=>{const item=event.target.closest('[data-mode]');if(!item)return;mode=item.dataset.mode;try{localStorage.setItem(key,mode);}catch{}apply();close(true);});
    menu.addEventListener('keydown',event=>{
      const index=items.indexOf(document.activeElement);
      if(event.key==='Escape'){event.preventDefault();close(true);}
      else if(event.key==='Tab')close();
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}
    });
    document.addEventListener('click',event=>{if(!menu.contains(event.target)&&!button.contains(event.target))close();});
    document.addEventListener('focusin',event=>{if(!menu.contains(event.target)&&!button.contains(event.target))close();});
    window.addEventListener('resize',()=>{if(!menu.hidden)position();});
    window.addEventListener('scroll',()=>{if(!menu.hidden)position();},{passive:true});
    apply();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
