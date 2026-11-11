export const CARD_WIDTH=1200,CARD_HEIGHT=1500;
export const cardSlots=[{x:48,y:48,width:1104,height:650},{x:48,y:714,width:544,height:480},{x:608,y:714,width:544,height:480}];
export function personalPhotos(photos){
  const seen=new Set();
  return photos.filter(p=>p.personal===true&&!seen.has(p.id)&&seen.add(p.id));
}
export function coverCrop(width,height,targetWidth,targetHeight,crop={}){
  const zoom=Math.max(1,Math.min(2.5,Number(crop.zoom)||1));
  const ratio=targetWidth/targetHeight;
  let w=width,h=w/ratio;
  if(h>height){h=height;w=h*ratio;}
  w/=zoom;h/=zoom;
  const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:.5));
  return {x:(width-w)*clamp(crop.x),y:(height-h)*clamp(crop.y),width:w,height:h};
}
// Keep a source pixel beneath the same finger/cursor as the crop pans or zooms.
export function anchoredCrop(width,height,targetWidth,targetHeight,zoom,sourceX,sourceY,pointX,pointY){
  zoom=Math.max(1,Math.min(2.5,zoom));
  const g=coverCrop(width,height,targetWidth,targetHeight,{zoom});
  const clamp=v=>Math.max(0,Math.min(1,v));
  return {zoom,x:width>g.width?clamp((sourceX-pointX*g.width)/(width-g.width)):.5,y:height>g.height?clamp((sourceY-pointY*g.height)/(height-g.height)):.5};
}
