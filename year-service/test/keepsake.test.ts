import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser geometry is intentionally plain JavaScript.
import {CARD_WIDTH,CARD_HEIGHT,cardSlots,coverCrop,anchoredCrop,personalPhotos} from '../web/keepsake-layout.js';
test('keepsakes offer only distinct personal photos supplied by the journal',()=>{
  const a={id:'a',personal:true},b={id:'b',personal:true,canSave:false};
  assert.deepEqual(personalPhotos([{id:'shared',personal:false},a,b,{...a},{id:'unknown'}]),[a,b]);
});
test('the complete export is 4:5 with three separated image slots and space for Pixel',()=>{
  assert.equal(CARD_WIDTH/CARD_HEIGHT,4/5);assert.equal(cardSlots.length,3);
  for(const s of cardSlots){assert.ok(s.x>=0&&s.y>=0);assert.ok(s.x+s.width<CARD_WIDTH);assert.ok(s.y+s.height<1200);}
  assert.ok(cardSlots[0].y+cardSlots[0].height<cardSlots[1].y);
  assert.ok(cardSlots[1].x+cardSlots[1].width<cardSlots[2].x);
});
test('crop gestures and zoom never sample outside portrait or landscape source pixels',()=>{
  for(const [w,h] of [[4000,3000],[3000,4000],[1080,1920],[800,800]])for(const slot of cardSlots)for(const zoom of [1,1.5,2.5,99])for(const [x,y] of [[0,0],[1,1],[-5,8],[.5,.5]]){
    const r=coverCrop(w,h,slot.width,slot.height,{x,y,zoom});
    assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w+.000001&&r.y+r.height<=h+.000001);
    assert.ok(Math.abs(r.width/r.height-slot.width/slot.height)<.000001);
  }
  const center=coverCrop(4000,3000,1104,650),zoomed=coverCrop(4000,3000,1104,650,{zoom:2});
  assert.equal(zoomed.width,center.width/2);assert.equal(center.y,(3000-center.height)/2);
});
test('pinch and pan preserve the focal source pixel and clamp at image edges',()=>{
  const initial=coverCrop(4000,3000,1104,650),sourceX=initial.x+initial.width*.5,sourceY=initial.y+initial.height*.5;
  const crop=anchoredCrop(4000,3000,1104,650,2,sourceX,sourceY,.4,.6),result=coverCrop(4000,3000,1104,650,crop);
  assert.ok(Math.abs(result.x+result.width*.4-sourceX)<.000001);
  assert.ok(Math.abs(result.y+result.height*.6-sourceY)<.000001);
  for(const zoom of [.1,1,2.5,100]){
    const edge=anchoredCrop(1080,1920,544,480,zoom,10000,-10000,2,-1);
    assert.ok(edge.zoom>=1&&edge.zoom<=2.5&&edge.x>=0&&edge.x<=1&&edge.y>=0&&edge.y<=1);
  }
});
