import {localPrintProvider,mailingAddress,PrintProblem,type PrintEnv} from '../../src/printing.ts';
import {now,token} from '../../src/security.ts';
export async function printAdminRoute(request:Request,env:PrintEnv,path:string,year:number,readBody:()=>Promise<Record<string,unknown>>){
 const address=/^\/api\/contacts\/([a-z0-9-]{1,100})\/address$/.exec(path);
 if(address&&request.method==='POST'){
  const data=await readBody();if(!Number.isInteger(data.version)||typeof data.verify!=='boolean')throw new PrintProblem(400,'Check the person version and verification choice.');
  const a=mailingAddress(data.address);
  if(data.verify&&!localPrintProvider(request,env))throw new PrintProblem(503,'Address validation is not configured. Save unverified until a provider is connected.');
  // Local normalization is explicitly a simulation, never a claim of live USPS validation.
  if(data.verify)for(const k of ['line1','line2','city'] as const)a[k]=a[k].toUpperCase();
  const encoded=JSON.stringify(a);
  const current=await env.DB.prepare('SELECT * FROM people WHERE id=?1 AND version=?2').bind(address[1],data.version as number).first();
  if(!current)throw new PrintProblem(409,'This person changed in another window. Refresh before saving the address.');
  if(data.verify&&current.mailing_address===encoded&&current.address_verified===1&&current.address_verifier==='local_mock')return Response.json({person:current,simulated:true});
  let person=await env.DB.prepare('UPDATE people SET mailing_address=?1,address_verified=0,address_verified_at=NULL,address_verifier=NULL,address_verification_key=NULL,version=version+1,updated_at=unixepoch() WHERE id=?2 AND version=?3 RETURNING *').bind(encoded,address[1],data.version as number).first();
  if(!person)throw new PrintProblem(409,'This person changed in another window. Refresh before saving the address.');
  if(data.verify){person=await env.DB.prepare("UPDATE people SET address_verified=1,address_verified_at=?1,address_verifier='local_mock',address_verification_key=?5,version=version+1 WHERE id=?2 AND version=?3 AND mailing_address=?4 RETURNING *").bind(now(),address[1],(data.version as number)+1,encoded,token()).first();if(!person)throw new PrintProblem(409,'The address changed before verification completed. Verify it again.');}
  return Response.json({person,simulated:!!data.verify});
 }
 if(path==='/api/print-settings'&&request.method==='POST'){
  const data=await readBody();if(typeof data.allowPrintOrders!=='boolean')throw new PrintProblem(400,'Choose whether print orders are allowed.');
  if(data.allowPrintOrders&&!localPrintProvider(request,env))throw new PrintProblem(503,'Live printing is not configured. Orders remain disabled.');
  const result=await env.DB.prepare('UPDATE editions SET allow_print_orders=?1 WHERE year=?2 RETURNING year').bind(Number(data.allowPrintOrders),year).first();
  if(!result)throw new PrintProblem(404,'Scrapbook not found.');
  return Response.json({allowPrintOrders:data.allowPrintOrders,mode:localPrintProvider(request,env)?'local_mock':'disabled'});
 }
 const reset=/^\/api\/invitations\/([a-z0-9-]{1,100})\/reset-print-allowance$/.exec(path);
 if(reset&&request.method==='POST'){
  const data=await readBody();if(typeof data.orderId!=='string'||!/^print-[a-z0-9]+$/.test(data.orderId))throw new PrintProblem(400,'Choose the current print order to reset.');
  const row=await env.DB.prepare("UPDATE print_orders SET allowance_reset_at=unixepoch(),updated_at=unixepoch() WHERE id=?1 AND invitation_id=?2 AND year=?3 AND allowance_reset_at IS NULL AND status IN ('simulated','submitted') RETURNING id").bind(data.orderId,reset[1],year).first();
  if(!row)throw new PrintProblem(409,'The allowance changed, or the order is still being processed. Refresh before resetting.');
  return Response.json({reset:true});
 }
 if(path==='/api/print-orders'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT o.id,o.invitation_id,o.status,o.recipient_name,o.note,o.address_json,o.created_at,o.allowance_reset_at FROM print_orders o WHERE o.year=?1 ORDER BY o.created_at DESC LIMIT 200').bind(year).all();
  const counts=await env.DB.prepare("SELECT invitation_id,count(*) AS count,sum(allowance_reset_at IS NULL) AS used,max(CASE WHEN allowance_reset_at IS NULL THEN id END) AS active_order_id,max(CASE WHEN allowance_reset_at IS NULL THEN status END) AS status FROM print_orders WHERE year=?1 AND status IN ('preparing','simulated','submitted','unknown') GROUP BY invitation_id").bind(year).all();
  return Response.json({orders:rows.results,counts:counts.results});
 }
 const proof=/^\/api\/print-orders\/([a-z0-9-]+)\/artwork$/.exec(path);
 if(proof&&request.method==='GET'){
  const row=await env.DB.prepare('SELECT artwork_key FROM print_orders WHERE id=?1 AND year=?2').bind(proof[1],year).first<{artwork_key:string}>();
  if(!row)throw new PrintProblem(404,'Print order not found.');const file=await env.MEDIA.get(row.artwork_key);if(!file)throw new PrintProblem(404,'Artwork not found.');return new Response(file.body,{headers:{'Content-Type':'image/jpeg'}});
 }
 return null;
}
