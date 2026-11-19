import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Shared browser canvas renderer.
import {drawDigitalCard,noteLines} from '../web/digital-card.js';
// @ts-expect-error Reviewed multilingual copy.
import {digitalUi,digitalDictionary} from '../web/digital-copy.js';
for(const personalized of [false,true])test(`complete ${personalized?'personalized':'default'} JPG has the chosen border, full note and correct aspect`,()=>{
 const texts:string[]=[],draws:any[]=[],ctx={font:'',measureText(v:string){return {width:[...v].length*10};},fillText(v:string){texts.push(v);},fillRect(){},drawImage(...args:any[]){draws.push(args);}},canvas={width:0,height:0,getContext(){return ctx;}};
 const background={width:1200,height:1500,id:'chosen-winterlight'},image={width:1200,height:1500},note='Dear household,\n\nEvery word stays here, including the full greeting and sign-off.\nwith love, Pixel';
 drawDigitalCard(canvas,{personalized,images:[image,image,image],crops:[],defaultImage:image,background,note,authors:'Pixel',year:2026});
 assert.equal(canvas.width,1080);assert.equal(canvas.height,personalized?1920:1440);assert.equal(draws.slice(0,9).every(d=>d[0]===background),true);assert.equal(draws.length,personalized?15:12);assert.ok(texts.includes('Dear household,'));assert.ok(texts.includes('with love, Pixel'));assert.equal(texts.filter(t=>t==='with love, Pixel').length,1);
 const chinese='每一個字都要完整保留在這張明信片裡';const lines=noteLines(ctx,chinese,50);assert.equal(lines.join(''),chinese);assert.ok(lines.every((line:string)=>[...line].length<=5));
});
test('all new digital-only copy has Marathi and Traditional Chinese counterparts',()=>{
 assert.ok(digitalUi.length>=30);for(const [source,mr,zh] of digitalUi){assert.ok(source&&mr?.trim()&&zh?.trim());assert.notEqual(source,mr);assert.notEqual(source,zh);}
 assert.match(digitalDictionary('mr')['Save digital postcard'],/जतन करा/);assert.match(digitalDictionary('zh-TW')['Choosing digital means we’ll skip mailing a postcard to your household.'],/不會寄紙本/);
});
