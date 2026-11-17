// Hold the current display pixels until its replacement is decoded and drawn.
// This temporary display-only canvas never participates in the saved artwork.
export function beginPreviewTransition(source){
 if(!source?.isConnected||matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
 if(source.tagName==='IMG'&&!source.naturalWidth)return null;
 const parent=source.parentElement,r=source.getBoundingClientRect(),p=parent.getBoundingClientRect();
 if(!r.width||!r.height)return null;
 const overlay=document.createElement('canvas'),ratio=Math.min(2,globalThis.devicePixelRatio||1);
 overlay.width=Math.min(1200,Math.ceil(r.width*ratio));overlay.height=Math.ceil(overlay.width*r.height/r.width);
 try{const context=overlay.getContext('2d');if(!context)return null;context.drawImage(source,0,0,overlay.width,overlay.height);}catch{return null;}
 overlay.className='ks-border-transition';overlay.setAttribute('aria-hidden','true');
 Object.assign(overlay.style,{left:(r.left-p.left)+'px',top:(r.top-p.top)+'px',width:r.width+'px',height:r.height+'px'});
 parent.append(overlay);
 let animation,started=false,removed=false;
 function release(){if(removed)return;removed=true;overlay.remove();overlay.width=0;overlay.height=0;}
 return {
  finish(){
   if(started||removed)return;started=true;
   if(!overlay.isConnected||matchMedia('(prefers-reduced-motion: reduce)').matches){release();return;}
   animation=overlay.animate([{opacity:1},{opacity:0}],{duration:280,easing:'cubic-bezier(.22,.7,.3,1)'});
   animation.finished.then(release).catch(release);
  },
  cancel(){animation?.cancel();release();}
 };
}
