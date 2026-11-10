import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forwardOriginalPart,uploadBodyLength} from '../admin/src/original-upload.ts';
test('original bodies reach R2 untouched without any application stream reader or copy',async()=>{
  const body=new ReadableStream<Uint8Array>();
  Object.defineProperty(body,'getReader',{value:()=>assert.fail('Per-chunk JavaScript processing reintroduces production CPU-limit failures')});
  const request={headers:new Headers({'Content-Length':'8388608'}),body} as Request;
  let calls=0;
  const upload={uploadPart:async(part:number,value:unknown)=>{calls++;assert.equal(part,7);assert.equal(value,body);return {partNumber:7,etag:'synthetic'};}} as R2MultipartUpload;
  assert.deepEqual(await forwardOriginalPart(request,8388608,upload,7),{partNumber:7,etag:'synthetic'});assert.equal(calls,1);
});
test('unknown, malformed, oversized and incomplete body lengths cannot start an R2 transfer',()=>{
  const upload={uploadPart:()=>assert.fail('Invalid lengths must be rejected before transfer')} as unknown as R2MultipartUpload;
  for(const [length,status] of [[null,411],['invalid',400],['21',413],['19',400],['0',400]] as const){
    const request={headers:new Headers(length===null?{}:{'Content-Length':length}),body:new ReadableStream()} as Request;
    assert.throws(()=>forwardOriginalPart(request,20,upload,1),(error:unknown)=>{assert.equal((error as {status:number}).status,status);return true;});
  }
  assert.equal(uploadBodyLength({headers:new Headers({'Content-Length':'1024'})} as Request,2048),1024);
});
