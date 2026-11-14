import {mugFonts} from './mug-options.js';
import {mugPrintLayout} from './mug-layout.js';
// Render only the selected, authenticated published cutout and caption. PNG
// contains pixels, not embedded font files; no gallery originals are requested.
export async function renderMugPrint(design,configuration,variant){
 const canvas=document.createElement('canvas');canvas.width=variant.renderWidth||1800;canvas.height=Math.round(canvas.width*variant.printHeight/variant.printWidth);
 const context=canvas.getContext('2d'),image=variant.sourceImage||new Image();if(!variant.sourceImage){image.src=design.src;await image.decode();}
 const family=mugFonts.find(f=>f.id===configuration.font)?.family||'Asap, sans-serif';
 await document.fonts.load(`600 32px ${family}`);
 const layout=mugPrintLayout(canvas.width,canvas.height,variant),h=layout.panelSize,padding=layout.top+h*.08,caption=String(design.caption||'');
 // One wrap file freezes both sides and is reused for previews and orders.
 const imageHeight=h*(caption?0.7:0.84),imageWidth=h*.8,scale=Math.min(imageWidth/image.naturalWidth,imageHeight/image.naturalHeight);
 const w=image.naturalWidth*scale,ih=image.naturalHeight*scale;
 context.drawImage(image,layout.selectedCenter-w/2,padding+(imageHeight-ih)/2,w,ih);
 if(caption){
  let fontSize=h*.052,lines=[];const maxWidth=h*1.1;
  for(;fontSize>=h*.025;fontSize-=1){
   context.font=`600 ${fontSize}px ${family}`;lines=[];let line='';
   for(const word of caption.split(/\s+/)){const next=line?line+' '+word:word;if(line&&context.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
   if(lines.length*fontSize*1.2<=h*.18&&lines.every(l=>context.measureText(l).width<=maxWidth))break;
  }
  context.fillStyle=configuration.style==='black-glossy'?'#ffffff':'#20392f';context.textAlign='center';context.textBaseline='top';lines.forEach((line,i)=>context.fillText(line,layout.selectedCenter,padding+imageHeight+h*.025+i*fontSize*1.2,maxWidth));
 }
 const santa=variant.santaImage||new Image();if(!variant.santaImage){santa.src='/pixel-santa.png';await santa.decode();}
 const santaHeight=h*.76,santaScale=Math.min(h*.8/santa.naturalWidth,santaHeight/santa.naturalHeight),sw=santa.naturalWidth*santaScale,sh=santa.naturalHeight*santaScale;
 context.drawImage(santa,layout.santaCenter-sw/2,padding+(santaHeight-sh)/2,sw,sh);
 context.fillStyle=configuration.style==='black-glossy'?'#ffffff':'#20392f';context.font=`600 ${h*.06}px Georgia, serif`;context.textAlign='center';context.textBaseline='top';
 context.fillText('pixelbook ’26',layout.santaCenter,padding+santaHeight+h*.035,h*.95);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare the mug artwork.')),'image/png'));
}
