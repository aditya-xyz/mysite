import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
// @ts-expect-error Shared browser frame configuration.
import{keepsakeFrames,defaultKeepsakeFrame,frameBackground,framePreview}from'../web/keepsake-frames.js';
// @ts-expect-error Shared canvas geometry.
import{cardSlots,CARD_WIDTH,CARD_HEIGHT}from'../web/keepsake-layout.js';
test('approved winter frames have the requested order, default and real frame-only assets',async()=>{
 assert.equal(defaultKeepsakeFrame,'starry-night');assert.deepEqual(keepsakeFrames.map((f:any)=>f.label),['Starry Night','Evergreen','Winterlight']);
 for(const frame of keepsakeFrames){const bytes=await readFile('web'+frameBackground(frame.id));assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);}
 for(const slot of cardSlots){assert.ok(slot.x>=CARD_WIDTH*.08);assert.ok(slot.y>=CARD_HEIGHT*.08);assert.ok(slot.x+slot.width<=CARD_WIDTH*.92);assert.ok(slot.y+slot.height<=CARD_HEIGHT*.76);}
 assert.equal(frameBackground('santa'),null,'Historical recipe IDs do not acquire new frame artwork');
});

test('bottom photos retain their original proportions within one pixel',()=>{
 for(const slot of cardSlots.slice(1))assert.ok(Math.abs(slot.height-slot.width*480/544)<1);
});

test('screen borders stay small while print artwork remains full resolution',async()=>{
 for(const frame of keepsakeFrames){
  const preview=await readFile('web'+framePreview(frame.id)),print=await readFile('web'+frameBackground(frame.id));
  assert.equal(preview.toString('ascii',0,4),'RIFF');assert.equal(preview.toString('ascii',8,12),'WEBP');
  assert.ok(preview.length<50000);assert.ok(print.length>preview.length*10);
  assert.ok(print.readUInt32BE(16)>=1000);assert.ok(Math.abs(print.readUInt32BE(16)/print.readUInt32BE(20)-.8)<.001);
 }
});
