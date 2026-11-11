// Keep the lightbox in the same personal-then-shared order as the visible page.
export function photoOrder(photos){return [...photos.filter(p=>p.personal),...photos.filter(p=>!p.personal)];}
export function adjacentIndex(index,step,length){return Math.max(0,Math.min(length-1,index+step));}
export function swipeStep(dx,dy){return Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.3?(dx<0?1:-1):0;}
// One trackpad gesture advances at most one image, including its momentum events.
export function wheelNavigation(onStep){
  let last=-Infinity,total=0,moved=false;
  return event=>{
    if(event.ctrlKey||Math.abs(event.deltaX)<=Math.abs(event.deltaY)||!event.deltaX)return false;
    if(event.timeStamp-last>200){total=0;moved=false;}
    last=event.timeStamp;total+=event.deltaX*(event.deltaMode===1?16:event.deltaMode===2?640:1);
    if(!moved&&Math.abs(total)>=60){moved=true;onStep(total>0?1:-1);}
    return true;
  };
}

// A short moving window avoids a line of dozens of dots in a large scrapbook.
export function paginationDots(index,length){
  if(length<2)return [];
  const count=Math.min(7,length),current=Math.max(0,Math.min(length-1,index));
  const start=Math.max(0,Math.min(length-count,current-Math.floor(count/2)));
  return Array.from({length:count},(_,offset)=>({index:start+offset,active:start+offset===current,small:(offset===0&&start>0)||(offset===count-1&&start+count<length)}));
}

export function dismissDrag(dx,dy){return dy>=96&&dy>Math.abs(dx)*1.4;}
