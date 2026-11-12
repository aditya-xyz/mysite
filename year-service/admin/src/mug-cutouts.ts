import {curatedMugIds} from '../../src/mug-catalog.ts';
import {UploadProblem} from './media-errors.ts';
import {token} from '../../src/security.ts';
interface Env {DB:D1Database;MEDIA:R2Bucket}
export const cutoutVersion=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export const cutoutKey=(year:number,id:string,version:string)=>`${year}/${id}/mugs/${version}.png`;
export async function mugCutoutRoute(request:Request,env:Env,actor:string,year:number,path:string){
 const match=/^\/api\/media\/([a-z0-9-]+)\/cutout(?:\/([a-f0-9]{32}))?$/.exec(path);if(!match)return null;
 const id=match[1],version=match[2];
 const media=await env.DB.prepare('SELECT id FROM media_objects WHERE id=?1 AND year=?2 AND deleting=0').bind(id,year).first();
 if(!media)throw new UploadProblem(404,'Photo not found.');
 if(request.method==='POST'&&curatedMugIds.includes(id))throw new UploadProblem(405,'Curated mug artwork is fixed. Only captions can be edited.');
 const currentKey=`${year}/${id}/mugs/current.json`;
 if(request.method==='GET'){
  if(!version){const current=await env.MEDIA.get(currentKey);return Response.json(current?await current.json():{version:null});}
  const file=await env.MEDIA.get(cutoutKey(year,id,version));if(!file)throw new UploadProblem(404,'Cutout not found.');
  return new Response(file.body,{headers:{'Content-Type':'image/png'}});
 }
 if(request.method!=='POST'||version)throw new UploadProblem(405,'Method not allowed.');
 // The owner's browser does the extraction. This endpoint never sends photos to an AI provider.
 if(Number(request.headers.get('Content-Length'))>12*1024*1024)throw new UploadProblem(413,'Use a PNG up to 12 MB.');
 const reader=request.body?.getReader();if(!reader)throw new UploadProblem(400,'Include a transparent PNG.');
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024){await reader.cancel();throw new UploadProblem(413,'Use a PNG up to 12 MB.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const view=new DataView(bytes.buffer);
 if(size<33||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)||new TextDecoder().decode(bytes.slice(12,16))!=='IHDR'||bytes[25]!==6||bytes[24]!==8||!view.getUint32(16)||!view.getUint32(20)||Math.max(view.getUint32(16),view.getUint32(20))>4096)throw new UploadProblem(400,'Use an RGBA transparent PNG up to 4096 pixels per side.');
 const next=token().slice(0,32),key=cutoutKey(year,id,next);
 await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/png'}});
 // Deletion claims the media before removing every object under its prefix.
 const available=await env.DB.prepare('SELECT id FROM media_objects WHERE id=?1 AND year=?2 AND deleting=0').bind(id,year).first();
 if(!available){await env.MEDIA.delete(key);throw new UploadProblem(409,'This photo is no longer available.');}
 await env.MEDIA.put(currentKey,JSON.stringify({version:next,editable:new URL(request.url).searchParams.get('editable')==='1'}),{httpMetadata:{contentType:'application/json'}});
 await env.DB.prepare("INSERT INTO admin_events(actor,action,target) VALUES(?1,'save-mug-cutout',?2)").bind(actor,id).run();
 return Response.json({version:next},{status:201});
}
