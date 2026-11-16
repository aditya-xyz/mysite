// Decode the viewing rendition before revealing it; stale navigation must not win.
export async function loadViewerPhoto(photo,{isCurrent,reveal,fail,createImage=()=>new Image()}){
 const image=createImage();image.decoding='async';image.src=photo.viewerSrc||photo.src;
 try{await image.decode();if(isCurrent())reveal(image.src,image.naturalWidth,image.naturalHeight);}
 catch{if(isCurrent())fail();}
}
