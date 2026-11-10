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
export async function uploadPhoto(file,{preview,viewer},send,onProgress=()=>{}){
  const mime=file.type||(/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':'image/jpeg');
  const session=await send('uploads',{filename:file.name.slice(0,200),mime,bytes:file.size});
  try{
    for(let offset=0,part=1;offset<file.size;offset+=session.chunkBytes,part++){
      const end=Math.min(offset+session.chunkBytes,file.size);
      await send(`uploads/${session.id}/parts/${part}`,file.slice(offset,end));
      onProgress(Math.round(end/file.size*100));
    }
    const form=new FormData();form.set('preview',preview,'grid.jpg');form.set('viewer',viewer,'viewer.jpg');
    return await send(`uploads/${session.id}/complete`,form);
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
