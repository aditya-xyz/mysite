// Return the displayed photo to its visible gallery thumbnail, without reading pixels.
export function dismissPhotoToThumbnail(dialog,image,thumbnail,onClose){
 if(!image.getAttribute('src')||!image.naturalWidth||!image.animate)return false;
 const box=image.getBoundingClientRect(),fit=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);
 const width=image.naturalWidth*fit,height=image.naturalHeight*fit;if(!width||!height)return false;
 const left=box.left+(box.width-width)/2,top=box.top+(box.height-height)/2,target=thumbnail?.getBoundingClientRect();
 const visible=target&&target.width&&target.height&&target.top<innerHeight&&target.bottom>0&&target.left<innerWidth&&target.right>0;
 const proxy=document.createElement('img');proxy.className='photo-dismiss-proxy';proxy.src=image.src;proxy.alt='';proxy.setAttribute('aria-hidden','true');
 Object.assign(proxy.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
 dialog.append(proxy);dialog.classList.add('is-returning');
 const dx=visible?target.left+target.width/2-left-width/2:0,dy=visible?target.top+target.height/2-top-height/2:80,scale=visible?Math.min(target.width/width,target.height/height):.8;
 const animation=proxy.animate([{transform:'translate3d(0,0,0) scale(1)',opacity:1,borderRadius:'3px'},{transform:`translate3d(${dx}px,${dy}px,0) scale(${scale})`,opacity:visible?1:0,borderRadius:'10px'}],{duration:300,easing:'cubic-bezier(.2,.75,.25,1)',fill:'forwards'});
 let timer,finished=false;const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);proxy.remove();onClose();};
 animation.finished.then(finish,finish);timer=setTimeout(finish,360);
 return true;
}
