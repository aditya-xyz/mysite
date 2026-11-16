import type {PublishedMugDesign} from './edition.ts';

// Display renditions are separate objects; the original PNG remains the print source.
export const mugDisplayKey=(year:number,id:string,version:string)=>`${year}/${id}/mugs/${version}-display.webp`;
export async function mugImageResponse(bucket:R2Bucket,year:number,design:PublishedMugDesign,display=false){
 if(display&&/^[a-f0-9]{32}$/.test(design.cutoutVersion||'')){
  const image=await bucket.get(mugDisplayKey(year,design.id,design.cutoutVersion!));
  if(image)return new Response(image.body,{headers:{'Content-Type':'image/webp'}});
 }
 const image=await bucket.get(design.preview_key);
 return image?new Response(image.body,{headers:{'Content-Type':design.mime==='image/png'?'image/png':'image/jpeg'}}):null;
}
