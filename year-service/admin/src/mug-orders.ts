import {preparedMugAdminRoute} from '../../src/prepared-mugs.ts';
import {PrintProblem,simulatedOrders,mailingAddress,type PrintEnv} from '../../src/printing.ts';
import {estimateMug,reserveMugEstimate} from '../../src/printful.ts';
import {resetSimulatedOrder} from './simulated-order-reset.ts';
export async function mugAdminRoute(request:Request,env:PrintEnv,path:string,year:number,readBody:()=>Promise<Record<string,unknown>>){
 const library=await preparedMugAdminRoute(request,env,path,year);if(library)return library;
 if(path==='/api/mug-settings'&&request.method==='POST'){
  const data=await readBody();if(typeof data.allowMugOrders!=='boolean')throw new PrintProblem(400,'Choose whether mug orders are allowed.');
  if(data.allowMugOrders&&!simulatedOrders(request,env))throw new PrintProblem(503,'Mug fulfillment is not connected. Orders remain disabled.');
  const saved=await env.DB.prepare('UPDATE editions SET allow_mug_orders=?1 WHERE year=?2 RETURNING year').bind(Number(data.allowMugOrders),year).first();
  if(!saved)throw new PrintProblem(404,'Scrapbook not found.');return Response.json({allowMugOrders:data.allowMugOrders});
 }
 const reset=/^\/api\/invitations\/([a-z0-9-]{1,100})\/reset-mug-allowance$/.exec(path);
 if(reset&&request.method==='POST')return Response.json(await resetSimulatedOrder(env,'mug',year,reset[1],await readBody()));
 const quote=/^\/api\/mug-orders\/(mug-[a-z0-9]+)\/quote$/.exec(path);
 if(quote&&request.method==='POST'){
  const order=await env.DB.prepare("SELECT invitation_id,address_json,configuration_json FROM mug_orders WHERE id=?1 AND year=?2 AND status='simulated' AND allowance_reset_at IS NULL").bind(quote[1],year).first<{invitation_id:string;address_json:string;configuration_json:string}>();
  if(!order)throw new PrintProblem(404,'Simulated mug order not found.');
  await reserveMugEstimate(env,order.invitation_id);
  const estimate=await estimateMug(env,JSON.parse(order.configuration_json),mailingAddress(JSON.parse(order.address_json)));
  const saved=await env.DB.prepare("UPDATE mug_orders SET quote_json=?1,budget_review_required=CASE WHEN ?4>max(2500,coalesce(budget_approved_cents,0)) THEN 1 ELSE 0 END WHERE id=?2 AND year=?3 AND status='simulated' AND allowance_reset_at IS NULL RETURNING id").bind(JSON.stringify(estimate),quote[1],year,estimate.totalCents).first();
  if(!saved)throw new PrintProblem(409,'This order changed. Reopen mug history.');
  return Response.json({quote:estimate});
 }
 if(path==='/api/mug-orders'&&request.method==='GET'){
  const orders=await env.DB.prepare("SELECT o.id,o.invitation_id,o.status,o.recipient_name,o.caption,o.alt,o.created_at,o.configuration_json,o.quote_json,o.address_json,o.budget_review_required,o.budget_approved_cents,o.budget_approved_by,o.budget_approved_at,COALESCE(p.image_key,m.image_key) AS mockup_key,CASE WHEN l.order_id IS NOT NULL THEN 1 ELSE 0 END AS live,l.state AS live_state FROM mug_orders o LEFT JOIN mug_mockups m ON m.id=o.mockup_id LEFT JOIN mug_preview_images p ON p.id=o.prepared_preview_id LEFT JOIN live_gift_orders l ON l.order_id=o.id AND l.kind='mug' WHERE o.year=?1 AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown') ORDER BY o.created_at DESC,o.id LIMIT 200").bind(year).all();
  const counts=await env.DB.prepare("SELECT i.id AS invitation_id,i.mug_order_count AS count,o.id AS active_order_id,o.status,CASE WHEN l.order_id IS NOT NULL THEN 1 ELSE 0 END AS live,l.state AS live_state,CASE WHEN o.status='simulated' AND l.order_id IS NULL THEN 1 ELSE 0 END AS can_reset FROM invites i LEFT JOIN mug_orders o ON o.invitation_id=i.id AND o.year=i.edition_year AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown') LEFT JOIN live_gift_orders l ON l.order_id=o.id AND l.kind='mug' WHERE i.edition_year=?1").bind(year).all();
  return Response.json({orders:orders.results,counts:counts.results});
 }
 const proof=/^\/api\/mug-orders\/(mug-[a-z0-9]+)\/(artwork|mockup)$/.exec(path);
 if(proof&&request.method==='GET'){
  const row=await env.DB.prepare('SELECT o.artwork_key,COALESCE(p.image_key,m.image_key) AS image_key FROM mug_orders o LEFT JOIN mug_mockups m ON m.id=o.mockup_id LEFT JOIN mug_preview_images p ON p.id=o.prepared_preview_id WHERE o.id=?1 AND o.year=?2').bind(proof[1],year).first<{artwork_key:string;image_key:string|null}>();
  const key=proof[2]==='mockup'?row?.image_key:row?.artwork_key;if(!key)throw new PrintProblem(404,'Mug order not found.');const file=await env.MEDIA.get(key);if(!file)throw new PrintProblem(404,'Mug design not found.');return new Response(file.body,{headers:{'Content-Type':'image/png'}});
 }
 return null;
}
