import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser helper.
import {openDialog,closeDialog} from '../web/dialog-motion.js';

test('dialog motion retains the native modal until exit completes, handles Escape, and respects reduced motion',async()=>{
 const saved={matchMedia:(globalThis as any).matchMedia,getComputedStyle:(globalThis as any).getComputedStyle};
 let reduced=false;const handlers=new Map<string,Function>(),animations:any[]=[],attributes=new Map<string,string>();let shows=0,closes=0;
 const dialog={open:false,setAttribute:(k:string,v:string)=>attributes.set(k,v),removeAttribute:(k:string)=>attributes.delete(k),addEventListener:(name:string,fn:Function)=>handlers.set(name,fn),showModal(){this.open=true;shows++;},close(){this.open=false;closes++;handlers.get('close')?.();},animate(frames:any,options:any){let finish=()=>{},cancel=()=>{};const a={frames,options,finished:new Promise<void>((r,j)=>{finish=r;cancel=()=>j(Error('Canceled'));}),cancel,finish(){finish();}};animations.push(a);return a;}};
 (globalThis as any).matchMedia=()=>({matches:reduced});(globalThis as any).getComputedStyle=()=>({opacity:'.7',transform:'matrix(1,0,0,1,0,4)'});
 try{
  openDialog(dialog);assert.equal(shows,1);assert.equal(attributes.get('data-dialog-motion'),'enter');openDialog(dialog);assert.equal(shows,1);
  const closing=closeDialog(dialog);assert.equal(closeDialog(dialog),closing);assert.equal(dialog.open,true);assert.equal(animations[1].frames[0].opacity,'.7');assert.equal(attributes.get('data-dialog-motion'),'leave');animations[1].finish();await closing;assert.equal(dialog.open,false);assert.equal(closes,1);
  openDialog(dialog);const countBeforeCancel=animations.length;handlers.get('cancel')!({defaultPrevented:true});assert.equal(animations.length,countBeforeCancel);assert.equal(dialog.open,true);let prevented=false;handlers.get('cancel')!({defaultPrevented:false,preventDefault(){prevented=true;}});assert.equal(prevented,true);animations.at(-1).finish();await new Promise(r=>setImmediate(r));assert.equal(closes,2);
  openDialog(dialog);const stale=closeDialog(dialog);dialog.close();openDialog(dialog);await stale;assert.equal(dialog.open,true,'An old exit cannot close a reopened modal');
  reduced=true;const count=animations.length;openDialog(dialog);await closeDialog(dialog);assert.equal(animations.length,count);assert.equal(closes,4);
 }finally{Object.assign(globalThis,saved);}
});
