// Refresh editable dates for open pages, including after a background-tab sleep.
export function watchGiftDeadline(window,onClose,{now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout,events=globalThis.document,refresh,repeat=setInterval,stopRepeat=clearInterval}={}){
 if(!window?.closesAt)return ()=>{};
 let timer,poll,closed=false,current=window,revision=0;
 const check=()=>{
  cancel(timer);if(closed)return;
  const remaining=current.closesAt*1000-now();
  if(current.closed||remaining<=0){closed=true;stopRepeat(poll);onClose();return;}
  timer=schedule(refreshAndCheck,Math.min(remaining,2147483647));
 };
 const refreshAndCheck=async()=>{
  if(closed)return;const stamp=++revision;
  try{if(refresh){const updated=await refresh();if(stamp!==revision||closed)return;if(updated?.closesAt)current=updated;}}
  catch{/* Preserve the last known deadline when temporarily offline. */}
  if(stamp===revision)check();
 };
 events?.addEventListener('visibilitychange',refreshAndCheck);
 if(refresh)poll=repeat(refreshAndCheck,60000);
 check();
 return ()=>{closed=true;revision++;cancel(timer);stopRepeat(poll);events?.removeEventListener('visibilitychange',refreshAndCheck);};
}
