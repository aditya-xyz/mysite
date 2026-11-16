// Explicit local inputs only. Originals are never copied to public assets or committed.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {defaultKeepsakeCopy} from './keepsake-default-copy.mjs';
import {keepsakeFrames} from '../web/keepsake-frames.js';
import {drawKeepsakeFrame} from '../web/keepsake-frame.js';
import {cardSlots,coverCrop} from '../web/keepsake-layout.js';
if(!process.env.PIXELBOOK_CANVAS_MODULE)throw Error('Set PIXELBOOK_CANVAS_MODULE to an installed @napi-rs/canvas module path.');
const {createCanvas,loadImage,GlobalFonts}=await import(process.env.PIXELBOOK_CANVAS_MODULE);
const directory='.private/keepsake-defaults',input=JSON.parse(await readFile(process.argv[2]||directory+'/inputs.json','utf8'));
if(!Array.isArray(input.photos)||input.photos.length!==3)throw Error('Supply three approved local photo paths.');
await mkdir(directory,{recursive:true});
const previous=JSON.parse(await readFile(directory+'/manifest.json','utf8'));await mkdir(directory+'/history/'+previous.revision,{recursive:true});await writeFile(directory+'/history/'+previous.revision+'/manifest.json',JSON.stringify(previous));
GlobalFonts.register(await readFile('web/fonts/asap-variable.woff2'),'Asap');
const images=await Promise.all(input.photos.map(loadImage)),pixel=await loadImage('web/pixel-santa.png'),hash=createHash('sha256');
for(const path of input.photos)hash.update(await readFile(path));
for(const f of keepsakeFrames)hash.update(await readFile('web'+f.src));hash.update(JSON.stringify([cardSlots,input.crops,defaultKeepsakeCopy,'winter-frames-v2-taller-photos']));const revision=hash.digest('hex').slice(0,32),frames={...previous.frames};
for(const frame of keepsakeFrames){
 const canvas=createCanvas(1200,1500),ctx=canvas.getContext('2d');drawKeepsakeFrame(ctx,frame.id,await loadImage('web'+frame.src));ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 images.forEach((image,i)=>{const slot=cardSlots[i],crop=coverCrop(image.width,image.height,slot.width,slot.height,input.crops?.[i]);ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,slot.x,slot.y,slot.width,slot.height);});
 ctx.fillStyle='#793b32';ctx.textAlign='center';ctx.font='700 48px Asap';ctx.fillText(defaultKeepsakeCopy.greeting,500,1205,790);ctx.font='30px Asap';ctx.fillText(`${defaultKeepsakeCopy.signature} · 2026  ♥`,500,1260,790);
 const height=160,width=height*pixel.width/pixel.height;ctx.drawImage(pixel,1000-width/2,1170,width,height);
 const bytes=canvas.toBuffer('image/jpeg');await writeFile(directory+'/'+frame.id+'.jpg',bytes);frames[frame.id]=`2026/keepsake-defaults/${revision}/${frame.id}.jpg`;
}
await writeFile(directory+'/manifest.json',JSON.stringify({revision,frames,copy:defaultKeepsakeCopy}));console.log('Rendered Starry Night, Evergreen and Winterlight from approved original photos.');
