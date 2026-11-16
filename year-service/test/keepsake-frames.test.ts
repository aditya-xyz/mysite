import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
// @ts-expect-error Shared browser frame configuration.
import{keepsakeFrames,defaultKeepsakeFrame,frameBackground}from'../web/keepsake-frames.js';
// @ts-expect-error Shared canvas geometry.
import{cardSlots,CARD_WIDTH,CARD_HEIGHT}from'../web/keepsake-layout.js';
test('approved winter frames have the requested order, default and real frame-only assets',async()=>{
 assert.equal(defaultKeepsakeFrame,'starry-night');assert.deepEqual(keepsakeFrames.map((f:any)=>f.label),['Starry Night','Evergreen','Winterlight']);
 for(const frame of keepsakeFrames){const bytes=await readFile('web'+frameBackground(frame.id));assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);}
 for(const slot of cardSlots){assert.ok(slot.x>=CARD_WIDTH*.08);assert.ok(slot.y>=CARD_HEIGHT*.08);assert.ok(slot.x+slot.width<=CARD_WIDTH*.92);assert.ok(slot.y+slot.height<=CARD_HEIGHT*.73);}
 assert.equal(frameBackground('santa'),null,'Historical recipe IDs do not acquire new frame artwork');
});
