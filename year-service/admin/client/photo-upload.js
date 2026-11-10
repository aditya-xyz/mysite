const photoTypes=new Set(['image/jpeg','image/png','image/webp']);
export function photoUploadError(files,currentCount=0){
  if(!files.length)return 'Choose photo files. Folders cannot be uploaded.';
  if(currentCount+files.length>300)return 'A scrapbook can contain up to 300 photos. Add fewer files.';
  for(const file of files){
    if(!photoTypes.has(file.type)&&!(file.type===''&&/\.(jpe?g|png|webp)$/i.test(file.name)))return `${file.name}: use JPEG, PNG, or WebP. HEIC and other file types are not supported yet.`;
    if(!file.size)return `${file.name} is empty. Choose another photo.`;
    if(file.size>=100_000_000)return `${file.name} must be smaller than 100 MB.`;
  }
  return '';
}
// The original is sliced unchanged; only the separate browser-made previews are encoded.
export async function retryUploadRequest(send,path,data,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onRetry=()=>{}){
  for(let attempt=0;;attempt++){
    try{return await send(path,data);}catch(error){
      if(!error.retryable||attempt===3)throw error;
      const delay=error.retryAfterMs??1000*2**attempt;
      // Do not silently retry earlier than Retry-After or leave the UI waiting indefinitely.
      if(!Number.isFinite(delay)||delay>30000)throw error;
      onRetry(attempt+1);await wait(delay);
    }
  }
}
export async function fingerprintPhoto(file){
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
}
export async function findUploadedPhoto(file,send,readOriginal,wait,onRetry){
  const hash=await fingerprintPhoto(file),data={hash,bytes:file.size};
  const request=(path,body)=>retryUploadRequest(send,path,body,wait,onRetry);
  const result=await request('media/lookup',data);
  if(result.media)return {hash,media:result.media};
  for(const candidate of result.candidates){
    const original=await retryUploadRequest(()=>readOriginal(`media/${candidate.id}/original`),'',undefined,wait,onRetry);
    if(original.size!==file.size)continue;
    const candidateHash=await fingerprintPhoto(original);
    const saved=await request(`media/${candidate.id}/fingerprint`,{hash:candidateHash,bytes:original.size});
    if(candidateHash===hash)return {hash,media:saved.media};
  }
  return {hash,media:null};
}
export function addPhotoToDraft(draft,media){
  if(draft.photos.some(photo=>photo.id===media.id))return false;
  if(draft.photos.length>=300)throw new Error('A scrapbook can contain up to 300 photos.');
  const photo=media.draftPhoto||{caption:'',alt:'',recipients:[]};
  draft.photos.push({id:media.id,caption:photo.caption,alt:photo.alt,recipients:[...photo.recipients]});
  return true;
}
export async function uploadPhoto(file,{preview,viewer},send,onProgress=()=>{},wait,onRetry,hash){
  const mime=file.type||(/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':'image/jpeg');
  const request=(path,data)=>retryUploadRequest(send,path,data,wait,onRetry);
  const id='photo-'+crypto.randomUUID().replaceAll('-','').slice(0,24);
  const session=await request('uploads',{id,filename:file.name.slice(0,200),mime,bytes:file.size,...(hash?{hash}:{})});
  if(session.media)return {...session.media,reused:true};
  try{
    for(let offset=0,part=1;offset<file.size;offset+=session.chunkBytes,part++){
      const end=Math.min(offset+session.chunkBytes,file.size);
      await request(`uploads/${session.id}/parts/${part}`,file.slice(offset,end));
      onProgress(Math.round(end/file.size*100));
    }
    const form=new FormData();form.set('preview',preview,'grid.jpg');form.set('viewer',viewer,'viewer.jpg');
    return await request(`uploads/${session.id}/complete`,form);
  }catch(error){
    try{await send(`uploads/${session.id}/abort`,{});}catch{/* Expired sign-in/connection: server expires unfinished uploads. */}
    throw error;
  }
}
export const isFileDrag=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
export function bindPhotoDropzone(zone,{isBusy,onFiles,onError}){
  let depth=0;
  const reset=()=>{depth=0;zone.classList.remove('is-dragging');};
  zone.addEventListener('dragenter',event=>{
    if(!isFileDrag(event))return;event.preventDefault();depth++;
    if(!isBusy())zone.classList.add('is-dragging');
  });
  zone.addEventListener('dragover',event=>{
    if(!isFileDrag(event))return;event.preventDefault();event.dataTransfer.dropEffect=isBusy()?'none':'copy';
  });
  zone.addEventListener('dragleave',()=>{depth=Math.max(0,depth-1);if(!depth)reset();});
  zone.addEventListener('drop',event=>{
    if(!isFileDrag(event))return;event.preventDefault();event.stopPropagation();reset();
    if(isBusy()){onError('Wait for the current change to finish before adding more photos.');return;}
    if(Array.from(event.dataTransfer.items||[]).some(item=>item.webkitGetAsEntry?.()?.isDirectory)){
      onError('Drop individual photos rather than folders. You can select multiple files.');return;
    }
    onFiles(Array.from(event.dataTransfer.files||[]));
  });
}
