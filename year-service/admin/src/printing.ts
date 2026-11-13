import {quoteSavedPrintOrder} from '../../src/handwrytten-quote.ts';
import {prepareSavedOrderProof} from '../../src/handwrytten-previews.ts';
import {handwryttenStatus} from '../../src/handwrytten.ts';
import {resetSimulatedOrder} from './simulated-order-reset.ts';
import {simulatedOrders,PrintProblem,type PrintEnv} from '../../src/printing.ts';
export async function printAdminRoute(request:Request,env:PrintEnv,path:string,year:number,readBody:()=>Promise<Record<string,unknown>>){
 if(path==='/api/handwrytten/status'&&request.method==='GET')return Response.json(await handwryttenStatus(env));
 if(path==='/api/print-settings'&&request.method==='POST'){
  const data=await readBody();if(typeof data.allowPrintOrders!=='boolean')throw new PrintProblem(400,'Choose whether print orders are allowed.');
  if(data.allowPrintOrders&&!simulatedOrders(request,env))throw new PrintProblem(503,'Live printing is not configured. Orders remain disabled.');
  const result=await env.DB.prepare('UPDATE editions SET allow_print_orders=?1 WHERE year=?2 RETURNING year').bind(Number(data.allowPrintOrders),year).first();
  if(!result)throw new PrintProblem(404,'Scrapbook not found.');
  return Response.json({allowPrintOrders:data.allowPrintOrders,mode:simulatedOrders(request,env)?'local_mock':'disabled'});
 }
 const reset=/^\/api\/invitations\/([a-z0-9-]{1,100})\/reset-print-allowance$/.exec(path);
 if(reset&&request.method==='POST'){
  return Response.json(await resetSimulatedOrder(env,'print',year,reset[1],await readBody()));
 }
 if(path==='/api/print-orders'&&request.method==='GET'){
  const rows=await env.DB.prepare("SELECT o.id,o.invitation_id,o.status,o.recipient_name,o.note,o.default_note,o.address_json,o.created_at,o.allowance_reset_at,o.card_count,o.format,o.back_text,o.authors,o.handwrytten_preview_id,o.handwrytten_order_json,o.handwrytten_quote_json,o.recipe_json,o.provider_id,f.state AS fulfillment_state,f.error AS fulfillment_error FROM print_orders o LEFT JOIN print_fulfillment f ON f.order_id=o.id WHERE o.year=?1 AND o.status IN ('preparing','simulated','submitted','unknown') ORDER BY o.created_at DESC LIMIT 200").bind(year).all();
  const counts=await env.DB.prepare(`SELECT i.id AS invitation_id,
 (SELECT count(*) FROM print_orders h WHERE h.invitation_id=i.id AND h.year=i.edition_year AND h.status IN ('preparing','simulated','submitted','unknown')) AS count,
 i.print_order_count AS used,o.id AS active_order_id,o.status,
 CASE WHEN o.status IN ('simulated','submitted') AND (f.order_id IS NULL OR f.state='submitted' OR (f.state='review' AND f.basket_item_id IS NULL)) THEN 1 ELSE 0 END AS can_reset
 FROM invites i LEFT JOIN print_orders o ON o.invitation_id=i.id AND o.year=i.edition_year AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown')
 LEFT JOIN print_fulfillment f ON f.order_id=o.id WHERE i.edition_year=?1`).bind(year).all();
  return Response.json({orders:rows.results,counts:counts.results});
 }
 const quote=/^\/api\/print-orders\/([a-z0-9-]+)\/quote$/.exec(path);
 if(quote&&request.method==='POST')return Response.json(await quoteSavedPrintOrder(env,year,quote[1]));
 const prepare=/^\/api\/print-orders\/([a-z0-9-]+)\/prepare-proof$/.exec(path);
 if(prepare&&request.method==='POST')return Response.json(await prepareSavedOrderProof(env,year,prepare[1]));
 const proof=/^\/api\/print-orders\/([a-z0-9-]+)\/(artwork|default-artwork|vendor-front|vendor-inside|vendor-back)$/.exec(path);
 if(proof&&request.method==='GET'){
  const row=await env.DB.prepare('SELECT o.artwork_key,o.default_artwork_key,p.front_key,p.inside_key,p.back_key FROM print_orders o LEFT JOIN handwrytten_previews p ON p.id=o.handwrytten_preview_id AND p.invitation_id=o.invitation_id AND p.year=o.year WHERE o.id=?1 AND o.year=?2').bind(proof[1],year).first<{artwork_key:string;default_artwork_key:string|null;front_key:string|null;inside_key:string|null;back_key:string|null}>();
  if(!row)throw new PrintProblem(404,'Print order not found.');
  const key=proof[2]==='vendor-front'?row.front_key:proof[2]==='vendor-inside'?row.inside_key:proof[2]==='vendor-back'?row.back_key:proof[2]==='default-artwork'?(row.default_artwork_key||row.artwork_key):row.artwork_key;
  const file=key?await env.MEDIA.get(key):null;if(!file)throw new PrintProblem(404,'Artwork not found.');return new Response(file.body,{headers:{'Content-Type':file.httpMetadata?.contentType||'image/jpeg'}});
 }
 return null;
}
