// Run before styles load so a reader's saved choice does not flash the other palette.
(()=>{
  const root=document.documentElement,key='scrapbook-color-mode';
  let dark=false;
  try{dark=localStorage.getItem(key)==='dark';}catch{}
  function apply(){
    root.dataset.palette=dark?'night':'moss';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#172922':'#ecf0e5');
    const button=document.getElementById('theme-toggle');
    if(button){button.hidden=false;button.setAttribute('aria-pressed',String(dark));button.title=dark?'Return to moss-and-cream colors':'Turn on dark mode';}
  }
  apply();
  function bind(){
    const button=document.getElementById('theme-toggle');if(!button)return;
    button.addEventListener('click',()=>{dark=!dark;apply();try{localStorage.setItem(key,dark?'dark':'light');}catch{}});
    apply();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
