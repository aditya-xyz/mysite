import {mugFonts} from './mug-options.js';
import {mugPrintLayout} from './mug-layout.js';
// Render only the selected, authenticated published cutout and caption. PNG
// contains pixels, not embedded font files; no gallery originals are requested.
export async function renderMugPrint(design,configuration,variant){
 const canvas=document.createElement('canvas');canvas.width=variant.renderWidth||1800;canvas.height=Math.round(canvas.width*variant.printHeight/variant.printWidth);
 const context=canvas.getContext('2d'),image=variant.sourceImage||new Image();if(!variant.sourceImage){image.src=design.printSrc||design.src;await image.decode();}
 const family=mugFonts.find(f=>f.id===configuration.font)?.family||'Asap, sans-serif';
 await document.fonts.load(`600 32px ${family}`);
 const layout=mugPrintLayout(canvas.width,canvas.height,variant),h=layout.panelSize,padding=layout.top+h*.08,caption=String(design.caption||'');
 // One wrap file freezes both sides and is reused for previews and orders.
 // Size Pixel from the full print height; narrow side guides only constrain width.
 const room=Math.min(layout.selectedCenter,canvas.width-layout.santaCenter,(layout.santaCenter-layout.selectedCenter)/2);
 const imageTop=canvas.height*.045,imageHeight=canvas.height*(caption ? .78 : .91),imageWidth=Math.min(canvas.height*.95,room*1.9),scale=Math.min(imageWidth/image.naturalWidth,imageHeight/image.naturalHeight);
 const w=image.naturalWidth*scale,ih=image.naturalHeight*scale;
 context.drawImage(image,layout.selectedCenter-w/2,imageTop+(imageHeight-ih)/2,w,ih);
 if(caption){
  let fontSize=canvas.height*.065,lines=[];const maxWidth=room*1.9;
  for(;fontSize>=canvas.height*.025;fontSize-=1){
   context.font=`600 ${fontSize}px ${family}`;lines=[];let line='';
   for(const word of caption.split(/\s+/)){const next=line?line+' '+word:word;if(line&&context.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
   if(lines.length*fontSize*1.2<=canvas.height*.12&&lines.every(l=>context.measureText(l).width<=maxWidth))break;
  }
  context.fillStyle=configuration.style==='black-glossy'?'#ffffff':'#20392f';context.textAlign='center';context.textBaseline='top';lines.forEach((line,i)=>context.fillText(line,layout.selectedCenter,imageTop+imageHeight+canvas.height*.02+i*fontSize*1.2,maxWidth));
 }
 const santa=variant.santaImage||new Image();if(!variant.santaImage){santa.src='/pixel-santa.png';await santa.decode();}
 // Black mugs have narrower guide panels. Use the full print height for Santa,
 // as for the selected mugshot, while retaining the safe side-panel width.
 const black=configuration.style==='black-glossy';
 const santaHeight=black?canvas.height*.78:h*.76,santaWidth=black?imageWidth:h*.8;
 const santaScale=Math.min(santaWidth/santa.naturalWidth,santaHeight/santa.naturalHeight),sw=santa.naturalWidth*santaScale,sh=santa.naturalHeight*santaScale;
 context.drawImage(santa,layout.santaCenter-sw/2,black?imageTop+(santaHeight-sh)/2:padding+(santaHeight-sh)/2,sw,sh);
 context.fillStyle=black?'#ffffff':'#20392f';context.font=`600 ${(black?canvas.height:h)*.06}px Georgia, serif`;context.textAlign='center';context.textBaseline='top';
 context.fillText('pixelbook ’26',layout.santaCenter,black?imageTop+santaHeight+canvas.height*.02:padding+santaHeight+h*.035,black?room*1.9:h*.95);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare the mug artwork.')),'image/png'));
}
