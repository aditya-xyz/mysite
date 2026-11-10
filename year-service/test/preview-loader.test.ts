import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error This browser helper is intentionally plain JavaScript.
import {createPreviewLoader} from '../admin/client/preview-loader.js';
function deferred(){let resolve!:(v:string)=>void,reject!:(e:Error)=>void;const promise=new Promise<string>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('switching preview recipients ignores a late response from the previous audience',async()=>{
  const first=deferred(),second=deferred(),results:string[]=[],signals:AbortSignal[]=[];
  const loader=createPreviewLoader({load:(key:string,signal:AbortSignal)=>{signals.push(signal);return key==='first'?first.promise:second.promise;},onLoading:()=>{},onResult:(data:string)=>results.push(data),onError:()=>assert.fail('Unexpected error')});
  const a=loader.show('first'),b=loader.show('second');assert.equal(signals[0].aborted,true);
  second.resolve('second audience');await b;first.resolve('first audience');await a;
  assert.deepEqual(results,['second audience']);
});
test('closing a preview aborts its request and prevents later results from modifying a closed dialog',async()=>{
  const pending=deferred();let signal:AbortSignal|undefined,updates=0;
  const loader=createPreviewLoader({load:(_:unknown,s:AbortSignal)=>{signal=s;return pending.promise;},onLoading:()=>{},onResult:()=>updates++,onError:()=>updates++});
  const request=loader.show({year:2026});loader.cancel();assert.equal(signal?.aborted,true);
  pending.resolve('late result');await request;assert.equal(updates,0);
});
test('a failed preview can retry, while an obsolete failure cannot replace newer content',async()=>{
  const first=deferred(),errors:string[]=[],results:string[]=[];let attempts=0;
  const loader=createPreviewLoader({load:()=>++attempts===1?first.promise:Promise.resolve('ready'),onLoading:()=>{},onResult:(data:string)=>results.push(data),onError:(e:Error)=>errors.push(e.message)});
  const old=loader.show({year:2026});await loader.show({year:2027});first.reject(new Error('Old year failed'));await old;
  assert.deepEqual(results,['ready']);assert.equal(errors.length,0);
  let offline=true;const failure=createPreviewLoader({load:()=>offline?Promise.reject(new Error('Offline')):Promise.resolve('retry ready'),onLoading:()=>{},onResult:(data:string)=>results.push(data),onError:(e:Error)=>errors.push(e.message)});
  await failure.show({});assert.deepEqual(errors,['Offline']);offline=false;await failure.show({});assert.equal(results.at(-1),'retry ready');
});
