// Decode the viewing rendition before revealing it; stale navigation must not win.
export async function loadViewerPhoto(photo,{isCurrent,reveal,fail,createImage=()=>new Image(),resolveSource}){
 const image=createImage();let timer;image.decoding='async';const source=photo.viewerSrc||photo.src;if(!resolveSource)image.src=source;
 try{if(resolveSource)image.src=await resolveSource(source);await Promise.race([image.decode(),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Timed out')),10000))]);if(isCurrent())reveal(image.src,image.naturalWidth,image.naturalHeight);}
 catch{if(isCurrent())fail();}finally{clearTimeout(timer);}
}
