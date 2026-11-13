export function addressLines(address){return [address.line1,address.line2,`${address.city}, ${address.state} ${address.postalCode}`,address.country].filter(Boolean);}
export function drawPostcardBack(canvas,{note,authors,recipientName,address}){
 canvas.width=1800;canvas.height=1200;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f8f6ec';ctx.fillRect(0,0,1800,1200);ctx.fillStyle='#20392f';
 ctx.font='italic 42px Georgia, serif';ctx.fillText('A little note from us',90,140);
 let noteSize=38,lines=[];
 const wrap=()=>{const out=[];for(const paragraph of note.split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(ctx.measureText(line+word).width>730&&line){out.push(line.trim());line='';}for(const char of word+' '){if(ctx.measureText(line+char).width>730){out.push(line.trim());line='';}line+=char;}}out.push(line.trim());}return out;};
 do{ctx.font=`${noteSize}px Georgia, serif`;lines=wrap();if(lines.length*Math.ceil(noteSize*1.4)<=740)break;noteSize--;}while(noteSize>20);
 lines.forEach((line,i)=>ctx.fillText(line,90,225+i*Math.ceil(noteSize*1.4)));
 ctx.font='italic 36px Georgia, serif';ctx.fillText('With love,',90,1040);
 ctx.font='34px Georgia, serif';let size=34;while(ctx.measureText(authors).width>730&&size>14)ctx.font=`${--size}px Georgia, serif`;ctx.fillText(authors,90,1095);
 ctx.strokeStyle='#bdc9b5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(900,90);ctx.lineTo(900,1110);ctx.stroke();
 ctx.strokeRect(1510,80,190,170);ctx.fillStyle='#526559';ctx.font='22px system-ui';ctx.fillText('POSTAGE',1540,175);
 ctx.fillStyle='#20392f';ctx.font='34px system-ui';
 [recipientName,...addressLines(address)].forEach((line,i)=>{let size=34;ctx.font=`${size}px system-ui`;while(ctx.measureText(line).width>690&&size>14)ctx.font=`${--size}px system-ui`;ctx.fillText(line,990,510+i*56);});
}

export function drawFoldedNote(canvas,{note='',authors='',includeSignoff=true}){
 canvas.width=850;canvas.height=1100;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,850,1100);ctx.fillStyle='#244637';
 let size=44,lines=[];
 const wrap=()=>{
  const result=[];for(const paragraph of note.split('\n')){
   let line='';for(const word of paragraph.split(/\s+/)){
    if(line&&ctx.measureText(line+' '+word).width>650){result.push(line);line='';}
    for(const char of (line?' ':'')+word){if(ctx.measureText(line+char).width>650){result.push(line);line='';}line+=char;}
   }result.push(line);
  }return result;
 };
 do{ctx.font=`${size}px Caveat, Georgia, serif`;lines=wrap();if(lines.length*size*1.4<760)break;size--;}while(size>20);
 const height=lines.length*size*1.4+(includeSignoff?125:0),y=Math.max(100,(1100-height)/2);
 lines.forEach((line,i)=>ctx.fillText(line,100,y+i*size*1.4));
 if(!includeSignoff)return;
 ctx.font='38px Caveat, Georgia, serif';ctx.fillText('With love,',100,y+lines.length*size*1.4+40);
 let signatureSize=38;while(ctx.measureText(authors).width>650&&signatureSize>16)ctx.font=`${--signatureSize}px Caveat, Georgia, serif`;
 ctx.fillText(authors,100,y+lines.length*size*1.4+90);
}
