import {PrintProblem,type PrintEnv} from '../../src/printing.ts';
import {requireHandwryttenTestMode} from '../../src/handwrytten.ts';
import {now} from '../../src/security.ts';

// Actor comes exclusively from adminIdentity; guest/preview routes never call this handler.
export async function orderBudgetApprovalRoute(request:Request,env:PrintEnv,path:string,year:number,actor:string,readBody:()=>Promise<Record<string,unknown>>){
 const match=/^\/api\/(mug|print)-orders\/([a-z0-9-]+)\/approve-budget$/.exec(path);
 if(!match||request.method!=='POST')return null;
 if(env.ORDER_MODE!=='simulation')throw new PrintProblem(409,'Budget approvals are enabled only in simulation mode.');
 const kind=match[1],id=match[2],table=kind==='mug'?'mug_orders':'print_orders',quoteColumn=kind==='mug'?'quote_json':'handwrytten_quote_json',limit=kind==='mug'?2500:1000;
 const data=await readBody();if(data.confirm!==true||typeof data.quote!=='string')throw new PrintProblem(400,'Review and confirm this exact order quote.');
 const order=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?1 AND year=?2 AND status='simulated' AND allowance_reset_at IS NULL`).bind(id,year).first<any>();
 if(!order)throw new PrintProblem(404,'Active simulated order not found.');
 if(order[quoteColumn]!==data.quote)throw new PrintProblem(409,'The quote changed. Refresh the order and review the new total.');
 let quote:any;try{quote=JSON.parse(data.quote);}catch{throw new PrintProblem(409,'Get a complete quote before approving.');}
 const total=kind==='mug'?quote.totalCents:quote.amounts?.total;
 if(quote.currency!=='USD'||!Number.isSafeInteger(total)||total<=limit)throw new PrintProblem(409,'This order does not need an over-budget approval.');
 if(kind==='print'){
  if(env.PRINT_ORDER_MODE!=='handwrytten_test')throw new PrintProblem(409,'Handwrytten approvals require Test Mode.');
  const job=await env.DB.prepare('SELECT * FROM print_fulfillment WHERE order_id=?1').bind(id).first<any>();
  if(!job||job.quote_only||quote.quoteOnly||quote.submitted||quote.source!=='handwrytten-test-basket')throw new PrintProblem(409,'Only an unsent automatic test order can be approved. Quote-only previews cannot submit.');
  if(order.budget_approved_cents===total&&!order.budget_review_required&&['pending','preparing'].includes(job.state))return Response.json({approved:true,reused:true,maxCents:total,testMode:true});
  if(job.state!=='review'||job.basket_item_id!==null)throw new PrintProblem(409,'This order is processing or needs basket reconciliation. Approval cannot retry it.');
  await requireHandwryttenTestMode(env);
 }
 if(!order.budget_review_required){if(order.budget_approved_cents===total)return Response.json({approved:true,reused:true,maxCents:total,testMode:true});throw new PrintProblem(409,'Refresh the order before approving.');}
 const at=now();
 const statements=[env.DB.prepare(`UPDATE ${table} SET budget_review_required=0,budget_approved_cents=?1,budget_approved_by=?2,budget_approved_at=?3,updated_at=?3 WHERE id=?4 AND year=?5 AND status='simulated' AND allowance_reset_at IS NULL AND budget_review_required=1 AND ${quoteColumn}=?6${kind==='print'?" AND EXISTS(SELECT 1 FROM print_fulfillment f WHERE f.order_id=print_orders.id AND f.state='review' AND f.quote_only=0 AND f.basket_item_id IS NULL)":''} RETURNING id`).bind(total,actor,at,id,year,data.quote),
 env.DB.prepare(`INSERT INTO admin_events(actor,action,target) SELECT ?1,?2,?3 WHERE changes()>0`).bind(actor,`approve-${kind}-budget`,JSON.stringify({orderId:id,year,maxCents:total,currency:'USD',testMode:true}))];
 if(kind==='print')statements.push(env.DB.prepare("UPDATE print_fulfillment SET state='pending',vendor_order_id=NULL,attempts=0,next_at=?1,error=NULL,updated_at=?1 WHERE order_id=?2 AND state='review' AND quote_only=0 AND basket_item_id IS NULL AND EXISTS(SELECT 1 FROM print_orders o WHERE o.id=?2 AND o.year=?3 AND o.status='simulated' AND o.allowance_reset_at IS NULL AND o.budget_review_required=0 AND o.budget_approved_cents=?4 AND o.budget_approved_by=?5 AND o.budget_approved_at=?1)").bind(at,id,year,total,actor));
 const results=await env.DB.batch(statements);
 if(!results[0].results.length)throw new PrintProblem(409,'This order changed. Refresh before approving.');
 return Response.json({approved:true,maxCents:total,approvedBy:actor,approvedAt:at,testMode:true,queued:kind==='print'});
}
