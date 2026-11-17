// Keep native dialog focus/stack behavior; defer only visual user dismissals.
const states=new WeakMap();
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function stateFor(dialog){
 let state=states.get(dialog);if(state)return state;
 state={animation:null,closing:null};states.set(dialog,state);
 dialog.addEventListener('cancel',event=>{if(!event.defaultPrevented){event.preventDefault();closeDialog(dialog);}});
 dialog.addEventListener('close',()=>{if(dialog.open)return;state.animation?.cancel();state.animation=null;dialog.removeAttribute('data-dialog-motion');});
 return state;
}
export function openDialog(dialog){
 if(dialog.open)return;if(reduced()||!dialog.animate){dialog.setAttribute('data-dialog-motion','still');dialog.showModal();return;}const state=stateFor(dialog);state.animation?.cancel();state.closing=null;dialog.setAttribute('data-dialog-motion','enter');dialog.showModal();
 const animation=dialog.animate([{opacity:0,transform:'translate3d(0,16px,0) scale(.96)'},{opacity:1,transform:'translate3d(0,0,0) scale(1)'}],{duration:280,easing:'cubic-bezier(.2,.75,.25,1)'});
 state.animation=animation;animation.finished.catch(()=>{}).then(()=>{if(state.animation===animation){state.animation=null;dialog.setAttribute('data-dialog-motion','still');}});
}
export function closeDialog(dialog){
 if(!dialog.open)return Promise.resolve();if(reduced()||!dialog.animate){dialog.close();return Promise.resolve();}const state=stateFor(dialog);if(state.closing)return state.closing;
 const appearance=getComputedStyle(dialog),from={opacity:appearance.opacity,transform:appearance.transform};state.animation?.cancel();
 dialog.setAttribute('data-dialog-motion','leave');
 const animation=dialog.animate([from,{opacity:0,transform:'translate3d(0,12px,0) scale(.96)'}],{duration:200,easing:'cubic-bezier(.2,.75,.25,1)',fill:'forwards'});state.animation=animation;
 state.closing=new Promise(resolve=>{let timer,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);if(state.animation===animation){if(dialog.open)dialog.close();animation.cancel();state.animation=null;state.closing=null;}resolve();};animation.finished.then(finish,finish);timer=setTimeout(finish,280);});
 return state.closing;
}
