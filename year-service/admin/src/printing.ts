import {localPrintProvider,PrintProblem,type PrintEnv} from '../../src/printing.ts';
export async function printAdminRoute(request:Request,env:PrintEnv,path:string,year:number,readBody:()=>Promise<Record<string,unknown>>){
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
