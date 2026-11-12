import {CARD_WIDTH,CARD_HEIGHT} from './keepsake-layout.js';
export function drawKeepsakeFrame(ctx,frame){
  const paper=frame==='moss'?'#e3e8d5':frame==='santa'?'#fffaf1':'#fff';
  ctx.fillStyle=paper;ctx.fillRect(0,0,CARD_WIDTH,CARD_HEIGHT);
  if(frame==='santa'){
    ctx.fillStyle='#ae4237';
    for(let x=-CARD_HEIGHT;x<CARD_WIDTH;x+=96){
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+48,0);ctx.lineTo(x+48+CARD_HEIGHT,CARD_HEIGHT);ctx.lineTo(x+CARD_HEIGHT,CARD_HEIGHT);ctx.closePath();ctx.fill();
    }
    ctx.fillStyle=paper;ctx.fillRect(24,24,CARD_WIDTH-48,CARD_HEIGHT-48);
  }
  return paper;
}
