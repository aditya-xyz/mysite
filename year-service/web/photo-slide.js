// A clipped image layer keeps navigation controls still while decoded photos slide.
export function createPhotoSlide(frame,image){
 const viewport=document.createElement('div');viewport.className='photo-slide-viewport';image.replaceWith(viewport);viewport.append(image);
 let animation=[],overlay=null;
 function release(){overlay?.remove();if(overlay){overlay.width=0;overlay.height=0;}overlay=null;}
 function cancel(){animation.forEach(a=>a.cancel());animation=[];release();}
 function reveal(src,width,height,direction=0){
  cancel();
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(direction&&!reduced&&image.naturalWidth&&image.style.visibility!=='hidden'&&image.animate){
   const r=image.getBoundingClientRect(),ratio=Math.min(2,globalThis.devicePixelRatio||1);
   if(r.width&&r.height){
    const snapshot=document.createElement('canvas');snapshot.width=Math.min(1200,Math.ceil(r.width*ratio));snapshot.height=Math.ceil(snapshot.width*r.height/r.width);
    try{const context=snapshot.getContext('2d');if(context){context.drawImage(image,0,0,snapshot.width,snapshot.height);overlay=snapshot;}}catch{}
   }
  }
  frame.style.setProperty('--photo-ratio',String(width/height));image.src=src;image.style.visibility='visible';
  if(!overlay)return;
  const outgoing=overlay;outgoing.className='photo-slide-outgoing';outgoing.setAttribute('aria-hidden','true');viewport.append(outgoing);
  const options={duration:320,easing:'cubic-bezier(.22,.75,.25,1)'},sign=direction>0?1:-1;
  animation=[image.animate([{transform:`translateX(${sign*100}%)`},{transform:'translateX(0)'}],options),outgoing.animate([{transform:'translateX(0)'},{transform:`translateX(${-sign*100}%)`}],options)];
  Promise.all(animation.map(a=>a.finished)).then(()=>{if(overlay===outgoing){animation=[];release();}}).catch(()=>{if(overlay===outgoing)release();});
 }
 return {reveal,cancel};
}
