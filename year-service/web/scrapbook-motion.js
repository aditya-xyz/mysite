// Motion belongs to the presentation; photo order and exported pixels stay stable.
export function mountScrapbookMotion(root){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),animations=new Set();
  const cards=[...root.querySelectorAll('.grid .card')],seen=new WeakSet(),visible=new WeakSet();
  const stack=root.querySelector('.pb-mugshot-stack'),portraits=stack?[...stack.querySelectorAll('img')]:[];
  const tail=root.querySelector('.pb-tail-word');
  const gifts=[...root.querySelectorAll('.ks-entry,.pb-gift')];
  let timer,swapTimer,stackVisible=false,destroyed=false,tailVisible=false,lastWag=-Infinity;
  function animate(node,frames,options){
    if(reduced.matches||!node?.animate)return;
    const animation=node.animate(frames,options);animations.add(animation);
    animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
    return animation;
  }
  function photoReady(card){
    if(!card||seen.has(card)||!visible.has(card)||!card.querySelector('.is-ready'))return;
    seen.add(card);card.classList.remove('pb-photo-waiting');observer?.unobserve(card);
    const tilt=getComputedStyle(card).getPropertyValue('--photo-tilt').trim()||'0deg';
    animate(card,[{opacity:0,transform:`translateY(14px) rotate(calc(${tilt} - 1.5deg))`},{opacity:1,transform:`translateY(-1px) rotate(${tilt})`,offset:.8},{opacity:1,transform:`rotate(${tilt})`}],{duration:480,delay:(cards.indexOf(card)%3)*55,easing:'cubic-bezier(.22,.7,.3,1)',fill:'backwards'});
  }
  function schedule(){
    clearTimeout(timer);
    if(destroyed||reduced.matches||document.hidden||!stackVisible||portraits.length<2)return;
    timer=setTimeout(()=>{cycle();schedule();},4600);
  }
  function cycle(){
    if(destroyed||swapTimer||portraits.length<2)return;
    // A quick tap never exposes a blank image or queues multiple swaps.
    const next=portraits.find(p=>p.dataset.stackPosition==='1');
    if(!next?.complete||!next.naturalWidth)return;
    stack.dataset.previewDesign=next.dataset.mugshotId;
    const advance=()=>{
      swapTimer=null;
      if(destroyed)return;
      portraits.forEach(p=>{p.dataset.stackPosition=String((Number(p.dataset.stackPosition)+portraits.length-1)%portraits.length);});
    };
    if(reduced.matches){advance();return;}
    const top=portraits.find(p=>p.dataset.stackPosition==='0');
    animate(top,[{translate:'0 0',opacity:1},{translate:'12px -7px',opacity:0}],{duration:220,easing:'ease-in'});
    swapTimer=setTimeout(advance,210);
  }
  function wag(){
    if(!tailVisible||document.hidden||reduced.matches||performance.now()-lastWag<1000)return;
    lastWag=performance.now();
    animate(tail,[{rotate:'0deg'},{rotate:'9deg'},{rotate:'-7deg'},{rotate:'5deg'},{rotate:'-3deg'},{rotate:'0deg'}],{duration:720,easing:'ease-in-out'});
  }
  const onClick=()=>{cycle();schedule();};
  stack?.addEventListener('click',onClick);
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    entries.forEach(({target,isIntersecting})=>{
      if(target===stack){stackVisible=isIntersecting;schedule();}
      else if(target===tail){tailVisible=isIntersecting;if(isIntersecting)wag();}
      else if(isIntersecting){visible.add(target);photoReady(target);}else visible.delete(target);
    });
  },{threshold:.08}):null;
  cards.forEach(card=>{if(observer){if(!reduced.matches)card.classList.add('pb-photo-waiting');observer.observe(card);}else visible.add(card);});
  // Short keepsake cards need to be well inside the screen before their reveal.
  // The photo observer's early threshold can spend the whole entrance at the edge.
  const giftObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    entries.forEach(({target,isIntersecting,intersectionRatio})=>{
      if(!isIntersecting||intersectionRatio<.25||seen.has(target))return;
      seen.add(target);giftObserver.unobserve(target);
      const distance=window.innerWidth<360?16:window.innerWidth<=700?24:28;
      const direction=target.classList.contains('ks-entry')?-1:1;
      animate(target,[{opacity:.15,translate:`${distance*direction}px 8px`},{opacity:1,translate:'0 0'}],{duration:650,easing:'cubic-bezier(.2,.75,.3,1)',fill:'backwards'});
    });
  },{threshold:.25,rootMargin:'0px 0px -64px 0px'}):null;
  gifts.forEach(gift=>giftObserver?.observe(gift));
  if(stack)observer?.observe(stack);if(tail)observer?.observe(tail);
  function preferenceChanged(){
    if(reduced.matches){if(swapTimer&&stack)stack.dataset.previewDesign=portraits.find(p=>p.dataset.stackPosition==='0')?.dataset.mugshotId||'';clearTimeout(swapTimer);swapTimer=null;animations.forEach(a=>a.cancel());cards.forEach(c=>c.classList.remove('pb-photo-waiting'));}
    schedule();
  }
  reduced.addEventListener('change',preferenceChanged);document.addEventListener('visibilitychange',schedule);window.addEventListener('scroll',wag,{passive:true});
  return {photoReady,destroy(){destroyed=true;clearTimeout(timer);clearTimeout(swapTimer);observer?.disconnect();giftObserver?.disconnect();animations.forEach(a=>a.cancel());cards.forEach(c=>c.classList.remove('pb-photo-waiting'));stack?.removeEventListener('click',onClick);reduced.removeEventListener('change',preferenceChanged);document.removeEventListener('visibilitychange',schedule);window.removeEventListener('scroll',wag);}};
}

export function assembleKeepsake(canvas,slots){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!canvas.animate)return;
  const wrap=canvas.parentElement,overlay=document.createElement('div');
  overlay.className='ks-assembly';overlay.setAttribute('aria-hidden','true');
  const footerTop=Math.max(...slots.map(s=>s.y+s.height));
  const regions=[...slots,{x:0,y:footerTop,width:canvas.width,height:canvas.height-footerTop}];
  const animations=regions.map((slot,i)=>{
    const layer=document.createElement('canvas');layer.width=slot.width;layer.height=slot.height;
    layer.getContext('2d').drawImage(canvas,slot.x,slot.y,slot.width,slot.height,0,0,slot.width,slot.height);
    Object.assign(layer.style,{left:`${slot.x/canvas.width*100}%`,top:`${slot.y/canvas.height*100}%`,width:`${slot.width/canvas.width*100}%`,height:`${slot.height/canvas.height*100}%`});overlay.append(layer);
    return {layer,i};
  });
  wrap.querySelector('.ks-assembly')?.remove();wrap.append(overlay);
  // Show the finished export underneath; only these disposable pieces move.
  overlay.style.background=canvas.dataset.paper;
  Promise.allSettled(animations.map(({layer,i})=>layer.animate([{opacity:0,transform:`translateY(${i===3?5:14}px) rotate(${i%2?1.5:-1.5}deg)`},{opacity:1,transform:'none'}],{duration:380,delay:i*100,easing:'cubic-bezier(.2,.7,.3,1)',fill:'both'}).finished)).finally(()=>overlay.remove());
}
