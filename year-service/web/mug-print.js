import {mugFonts} from './mug-options.js';
// Render only the selected, authenticated published cutout and caption. PNG
// contains pixels, not embedded font files; no gallery originals are requested.
export async function renderMugPrint(design,configuration,variant){
 const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=Math.round(1800*variant.printHeight/variant.printWidth);
 const context=canvas.getContext('2d'),image=new Image();image.src=design.src;await image.decode();
 const family=mugFonts.find(f=>f.id===configuration.font)?.family||'Asap, sans-serif';
 await document.fonts.load(`600 32px ${family}`);
 const h=canvas.height,padding=h*.08,caption=String(design.caption||'');
 // A centered design on the wrap makes Printful's front view the primary proof.
 const imageHeight=h*(caption?0.7:0.84),imageWidth=h*.8,scale=Math.min(imageWidth/image.naturalWidth,imageHeight/image.naturalHeight);
 const w=image.naturalWidth*scale,ih=image.naturalHeight*scale;
 context.drawImage(image,(canvas.width-w)/2,padding+(imageHeight-ih)/2,w,ih);
 if(caption){
  let fontSize=h*.052,lines=[];const maxWidth=h*1.1;
  for(;fontSize>=h*.025;fontSize-=1){
   context.font=`600 ${fontSize}px ${family}`;lines=[];let line='';
   for(const word of caption.split(/\s+/)){const next=line?line+' '+word:word;if(line&&context.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
   if(lines.length*fontSize*1.2<=h*.18&&lines.every(l=>context.measureText(l).width<=maxWidth))break;
  }
  context.fillStyle=configuration.style==='black-glossy'?'#ffffff':'#20392f';context.textAlign='center';context.textBaseline='top';lines.forEach((line,i)=>context.fillText(line,canvas.width/2,padding+imageHeight+h*.025+i*fontSize*1.2,maxWidth));
 }
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare the mug artwork.')),'image/png'));
}
