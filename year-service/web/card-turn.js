// Display-only page motion; the original panels and printed artwork stay intact.
const running=new WeakMap();
export function turnCardView(root,view){
 const panels=[...root.querySelectorAll('[data-card-panel]:not([data-turn-ghost])')];
 const previous=panels.find(p=>!p.hidden),next=panels.find(p=>p.dataset.cardPanel===view);
 if(!next||previous===next)return;
 running.get(root)?.cancel();
 const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 let ghost;
 if(previous&&!reduced&&previous.animate&&next.animate){
  const r=previous.getBoundingClientRect(),p=root.getBoundingClientRect();
  if(r.width&&r.height){
   ghost=previous.cloneNode(true);ghost.dataset.turnGhost='true';ghost.hidden=false;ghost.inert=true;ghost.setAttribute('aria-hidden','true');
   // The measured offsets are relative to the whole preview, including its controls.
   Object.assign(ghost.style,{position:'absolute',gridArea:'auto',left:(r.left-p.left)+'px',top:(r.top-p.top)+'px',width:r.width+'px',height:r.height+'px',maxWidth:'none',margin:'0',pointerEvents:'none',zIndex:'2'});
   const originals=previous.querySelectorAll('canvas');
   ghost.querySelectorAll('canvas').forEach((canvas,i)=>{canvas.width=originals[i].width;canvas.height=originals[i].height;canvas.getContext('2d')?.drawImage(originals[i],0,0);});
   root.append(ghost);
  }
 }
 panels.forEach(p=>p.hidden=p!==next);
 if(!ghost)return;
 const animations=[],options={duration:480,easing:'cubic-bezier(.22,.75,.25,1)'};
 const from=previous.dataset.cardPanel,opening=view==='inside',closing=from==='inside';
 if(opening){
  const fromFront=from==='front',direction=fromFront?-1:1,leaves=[...next.querySelectorAll('.fc-page')];
  const leaf=leaves[fromFront?0:1];
  if(leaf){
   animations.push(leaf.animate([{transform:`perspective(1200px) rotateY(${-direction*100}deg)`},{transform:'perspective(1200px) rotateY(0deg)'}],options));
   leaf.style.transformOrigin=fromFront?'right center':'left center';
  }
  const r=next.getBoundingClientRect(),p=root.getBoundingClientRect(),spine=r.left-p.left+r.width/2;
  const edge=parseFloat(ghost.style.left)+(fromFront?0:parseFloat(ghost.style.width));
  ghost.style.transformOrigin=fromFront?'left center':'right center';
  animations.push(ghost.animate([{opacity:1,transform:'perspective(1200px) rotateY(0deg)'},{opacity:0,transform:`translateX(${spine-edge}px) perspective(1200px) rotateY(${direction*150}deg)`}],options));
  animations.push(next.animate([{opacity:.25},{opacity:1,offset:.45},{opacity:1}],options));
 }else if(closing){
  const toFront=view==='front',leaves=[...ghost.querySelectorAll('.fc-page')],leaf=leaves[toFront?0:1];
  if(leaf){leaf.style.transformOrigin=toFront?'right center':'left center';animations.push(leaf.animate([{transform:'perspective(1200px) rotateY(0deg)'},{transform:`perspective(1200px) rotateY(${toFront?-145:145}deg)`}],options));}
  animations.push(ghost.animate([{opacity:1},{opacity:0}],options));
  animations.push(next.animate([{opacity:0,transform:`perspective(1200px) rotateY(${toFront?65:-65}deg)`},{opacity:1,transform:'perspective(1200px) rotateY(0deg)'}],options));
 }else{
  const direction=view==='back'?-1:1;
  const halfTurn=options.duration/2;
  // Change faces at the midpoint, when both covers are edge-on.
  animations.push(ghost.animate([
   {opacity:1,transform:'perspective(1200px) rotateY(0deg)'},
   {opacity:1,offset:.9},
   {opacity:0,transform:`perspective(1200px) rotateY(${direction*90}deg)`}
  ],{duration:halfTurn,easing:'ease-in',fill:'forwards'}));
  animations.push(next.animate([
   {opacity:0,transform:`perspective(1200px) rotateY(${-direction*90}deg)`},
   {opacity:1,offset:.1},
   {opacity:1,transform:'perspective(1200px) rotateY(0deg)'}
  ],{delay:halfTurn,duration:halfTurn,easing:'ease-out',fill:'backwards'}));
 }
 let released=false;
 const release=()=>{if(released)return;released=true;ghost.remove();ghost.querySelectorAll('canvas').forEach(canvas=>{canvas.width=0;canvas.height=0;});if(running.get(root)===entry)running.delete(root);};
 const entry={cancel(){animations.forEach(a=>a.cancel());release();}};running.set(root,entry);
 Promise.all(animations.map(a=>a.finished)).then(release).catch(release);
}
