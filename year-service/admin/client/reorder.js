const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function reorderItems(items,ids){
  const byId=new Map(items.map(item=>[item.id,item]));
  if(ids.length!==items.length||new Set(ids).size!==ids.length||ids.some(id=>!byId.has(id)))throw new Error('The collection changed. Please try reordering again.');
  return ids.map(id=>byId.get(id));
}
export function reorderButton(kind,count){
  return count<2?'':`<button type="button" class="secondary" id="reorder-toggle" data-busy aria-pressed="false">Reorder ${kind}</button>`;
}
export function reorderToolbar(kind,count,active){
  if(!active)return '';
  return `<section class="reorder-toolbar" aria-label="Arrange ${kind}"><div class="actions"><button type="button" class="secondary" id="reorder-toggle" data-busy aria-pressed="${active}" ${!active&&count<2?'disabled':''}>${active?'Done reordering':`Reorder ${kind}`}</button>${active?'<button type="button" class="quiet" id="reorder-cancel" data-busy>Cancel</button>':''}</div>${active?`<p class="hint" id="reorder-help">Drag the handles to arrange all ${kind}. Then save your draft. Keyboard: Space to pick up, arrow keys to move, Space to drop. Escape cancels a move.</p><p class="reorder-status" id="reorder-status" role="status" aria-live="polite" aria-atomic="true"></p>`:''}</section>`;
}
export function reorderHandle(id,label){
  return `<button type="button" class="reorder-handle" data-reorder-handle="${esc(id)}" aria-label="Move ${esc(label)}" aria-describedby="reorder-help" aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="8" cy="5" r="1.7"/><circle cx="16" cy="5" r="1.7"/><circle cx="8" cy="12" r="1.7"/><circle cx="16" cy="12" r="1.7"/><circle cx="8" cy="19" r="1.7"/><circle cx="16" cy="19" r="1.7"/></svg><span>Drag to reorder</span></button>`;
}

// Pointer events cover mouse, pen and touch. Only the handle captures touch;
// the rest of a card remains available for ordinary scrolling.
export function bindReorder({root,grid,onReorder,canMove=()=>true}){
  let move=null,frame=0;
  const cards=()=>[...grid.children].filter(node=>node.hasAttribute('data-reorder-id'));
  const ids=()=>cards().map(node=>node.dataset.reorderId);
  const announce=text=>{const status=root.querySelector('#reorder-status');if(status)status.textContent=text;};
  const position=()=>cards().indexOf(move.card)+1;
  function restore(){const nodes=new Map(cards().map(node=>[node.dataset.reorderId,node]));move.original.forEach(id=>{if(nodes.has(id))grid.append(nodes.get(id));});}
  function finish(commit){
    if(!move)return;
    const current=move,order=ids();
    if(!commit)restore();
    move=null;cancelAnimationFrame(frame);frame=0;
    current.ghost?.remove();current.card.classList.remove('is-reorder-moving');
    current.handle.setAttribute('aria-pressed','false');document.body.classList.remove('is-reordering');
    if(current.pointerId!==undefined&&current.handle.hasPointerCapture?.(current.pointerId))current.handle.releasePointerCapture(current.pointerId);
    if(commit&&order.some((id,i)=>id!==current.original[i]))onReorder(order,current.card.dataset.reorderId);
    const handle=[...root.querySelectorAll('[data-reorder-handle]')].find(node=>node.dataset.reorderHandle===current.card.dataset.reorderId);
    handle?.focus({preventScroll:true});
    announce(commit?'Order updated in this draft.':'Move canceled.');
  }
  function start(card,handle){
    move={card,handle,original:ids(),keyboard:false,started:false};
    handle.setAttribute('aria-pressed','true');
  }
  function changed(){announce(`${move.handle.getAttribute('aria-label')?.replace(/^Move /,'')}, position ${position()} of ${cards().length}.`);}
  function place(target){
    if(!target||target===move.card)return;
    const list=cards(),from=list.indexOf(move.card),to=list.indexOf(target);
    if(to<0)return;
    grid.insertBefore(move.card,from<to?target.nextSibling:target);changed();
  }
  function pointInside(x,y){const r=grid.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
  function hitTest(){
    if(!move||!pointInside(move.x,move.y))return;
    const target=document.elementFromPoint(move.x,move.y)?.closest('[data-reorder-id]');
    if(target&&target.parentElement===grid)place(target);
  }
  function tick(){
    if(!move?.started||move.keyboard)return;
    if(!canMove()){finish(false);return;}
    const edge=65,y=move.y,speed=y<edge?-Math.ceil((edge-y)/5):y>innerHeight-edge?Math.ceil((y-innerHeight+edge)/5):0;
    if(speed)window.scrollBy(0,Math.max(-18,Math.min(18,speed)));
    hitTest();frame=requestAnimationFrame(tick);
  }
  function pointerDown(event){
    const handle=event.target.closest('[data-reorder-handle]'),card=handle?.closest('[data-reorder-id]');
    if(!card||card.parentElement!==grid||event.button!==0||!event.isPrimary||!canMove()||move)return;
    event.preventDefault();handle.focus({preventScroll:true});start(card,handle);
    const r=card.getBoundingClientRect();Object.assign(move,{pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offsetX:event.clientX-r.left,offsetY:event.clientY-r.top});
    handle.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event){
    if(!move||move.keyboard||event.pointerId!==move.pointerId)return;
    if(!canMove()){finish(false);return;}
    event.preventDefault();move.x=event.clientX;move.y=event.clientY;
    if(!move.started&&Math.hypot(move.x-move.startX,move.y-move.startY)<7)return;
    if(!move.started){
      move.started=true;const r=move.card.getBoundingClientRect();move.ghost=move.card.cloneNode(true);
      move.ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
      move.ghost.removeAttribute('id');move.ghost.classList.add('reorder-ghost');move.ghost.setAttribute('aria-hidden','true');move.ghost.inert=true;
      Object.assign(move.ghost.style,{width:`${r.width}px`,height:`${r.height}px`});
      document.body.append(move.ghost);move.card.classList.add('is-reorder-moving');document.body.classList.add('is-reordering');
      frame=requestAnimationFrame(tick);
    }
    move.ghost.style.transform=`translate3d(${move.x-move.offsetX}px,${move.y-move.offsetY}px,0)`;hitTest();
  }
  function pointerUp(event){if(move&&!move.keyboard&&event.pointerId===move.pointerId)finish(move.started&&canMove()&&pointInside(event.clientX,event.clientY));}
  function pointerCancel(event){if(move&&!move.keyboard&&event.pointerId===move.pointerId)finish(false);}
  function keyDown(event){
    const handle=event.target.closest('[data-reorder-handle]'),card=handle?.closest('[data-reorder-id]');
    if(event.key==='Escape'&&move){event.preventDefault();finish(false);return;}
    if(!card||card.parentElement!==grid||!canMove())return;
    if(event.key===' '||event.key==='Enter'){
      event.preventDefault();if(move?.keyboard&&move.card===card)finish(true);
      else if(!move){start(card,handle);move.keyboard=true;move.started=true;card.classList.add('is-reorder-moving');announce('Picked up. Use arrow keys to move, Space to drop, or Escape to cancel.');}
      return;
    }
    if(!move?.keyboard||move.card!==card||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const list=cards(),index=list.indexOf(card),next=event.key==='Home'?0:event.key==='End'?list.length-1:index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
    if(next>=0&&next<list.length){place(list[next]);handle.focus({preventScroll:true});card.scrollIntoView({block:'nearest'});}
  }
  const noNativeDrag=event=>event.preventDefault();
  const blurred=()=>{if(move)finish(false);};
  grid.addEventListener('pointerdown',pointerDown);grid.addEventListener('keydown',keyDown);grid.addEventListener('dragstart',noNativeDrag);
  window.addEventListener('blur',blurred);
  window.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerCancel);
  return ()=>{if(move)finish(false);grid.removeEventListener('pointerdown',pointerDown);grid.removeEventListener('keydown',keyDown);grid.removeEventListener('dragstart',noNativeDrag);window.removeEventListener('blur',blurred);window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerCancel);};
}
