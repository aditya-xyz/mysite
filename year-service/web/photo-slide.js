// Three decoded display images travel together; no canvas capture on the swipe path.
export function createPhotoSlide(frame,image){
 const viewport=document.createElement('div'),rail=document.createElement('div');
 viewport.className='photo-slide-viewport';rail.className='photo-slide-rail';image.replaceWith(viewport);viewport.append(rail);rail.append(image);
 const sides=new Map(),prepared=new Set();
 for(const direction of [-1,1]){const side=document.createElement('img');side.className='photo-slide-neighbor';side.alt='';side.draggable=false;side.setAttribute('aria-hidden','true');side.style.left=`${direction*100}%`;rail.append(side);sides.set(direction,side);}
 let animation=null,offset=0,width=0,complete=null;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const position=value=>{offset=value;rail.style.transform=`translate3d(${value}px,0,0)`;};
 function clearNeighbors(){prepared.clear();for(const side of sides.values())side.removeAttribute('src');}
 function cancel(keepOffset=false){const done=complete;complete=null;animation?.cancel();animation=null;done?.();if(!keepOffset){position(0);width=0;}rail.style.willChange='';}
 function begin(){cancel();width=frame.getBoundingClientRect().width;rail.style.willChange='transform';}
 function drag(dx,atEdge=false){if(reduced())return;if(!width)begin();position(Math.max(-width*.95,Math.min(width*.95,dx))*(atEdge ? .25 : 1));}
 function travel(to,done){
  if(reduced()||!rail.animate||to===offset){position(to);done();rail.style.willChange='';return Promise.resolve();}
  const from=offset;rail.style.willChange='transform';
  const current=rail.animate([{transform:`translate3d(${from}px,0,0)`},{transform:`translate3d(${to}px,0,0)`}],{duration:Math.max(140,280*Math.min(1,Math.abs(to-from)/(width||1))),easing:'cubic-bezier(.2,.75,.25,1)',fill:'forwards'});
  animation=current;complete=done;
  return current.finished.then(()=>{if(animation===current){complete=null;animation=null;done();current.cancel();rail.style.willChange='';}},()=>{});
 }
 function settle(){return travel(0,()=>{position(0);width=0;});}
 function ready(direction){const side=sides.get(direction);return side?.getAttribute('src')&&side.complete&&side.naturalWidth?{src:side.src,width:side.naturalWidth,height:side.naturalHeight,preview:!prepared.has(direction)}:null;}
 function neighbor(direction,src,canNavigate=true){sides.get(direction).src=src;if(canNavigate)prepared.add(direction);else prepared.delete(direction);}
 function reveal(src,naturalWidth,naturalHeight,direction=0){
  const from=offset;cancel(true);position(from);width=frame.getBoundingClientRect().width;
  const commit=()=>{image.src=src;image.style.visibility='visible';frame.style.setProperty('--photo-ratio',String(naturalWidth/naturalHeight));position(0);width=0;clearNeighbors();};
  if(!direction||reduced()||!image.getAttribute('src')||image.style.visibility==='hidden'){commit();return Promise.resolve();}
  neighbor(direction,src);
  return travel(-Math.sign(direction)*width,commit);
 }
 function upgrade(src){image.src=src;}
 return {reveal,cancel,begin,drag,settle,neighbor,ready,upgrade,clearNeighbors};
}
