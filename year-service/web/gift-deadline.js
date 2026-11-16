// Close a page left open across the cutoff, including after a background-tab sleep.
export function watchGiftDeadline(window,onClose,{now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout,events=globalThis.document}={}){
 if(!window?.closesAt)return ()=>{};
 let timer,closed=false;
 const check=()=>{
  cancel(timer);if(closed)return;
  const remaining=window.closesAt*1000-now();
  if(window.closed||remaining<=0){closed=true;onClose();return;}
  timer=schedule(check,Math.min(remaining,2147483647));
 };
 events?.addEventListener('visibilitychange',check);check();
 return ()=>{closed=true;cancel(timer);events?.removeEventListener('visibilitychange',check);};
}
