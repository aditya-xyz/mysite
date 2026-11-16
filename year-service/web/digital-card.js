import {coverCrop,cardSlots} from './keepsake-layout.js';
const graphemeSegmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
const words=text=>text.match(/\S+\s*/gu)||[''];
export function noteLines(ctx,text,width){
 const result=[];for(const paragraph of String(text).split('\n')){let line='';for(const word of words(paragraph)){if(line&&ctx.measureText(line+word).width>width){result.push(line.trim());line='';}for(const segment of (graphemeSegmenter?[...graphemeSegmenter.segment(word)].map(s=>s.segment):[...word])){if(line&&ctx.measureText(line+segment).width>width){result.push(line.trim());line='';}line+=segment;}}result.push(line.trim());}return result;
}
export function drawDigitalCard(canvas,{personalized,images=[],crops=[],defaultImage,background,note,authors,year}){
 canvas.width=1080;canvas.height=personalized?1920:1440;const ctx=canvas.getContext('2d'),height=canvas.height;
 ctx.fillStyle='#fff6e8';ctx.fillRect(0,0,1080,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 const sw=background.width||background.naturalWidth,sh=background.height||background.naturalHeight,sx=[0,220,sw-220,sw],sy=[0,220,sh-260,sh],dx=[0,198,882,1080],dy=[0,198,height-234,height];
 for(let y=0;y<3;y++)for(let x=0;x<3;x++)ctx.drawImage(background,sx[x],sy[y],sx[x+1]-sx[x],sy[y+1]-sy[y],dx[x],dy[y],dx[x+1]-dx[x],dy[y+1]-dy[y]);
 function collage(y,personal){const targets=[{x:126,y,w:544,h:personalized?480:500},{x:682,y,w:272,h:personalized?234:244},{x:682,y:y+(personalized?246:256),w:272,h:personalized?234:244}];
  targets.forEach((t,i)=>{if(personal){const im=images[i],s=coverCrop(im.width||im.naturalWidth,im.height||im.naturalHeight,t.w,t.h,crops[i]);ctx.drawImage(im,s.x,s.y,s.width,s.height,t.x,t.y,t.w,t.h);}else{const s=cardSlots[i],crop=coverCrop(s.width,s.height,t.w,t.h);ctx.drawImage(defaultImage,s.x+crop.x,s.y+crop.y,crop.width,crop.height,t.x,t.y,t.w,t.h);}});
 }
 function label(text,y,size=36){ctx.textAlign='center';ctx.fillStyle='#793b32';ctx.font=`700 ${size}px Asap, sans-serif`;while(ctx.measureText(text).width>820&&size>16)ctx.font=`700 ${--size}px Asap, sans-serif`;ctx.fillText(text,540,y);}
 collage(personalized?166:150,personalized);label(personalized?'a few of our favorite humans':'from our little pack to yours',personalized?692:700);
 if(!personalized)label(`aditya & angela · ${year}`,741,25);
 const region=personalized?{y:772,h:310}:{y:790,h:398};let size=47,lines=[];
 for(;size>=10;size--){ctx.font=`${size}px Caveat, Georgia, serif`;lines=noteLines(ctx,note,760);if(lines.length*size*1.28<=region.h)break;}
 if(size<10)throw new Error('The note is too long for this layout. Please contact us.');
 const leading=size*1.28,start=region.y+(region.h-lines.length*leading)/2;ctx.fillStyle='#244637';ctx.textAlign='center';lines.forEach((line,i)=>ctx.fillText(line,540,start+i*leading));
 if(personalized){collage(1136,false);label('from our little pack to yours',1663);label(`aditya & angela · ${year}`,1707,24);}
}
export async function digitalCardFile(options){
 let fontTimer;try{await Promise.race([Promise.allSettled([document.fonts.load('700 36px Asap'),document.fonts.load('41px Caveat')]),new Promise(resolve=>fontTimer=setTimeout(resolve,1500))]);}finally{clearTimeout(fontTimer);}
 const canvas=document.createElement('canvas');drawDigitalCard(canvas,options);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Your digital postcard could not be prepared. Please try again.')),'image/jpeg',.94));
 return new File([blob],`pixelbook-${options.year}-${options.personalized?'story':'digital'}-${Date.now()}.jpg`,{type:'image/jpeg'});
}
