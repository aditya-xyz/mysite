// A page keeps every thumbnail's proportions and scales uniformly to fit its rows.
export function fittedPickerWidth(columnWidth,availableHeight,ratios,columns,rowGap,border=14){
 const rows=Math.ceil(ratios.length/columns),inner=Math.max(1,columnWidth-border);
 let naturalHeight=0;
 for(let i=0;i<ratios.length;i+=columns)naturalHeight+=Math.max(...ratios.slice(i,i+columns).map(r=>inner/(r>0&&Number.isFinite(r)?r:.75)));
 const room=Math.max(1,availableHeight-rows*border-Math.max(0,rows-1)*rowGap);
 return Math.min(columnWidth,Math.floor((inner*Math.min(1,room/Math.max(1,naturalHeight))+border)*100)/100);
}
export function fitPostcardPicker(modal){
 const body=modal.querySelector('.ks-select-body'),grid=body?.querySelector('.ks-picks');if(!grid)return ()=>{};
 const cards=[...grid.querySelectorAll('.ks-pick')],images=cards.map(c=>c.querySelector('img'));
 if(!cards.length)return ()=>{};
 let frame=0,active=true;
 const n=value=>parseFloat(value)||0;
 function fit(){
  frame=0;if(!active||!modal.open||!grid.clientWidth)return;
  const gs=getComputedStyle(grid),bs=getComputedStyle(body),ds=getComputedStyle(modal),shell=body.querySelector('.ks-pick-shell'),nav=body.querySelector('.ks-pick-pages'),status=body.querySelector('.ks-status');
  const columns=gs.gridTemplateColumns.split(/\s+/).length;
  const column=(grid.clientWidth-n(gs.paddingLeft)-n(gs.paddingRight)-(columns-1)*n(gs.columnGap))/columns;
  const statusHeight=status?.offsetHeight?status.offsetHeight+n(getComputedStyle(status).marginTop):0;
  const chrome=modal.querySelector('.ks-top').offsetHeight+modal.querySelector('.ks-bottom').offsetHeight+n(bs.paddingTop)+n(bs.paddingBottom)+n(gs.paddingTop)+n(gs.paddingBottom)+n(ds.borderTopWidth)+n(ds.borderBottomWidth)+(nav?nav.offsetHeight+n(getComputedStyle(shell).rowGap):0)+statusHeight;
  const limit=Math.min(1000,(window.visualViewport?.height||innerHeight)-24);
  const ratios=images.map(img=>{const w=img.naturalWidth||Number(img.getAttribute('width')),h=img.naturalHeight||Number(img.getAttribute('height'));return w&&h?w/h:.75;});
  const cardStyle=getComputedStyle(cards[0]),border=n(cardStyle.borderLeftWidth)+n(cardStyle.borderRightWidth);
  const width=fittedPickerWidth(column,limit-chrome-4,ratios,columns,n(gs.rowGap),border)+'px';
  cards.forEach(card=>{if(card.style.width!==width)card.style.width=width;});
 }
 function schedule(){if(active&&!frame)frame=requestAnimationFrame(fit);}
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
 [grid,modal.querySelector('.ks-top'),modal.querySelector('.ks-bottom'),body.querySelector('.ks-status'),body.querySelector('.ks-pick-pages')].filter(Boolean).forEach(e=>observer?.observe(e));
 images.forEach(img=>{img.addEventListener('load',schedule);img.addEventListener('error',schedule);});
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);schedule();
 return ()=>{active=false;cancelAnimationFrame(frame);observer?.disconnect();images.forEach(img=>{img.removeEventListener('load',schedule);img.removeEventListener('error',schedule);});window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);};
}
