// Slide only the changing content; headings, progress and actions stay anchored.
const states=new WeakMap();
export function slideStep(dialog,key,rank,selector){
 let state=states.get(dialog);if(!state){state={key,rank,animation:null};states.set(dialog,state);}
 const previous=state.rank,changed=state.key!==key;state.animation?.cancel();state.animation=null;dialog.removeAttribute?.('data-step-direction');state.key=key;state.rank=rank;
 const body=dialog.querySelector(selector);
 if(!changed||!dialog.open||!Number.isFinite(previous)||!Number.isFinite(rank)||previous===rank||!body?.animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 if(!state.bound){state.bound=true;dialog.addEventListener('close',()=>{state.animation?.cancel();state.animation=null;dialog.removeAttribute('data-step-direction');});}
 const direction=rank>previous?1:-1;dialog.setAttribute('data-step-direction',direction>0?'forward':'back');
 const animation=body.animate([{opacity:.3,transform:`translate3d(${direction*48}px,0,0)`},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:260,easing:'cubic-bezier(.2,.75,.25,1)'});state.animation=animation;
 animation.finished.catch(()=>{}).then(()=>{if(state.animation===animation){state.animation=null;dialog.removeAttribute('data-step-direction');}});
}
