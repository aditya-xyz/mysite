import * as ort from 'onnxruntime-web/wasm';
let session;
self.onmessage=async({data:{pixels}})=>{
 try{
  ort.env.wasm.wasmPaths='/runtime/';ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  session??=ort.InferenceSession.create('/models/u2netp.onnx',{executionProviders:['wasm']});
  const model=await session,values=new Float32Array(3*320*320),mean=[.485,.456,.406],std=[.229,.224,.225];
  let max=1;for(let i=0;i<pixels.length;i++)if(i%4!==3)max=Math.max(max,pixels[i]);
  for(let i=0;i<320*320;i++)for(let c=0;c<3;c++)values[c*320*320+i]=(pixels[i*4+c]/max-mean[c])/std[c];
  const results=await model.run({[model.inputNames[0]]:new ort.Tensor('float32',values,[1,3,320,320])});
  const output=results[model.outputNames[0]].data;let lo=Infinity,hi=-Infinity;
  for(const value of output){lo=Math.min(lo,value);hi=Math.max(hi,value);}
  if(hi-lo<1e-6)throw new Error('No subject found.');
  const mask=new Uint8ClampedArray(320*320*4);
  for(let i=0;i<320*320;i++){const a=Math.round((output[i]-lo)/(hi-lo)*255);mask[i*4]=mask[i*4+1]=mask[i*4+2]=255;mask[i*4+3]=a;}
  self.postMessage({mask},[mask.buffer]);
 }catch{session=null;self.postMessage({error:'Background removal could not finish. Retry, or upload a prepared transparent PNG.'});}
};
