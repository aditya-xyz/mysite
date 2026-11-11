import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The browser module is intentionally plain JavaScript.
import {photoOrder,adjacentIndex,swipeStep,wheelNavigation,paginationDots,dismissDrag} from '../web/photo-navigation.js';
test('the viewer contains exactly the supplied authorized photos in visible gallery order',()=>{
  const personal={id:'personal',personal:true,canSave:true},shared={id:'common',personal:false,canSave:false},other={id:'other-personal',personal:true,canSave:false};
  const supplied=[shared,personal,other],ordered=photoOrder(supplied);
  assert.deepEqual(ordered,[personal,other,shared]);assert.deepEqual(supplied,[shared,personal,other]);
  assert.equal(ordered[2].canSave,false);assert.equal(ordered[1].canSave,false);
  assert.equal(adjacentIndex(0,-1,3),0);assert.equal(adjacentIndex(2,1,3),2);assert.equal(adjacentIndex(1,1,3),2);
});
test('horizontal swipes navigate while taps and vertical gestures do not',()=>{
  assert.equal(swipeStep(-100,12),1);assert.equal(swipeStep(100,12),-1);
  assert.equal(swipeStep(20,4),0);assert.equal(swipeStep(50,100),0);assert.equal(swipeStep(50,45),0);
});
test('one trackpad gesture advances once, including its momentum; vertical scroll and pinch stay native',()=>{
  const steps:number[]=[],wheel=wheelNavigation((step:number)=>steps.push(step));
  const event=(x:number,y:number,time:number,ctrlKey=false,deltaMode=0)=>({deltaX:x,deltaY:y,timeStamp:time,ctrlKey,deltaMode});
  assert.equal(wheel(event(0,80,0)),false);assert.equal(wheel(event(80,0,1,true)),false);
  wheel(event(30,0,10));wheel(event(35,0,30));wheel(event(80,0,70));wheel(event(10,0,150));
  assert.deepEqual(steps,[1]);wheel(event(-80,0,400));assert.deepEqual(steps,[1,-1]);
  wheel(event(4,0,800,false,1));assert.deepEqual(steps,[1,-1,1]);
});

test('pagination stays bounded and marks the current photo at either end and throughout large galleries',()=>{
  assert.deepEqual(paginationDots(0,0),[]);assert.deepEqual(paginationDots(0,1),[]);
  for(const length of [2,3,7,8,59])for(let index=0;index<length;index++){
    const dots=paginationDots(index,length);assert.equal(dots.length,Math.min(7,length));
    assert.deepEqual(dots.filter((dot:{active:boolean})=>dot.active).map((dot:{index:number})=>dot.index),[index]);
    assert.ok(dots.every((dot:{index:number})=>dot.index>=0&&dot.index<length));
    assert.ok(!dots.find((dot:{active:boolean;small:boolean})=>dot.active&&dot.small));
  }
  assert.equal(paginationDots(0,59)[0].index,0);assert.equal(paginationDots(58,59).at(-1).index,58);
});

test('drag dismissal requires a deliberate predominantly downward movement',()=>{
  assert.equal(dismissDrag(0,96),true);assert.equal(dismissDrag(30,140),true);
  for(const [dx,dy] of [[0,0],[0,95],[0,-140],[150,120],[-150,120],[100,100]])assert.equal(dismissDrag(dx,dy),false);
});
