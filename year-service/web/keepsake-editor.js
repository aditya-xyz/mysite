import {coverCrop} from './keepsake-layout.js';

// A finger moving down pulls the image down (revealing pixels nearer its top).
export function verticalCrop(width,height,slot,crop,deltaY,displayHeight){
  const source=coverCrop(width,height,slot.width,slot.height,crop),travel=height-source.height;
  return {...crop,y:travel>0&&displayHeight>0?Math.max(0,Math.min(1,crop.y-deltaY/displayHeight*source.height/travel)):crop.y};
}
export function photoSlotAt(rects,x,y){return rects.findIndex(r=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);}
export function dragGhostPlacement(pointer,pickup,rect,size,origin,desktop){
  const anchorX=desktop?(pickup.x-rect.left)/rect.width*size.width:45;
  const anchorY=desktop?(pickup.y-rect.top)/rect.height*size.height:35;
  return {x:pointer.x-origin.x-anchorX,y:pointer.y-origin.y-anchorY,anchorX,anchorY};
}

export function bindKeepsakeEditor({wrap,slots,getImage,getCrop,setCrop,canStart,onStart,onPreview,onCrop,onSwap,onStatus}){
  const buttons=[...wrap.querySelectorAll('[data-crop]')];
  let gesture=null,ghost=null,muted=false,muteTimer=null;
  const landings=new Set();
  const dialog=wrap.closest('dialog');
  const tools=dialog.querySelector('.ks-edit-tools');
  const panels=[...tools.querySelectorAll('[data-edit-mode]')];
  const directions=[...tools.querySelectorAll('[data-edit-action="up"],[data-edit-action="down"]')];
  let editing=-1,mode='choose';
  function showTools(index,next='choose',focus=true){
    editing=index;mode=next;
    tools.hidden=index<0;
    buttons.forEach((button,i)=>button.setAttribute('aria-expanded',String(i===index)));
    panels.forEach(panel=>{panel.hidden=panel.dataset.editMode!==mode;});
    if(mode==='reframe')updateDirections();
    if(focus&&index>=0)tools.querySelector('[data-edit-mode]:not([hidden]) button:not(:disabled)')?.focus({preventScroll:true});
  }
  function closeTools(focus=false){
    const previous=editing;
    showTools(-1,'choose',false);
    if(focus)buttons[previous]?.focus({preventScroll:true});
  }
  function updateDirections(){
    const {width,height}=getImage(editing),slot=slots[editing],crop=getCrop(editing);
    const verticalRoom=height-coverCrop(width,height,slot.width,slot.height,crop).height>0.5;
    directions[0].disabled=!verticalRoom||crop.y>=1;
    directions[1].disabled=!verticalRoom||crop.y<=0;
  }
  function movePhoto(index,delta){
    const crop=getCrop(index);
    setCrop(index,{...crop,y:Math.max(0,Math.min(1,crop.y+delta))});
    onPreview();onCrop();onStatus('Framing updated.');
  }
  function activatePhoto(event){
    const button=event.target.closest('[data-crop]');
    if(!button||!canStart())return;
    const index=Number(button.dataset.crop);
    if(mode==='swap'&&editing>=0&&editing!==index){
      const source=editing;
      closeTools();
      onSwap(source,index);onStatus('Photos swapped.');
    }else if(editing===index)closeTools(true);
    else showTools(index);
  }
  function activateTool(event){
    const action=event.target.closest('[data-edit-action]')?.dataset.editAction;
    if(!action||editing<0)return;
    if(action==='done'){closeTools(true);return;}
    if(action==='reframe'||action==='swap'){
      showTools(editing,action);
      if(action==='swap')buttons.find((_,i)=>i!==editing).focus({preventScroll:true});
      if(action==='reframe'&&directions.every(button=>button.disabled))onStatus('This photo already fits its frame.');
      return;
    }
    movePhoto(editing,action==='up'?.12:-.12);
    updateDirections();
    if(event.target.disabled)tools.querySelector('[data-edit-mode="reframe"] button:not(:disabled)')?.focus({preventScroll:true});
  }
  function cancelTools(event){
    if(editing<0||gesture)return;
    event.preventDefault();closeTools(true);
  }
  // The top-layer dialog owns this absolute overlay. Pointer coordinates are
  // viewport-relative, so account for its desktop inset, border and scrolling.
  const ghostOrigin=()=>{const r=dialog.getBoundingClientRect();return {x:r.left+dialog.clientLeft-dialog.scrollLeft,y:r.top+dialog.clientTop-dialog.scrollTop};};
  const rects=()=>buttons.map(b=>b.getBoundingClientRect());
  function target(index){
    buttons.forEach((button,i)=>button.classList.toggle('ks-swap-target',i===index&&i!==gesture?.index));
    if(gesture)gesture.target=index;
  }
  function removeGhost(){ghost?.remove();ghost=null;}
  function landGhost(current){
    if(!ghost||!current.desktop||matchMedia('(prefers-reduced-motion: reduce)').matches){removeGhost();return;}
    const image=ghost,r=rects()[current.target];ghost=null;
    const origin=ghostOrigin(),x=r.left-origin.x,y=r.top-origin.y;
    const start={transform:image.style.transform,width:image.style.width,height:image.style.height,transformOrigin:image.style.transformOrigin,borderWidth:'4px',opacity:.94};
    const end={transform:`translate(${x}px,${y}px)`,width:`${r.width}px`,height:`${r.height}px`,transformOrigin:'0 0',borderWidth:'0px',opacity:1};
    landings.add(image);Object.assign(image.style,end);
    const animation=image.animate([
      start,end
    ],{duration:170,easing:'cubic-bezier(.2,.7,.3,1)'});
    animation.onfinish=()=>{image.remove();landings.delete(image);};
  }
  function stop(commit=false){
    if(!gesture)return;
    const current=gesture;gesture=null;
    setCrop(current.index,current.crop);
    if(commit&&current.target>=0&&current.target!==current.index)landGhost(current);else removeGhost();
    buttons.forEach(b=>{b.classList.remove('ks-swap-source','ks-swap-target','ks-is-panning');});
    if(current.pointer!==undefined&&current.button.hasPointerCapture?.(current.pointer))current.button.releasePointerCapture(current.pointer);
    if(current.started){
      if(commit&&current.target>=0&&current.target!==current.index){onSwap(current.index,current.target);onStatus('Photos swapped.');}
      else{if(commit&&current.pending)setCrop(current.index,current.pending);onPreview();onCrop();onStatus(commit?'Framing updated.':'Move canceled.');}
    }
    if(current.started){muted=true;clearTimeout(muteTimer);muteTimer=setTimeout(()=>muted=false,0);}
  }
  function showGhost(event){
    if(!ghost){
      const r=gesture.rect,source=wrap.querySelector('.ks-preview');
      ghost=document.createElement('canvas');ghost.className='ks-photo-ghost';ghost.setAttribute('aria-hidden','true');
      ghost.width=Math.round(r.width*2);ghost.height=Math.round(r.height*2);
      const bounds=wrap.getBoundingClientRect();
      ghost.getContext('2d').drawImage(source,(r.left-bounds.left)/bounds.width*source.width,(r.top-bounds.top)/bounds.height*source.height,r.width/bounds.width*source.width,r.height/bounds.height*source.height,0,0,ghost.width,ghost.height);
      const width=Math.min(r.width,gesture.desktop?220:150);
      gesture.ghostWidth=width;gesture.ghostHeight=width*r.height/r.width;
      Object.assign(ghost.style,{width:`${width}px`,height:`${gesture.ghostHeight}px`});
      dialog.append(ghost);
    }
    const p=dragGhostPlacement({x:event.clientX,y:event.clientY},gesture,gesture.rect,{width:gesture.ghostWidth,height:gesture.ghostHeight},ghostOrigin(),gesture.desktop);
    ghost.style.transformOrigin=gesture.desktop?`${p.anchorX}px ${p.anchorY}px`:'50% 50%';
    ghost.style.transform=`translate(${p.x}px,${p.y}px) rotate(${gesture.desktop?2:3}deg)`;
  }
  function pointerDown(event){
    const button=event.target.closest('[data-crop]');
    if(!button||event.button!==0||!event.isPrimary||gesture||!canStart())return;
    const index=Number(button.dataset.crop),image=getImage(index);if(!image)return;
    gesture={index,button,image,crop:{...getCrop(index)},rect:button.getBoundingClientRect(),x:event.clientX,y:event.clientY,pointer:event.pointerId,target:index,started:false,desktop:event.pointerType==='mouse',lifted:false};
    button.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event){
    if(!gesture||gesture.pointer!==event.pointerId)return;
    const dy=event.clientY-gesture.y,dx=event.clientX-gesture.x;
    if(!gesture.started&&Math.hypot(dx,dy)<6)return;
    event.preventDefault();
    if(!gesture.started){gesture.started=true;closeTools();onStart();}
    const next=photoSlotAt(rects(),event.clientX,event.clientY),previous=gesture.target;
    target(next);
    if(gesture.desktop&&(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*.8||next!==gesture.index))gesture.lifted=true;
    if(gesture.lifted||next>=0&&next!==gesture.index){
      if(gesture.lifted)gesture.pending=null;
      setCrop(gesture.index,gesture.crop);onPreview();
      gesture.button.classList.add('ks-swap-source');gesture.button.classList.remove('ks-is-panning');showGhost(event);
      if(next!==previous)onStatus(next<0?'Release outside the photos to cancel.':next===gesture.index?'Release here to keep this photo in place.':`Release to swap photos ${gesture.index+1} and ${next+1}.`);
    }else{
      removeGhost();gesture.button.classList.remove('ks-swap-source');gesture.button.classList.add('ks-is-panning');
      if(next===gesture.index){
        gesture.pending=verticalCrop(gesture.image.width,gesture.image.height,slots[gesture.index],gesture.crop,dy,gesture.rect.height);
        setCrop(gesture.index,gesture.pending);onPreview();
      }else{setCrop(gesture.index,gesture.crop);onPreview();}
      if(next!==previous)onStatus(next<0?'Release outside the photos to cancel.':'Drag up or down to reframe.');
    }
  }
  function pointerUp(event){if(gesture?.pointer===event.pointerId){target(photoSlotAt(rects(),event.clientX,event.clientY));stop(gesture.target>=0);}}
  function pointerCancel(event){if(gesture?.pointer===event.pointerId)stop(false);}
  function keyDown(event){
    const button=event.target.closest('[data-crop]');
    if(event.key==='Escape'&&gesture){event.preventDefault();stop(false);return;}
    if(!button)return;
    const index=Number(button.dataset.crop);
    if(!canStart()){if([' ','Enter','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();return;}
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();movePhoto(index,event.key==='ArrowUp'?.04:-.04);
      if(editing===index&&mode==='reframe')updateDirections();
    }
  }
  const click=event=>{if(muted){event.preventDefault();event.stopImmediatePropagation();}};
  const blur=()=>stop(false);
  wrap.addEventListener('pointerdown',pointerDown);wrap.addEventListener('pointermove',pointerMove,{passive:false});wrap.addEventListener('pointerup',pointerUp);wrap.addEventListener('pointercancel',pointerCancel);wrap.addEventListener('keydown',keyDown);wrap.addEventListener('click',click,true);window.addEventListener('blur',blur);
  wrap.addEventListener('click',activatePhoto);tools.addEventListener('click',activateTool);dialog.addEventListener('cancel',cancelTools,true);
  return ()=>{
    if(gesture){setCrop(gesture.index,gesture.crop);gesture=null;}
    wrap.removeEventListener('click',activatePhoto);tools.removeEventListener('click',activateTool);dialog.removeEventListener('cancel',cancelTools,true);
    removeGhost();landings.forEach(image=>image.remove());landings.clear();clearTimeout(muteTimer);wrap.removeEventListener('pointerdown',pointerDown);wrap.removeEventListener('pointermove',pointerMove);wrap.removeEventListener('pointerup',pointerUp);wrap.removeEventListener('pointercancel',pointerCancel);wrap.removeEventListener('keydown',keyDown);wrap.removeEventListener('click',click,true);window.removeEventListener('blur',blur);
  };
}
