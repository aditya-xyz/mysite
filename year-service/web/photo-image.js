// A painted thumbnail can still report dimensions after its object URL was revoked.
export function photoThumbnail(image,isUsableURL){
 if(!image?.complete||!image.naturalWidth||!image.src||!isUsableURL(image.src))return null;
 return {src:image.src,width:image.naturalWidth,height:image.naturalHeight,preview:true};
}

// Decode the viewing rendition before revealing it; stale navigation must not win.
export async function loadViewerPhoto(photo,{isCurrent,reveal,fail,createImage=()=>new Image(),resolveSource,isUsableURL=()=>true}){
 const image=createImage();let timer;image.decoding='async';const source=photo.viewerSrc||photo.src;if(!resolveSource)image.src=source;
 const decode=async()=>{try{await Promise.race([image.decode(),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Timed out')),10000))]);}finally{clearTimeout(timer);}};
 try{
  if(resolveSource){const cached=await resolveSource(source);image.src=isUsableURL(cached)?cached:source;}
  try{await decode();}catch(error){if(isUsableURL(image.src))throw error;}
  if(!isCurrent())return;
  if(!isUsableURL(image.src)){image.src=source;await decode();}
  if(isCurrent())reveal(image.src,image.naturalWidth,image.naturalHeight);
 }
 catch{if(isCurrent())fail();}
}
