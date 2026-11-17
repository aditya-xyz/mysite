// A clipped image layer keeps navigation controls still while decoded photos slide.
export function createPhotoSlide(frame,image){
 const viewport=document.createElement('div');viewport.className='photo-slide-viewport';image.replaceWith(viewport);viewport.append(image);
 let animation=[],overlay=null,offset=0;
 function release(){overlay?.remove();if(overlay){overlay.width=0;overlay.height=0;}overlay=null;}
 function cancel(keepOffset=false){animation.forEach(a=>a.cancel());animation=[];release();if(!keepOffset){offset=0;image.style.transform='';}}
 function drag(dx,atEdge=false){cancel();if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const limit=frame.getBoundingClientRect().width*.85;offset=Math.max(-limit,Math.min(limit,dx))*(atEdge ? .25 : 1);image.style.transform=`translateX(${offset}px)`;}
 function settle(){const from=offset;cancel();if(from&&!matchMedia('(prefers-reduced-motion: reduce)').matches){animation=[image.animate([{transform:`translateX(${from}px)`},{transform:'translateX(0)'}],{duration:260,easing:'cubic-bezier(.2,.8,.25,1)'})];animation[0].finished.catch(()=>{});}}
 function reveal(src,width,height,direction=0){
  const from=offset;cancel();
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
  animation=[image.animate([{transform:from?`translateX(calc(${sign*100}% + ${from}px))`:`translateX(${sign*100}%)`},{transform:'translateX(0)'}],options),outgoing.animate([{transform:`translateX(${from}px)`},{transform:`translateX(${-sign*100}%)`}],options)];
  Promise.all(animation.map(a=>a.finished)).then(()=>{if(overlay===outgoing){animation=[];release();}}).catch(()=>{if(overlay===outgoing)release();});
 }
 return {reveal,cancel,drag,settle};
}
