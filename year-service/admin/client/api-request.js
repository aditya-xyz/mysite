export class ApiError extends Error{
  constructor(message,status=0,retryable=false){super(message);this.status=status;this.retryable=retryable;}
}
// A brief retry for read-only page loads; never replay saves or uploads.
export async function readApiRequest(path,signal,fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 for(let attempt=0;;attempt++){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  try{return await sendApiRequest(path,undefined,signal,fetcher);}
  catch(error){
   if(attempt||signal?.aborted||!error.retryable||![0,408,502,503,504].includes(error.status)||error.retryAfterMs>5000)throw error;
   await wait(Math.max(300,error.retryAfterMs||0));
  }
 }
}
export async function sendApiRequest(path,data,signal,fetcher=fetch,asBlob=false){
  const multipart=data instanceof FormData,raw=data instanceof Blob;
  let response;
  try{
    response=await fetcher('/api/'+path,data===undefined?{signal,redirect:'manual'}:{signal,redirect:'manual',method:'POST',headers:multipart?{}:{'Content-Type':raw?'application/octet-stream':'application/json'},body:multipart||raw?data:JSON.stringify(data)});
  }catch(error){
    if(error.name==='AbortError')throw error;
    throw new ApiError('The connection was interrupted. Keep this tab open and retry.',0,true);
  }
  if(response.type==='opaqueredirect'||response.status===401||response.status===403||response.status>=300&&response.status<400)
    throw new ApiError('Your admin sign-in needs attention. Sign in to the admin in another tab, then retry here to keep your unsaved edits.',response.status);
  if(response.ok&&asBlob){
    if(!/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new ApiError('The original photo returned an unexpected response. Keep this tab open and retry.',response.status,true);
    return response.blob();
  }
  let result;try{result=await response.json();}catch(error){if(error.name==='AbortError')throw error;/* Edge error pages may be HTML or empty. */}
  if(!response.ok){
    const retryable=response.status===408||response.status===429||response.status>=500;
    const message=result?.error||(retryable?`The service is temporarily unavailable (HTTP ${response.status}). Keep this tab open and retry.`:`The request failed (HTTP ${response.status}). Keep this tab open and try again.`);
    const error=new ApiError(message,response.status,retryable);
    const after=response.headers.get('Retry-After');
    if(after){const seconds=Number(after);error.retryAfterMs=Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(after)-Date.now());}
    throw error;
  }
  if(result===undefined)throw new ApiError('The server returned an unexpected response. Keep this tab open and retry.',response.status,true);
  return result;
}
