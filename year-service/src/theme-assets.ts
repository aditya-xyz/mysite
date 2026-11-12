// Decorative photos are private edition assets, separate from gallery audiences
// and mug artwork. Only these three fixed names may resolve to storage keys.
const names=['welcome','gift','closing'] as const;
const key=(year:number,name:string)=>`${year}/theme/${name}.jpg`;
export async function themeAssetManifest(media:R2Bucket,year:number,prefix='/api/theme'){
 const available=await Promise.all(names.map(async name=>(await media.head(key(year,name)))?[name,`${prefix}/${name}`]:null));
 return Object.fromEntries(available.filter((entry):entry is string[]=>entry!==null));
}
export async function themeAssetResponse(media:R2Bucket,year:number,name:string){
 if(!names.some(allowed=>allowed===name))return null;
 const file=await media.get(key(year,name));
 return file?new Response(file.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store, private'}}):null;
}
