// GET-only recovery. Mutations are never replayed. The timeout includes the response body.
export async function readResource(url,{signal,timeoutMs=8000,retries=1,read=response=>response.json(),fetcher=fetch}={}){
 for(let attempt=0;;attempt++){
  if(signal?.aborted)throw new DOMException('Closed','AbortError');
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('The request timed out.','TimeoutError')),timeoutMs);
  try{
   const response=await fetcher(url,{signal:controller.signal});
   if(!response.ok){let data;try{data=await response.json();}catch{}const error=new Error(data?.error||'This image could not load. Please try again.');error.status=response.status;error.code=data?.code;throw error;}
   return await read(response);
  }catch(error){
   if(signal?.aborted)throw new DOMException('Closed','AbortError');
   const transient=controller.signal.aborted||error instanceof TypeError||[408,502,503,504].includes(error.status);
   if(attempt>=retries||!transient)throw controller.signal.aborted?controller.signal.reason:error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
}
export const readBlob=(url,options={})=>readResource(url,{...options,read:response=>response.blob()});
