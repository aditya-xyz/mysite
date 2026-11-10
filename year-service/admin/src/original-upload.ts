import {UploadProblem} from './media-errors.ts';
export function uploadBodyLength(request:Request,max:number,expected?:number){
  const header=request.headers.get('Content-Length');
  if(header===null)throw new UploadProblem(411,'The browser couldn’t prepare this upload. Choose the photo again.');
  if(!/^\d+$/.test(header))throw new UploadProblem(400,'The upload size is invalid. Please try again.');
  const length=Number(header);
  if(!Number.isSafeInteger(length)||length>max)throw new UploadProblem(413,'This upload request is too large.');
  if(!length||(expected!==undefined&&length!==expected))throw new UploadProblem(400,'The photo part was incomplete. Please try again.');
  return length;
}
export function forwardOriginalPart(request:Request,expected:number,upload:R2MultipartUpload,physicalPart:number){
  uploadBodyLength(request,expected,expected);
  if(!request.body)throw new UploadProblem(400,'Missing upload data.');
  // The HTTP body already has a runtime-known length. Forward it untouched:
  // no JS readers, copies, TransformStreams or per-chunk promises in the Worker.
  return upload.uploadPart(physicalPart,request.body);
}
