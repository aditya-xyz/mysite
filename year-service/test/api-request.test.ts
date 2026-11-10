import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser transport is plain JavaScript.
import {sendApiRequest,ApiError} from '../admin/client/api-request.js';
// @ts-expect-error Browser upload helper is plain JavaScript.
import {retryUploadRequest,uploadPhoto} from '../admin/client/photo-upload.js';
test('HTML 503 responses are retryable server errors, not expired sign-ins',async()=>{
  await assert.rejects(()=>sendApiRequest('uploads',{},undefined,async()=>new Response('<html>Service unavailable</html>',{status:503})),(error:InstanceType<typeof ApiError>)=>{
    assert.equal(error.status,503);assert.equal(error.retryable,true);assert.match(error.message,/503/);assert.doesNotMatch(error.message,/sign-in|Refresh/);return true;
  });
});
test('authentication failures preserve the current draft and are not retried',async()=>{
  for(const status of [401,403,302])await assert.rejects(()=>sendApiRequest('uploads',{},undefined,async()=>new Response('',{status})),(error:InstanceType<typeof ApiError>)=>{
    assert.equal(error.retryable,false);assert.match(error.message,/another tab/);assert.doesNotMatch(error.message,/Refresh/);return true;
  });
  await assert.rejects(()=>sendApiRequest('uploads',{},undefined,async()=>({type:'opaqueredirect',status:0})),/sign-in/);
});
test('retry logic backs off only retryable failures and respects Retry-After',async()=>{
  const delays:number[]=[],body=new Blob(['unchanged bytes']);let attempts=0;
  const result=await retryUploadRequest(async(path:string,data:Blob)=>{
    assert.equal(path,'uploads/photo/parts/2');assert.equal(data,body);attempts++;
    if(attempts<3)throw new ApiError('Service unavailable',503,true);return {uploaded:12};
  },'uploads/photo/parts/2',body,async(ms:number)=>{delays.push(ms);});
  assert.deepEqual(delays,[1000,2000]);assert.equal(result.uploaded,12);
  let calls=0;
  await assert.rejects(()=>retryUploadRequest(async()=>{calls++;throw new ApiError('Invalid photo',400,false);},'uploads',{},async()=>{}),/Invalid photo/);
  assert.equal(calls,1);
  await assert.rejects(()=>sendApiRequest('uploads',{},undefined,async()=>new Response('',{status:429,headers:{'Retry-After':'5'}})),(error:InstanceType<typeof ApiError>)=>{assert.equal(error.retryAfterMs,5000);return true;});
});
test('network failures are retryable, cancellation stays cancelled, and attempts are bounded',async()=>{
  await assert.rejects(()=>sendApiRequest('uploads',{},undefined,async()=>{throw new TypeError('Failed to fetch');}),(error:InstanceType<typeof ApiError>)=>{assert.equal(error.retryable,true);return true;});
  const cancelled=new Error('cancelled');cancelled.name='AbortError';
  await assert.rejects(()=>sendApiRequest('uploads',{},undefined,async()=>{throw cancelled;}),error=>error===cancelled);
  let calls=0;
  await assert.rejects(()=>retryUploadRequest(async()=>{calls++;throw new ApiError('still unavailable',503,true);},'uploads',{},async()=>{}),/still unavailable/);
  assert.equal(calls,4);
});
test('an 84-photo batch continues after a transient failure on the ninth photo',async()=>{
  let started=0,failed=false;const completed=new Set(),delays:number[]=[];
  const send=async(path:string)=>{
    if(path==='uploads')return {id:'synthetic-'+(++started),chunkBytes:8};
    if(path==='uploads/synthetic-9/parts/1'&&!failed){failed=true;throw new ApiError('Service unavailable',503,true);}
    if(path.endsWith('/complete')){const id=path.split('/')[1];completed.add(id);return {id};}
    return {};
  };
  for(let i=0;i<84;i++)await uploadPhoto(new File(['synthetic'],'synthetic.jpg',{type:'image/jpeg'}),{preview:new Blob(['grid']),viewer:new Blob(['viewer'])},send,()=>{},async(ms:number)=>{delays.push(ms);});
  assert.equal(started,84);assert.equal(completed.size,84);assert.equal(failed,true);assert.deepEqual(delays,[1000]);
});
