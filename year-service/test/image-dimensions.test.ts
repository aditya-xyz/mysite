import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageDimensions} from '../src/image-dimensions.ts';
const frame=(marker:number,width:number,height:number)=>new Uint8Array([255,216,255,marker,0,11,8,height>>8,height&255,width>>8,width&255,1,1,17,0,255,217]);
test('preview dimensions preserve portrait, Story, and camera proportions',()=>{
  for(const [width,height] of [[1080,1350],[1080,1920],[1200,1600],[1600,1200]])for(const marker of [0xc0,0xc2])assert.deepEqual(imageDimensions(frame(marker,width,height)),{width,height});
});
test('preview dimension scanning skips metadata and rejects incomplete headers',()=>{
  const data=frame(0xc0,1080,1920),withMetadata=new Uint8Array([255,216,255,225,0,6,69,88,73,70,...data.slice(2)]);
  assert.deepEqual(imageDimensions(withMetadata),{width:1080,height:1920});
  for(let end=0;end<15;end++)assert.equal(imageDimensions(data.slice(0,end)),null);
  assert.equal(imageDimensions(new Uint8Array([255,216,255,192,0,0])),null);
  assert.equal(imageDimensions(frame(0xc0,0,1920)),null);
});
