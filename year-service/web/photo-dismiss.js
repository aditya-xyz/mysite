// Animate the already painted image in place; Safari need not decode a new layer.
export function dismissPhotoToThumbnail(dialog,image,thumbnail,onClose){
 if(!image.getAttribute('src')||!image.naturalWidth||!image.animate)return false;
 const box=image.getBoundingClientRect(),fit=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);
 const width=image.naturalWidth*fit,height=image.naturalHeight*fit;if(!width||!height)return false;
 const target=thumbnail?.getBoundingClientRect(),parentScale=box.width/(image.clientWidth||box.width);
 const visible=target&&target.width&&target.height&&target.top<innerHeight&&target.bottom>0&&target.left<innerWidth&&target.right>0;
 const dx=visible?target.left+target.width/2-box.left-box.width/2:0,dy=visible?target.top+target.height/2-box.top-box.height/2:80,scale=visible?Math.min(target.width/width,target.height/height):.8;
 dialog.classList.add('is-returning');image.style.willChange='transform,opacity';
 const animation=image.animate([{transform:'translate3d(0,0,0) scale(1)',opacity:1},{transform:`translate3d(${dx/parentScale}px,${dy/parentScale}px,0) scale(${scale})`,opacity:visible?1:0}],{duration:280,easing:'cubic-bezier(.2,.75,.25,1)',fill:'forwards'});
 let timer,finished=false;const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);onClose();animation.cancel();image.style.willChange='';};
 animation.finished.then(finish,finish);timer=setTimeout(finish,360);
 return true;
}
