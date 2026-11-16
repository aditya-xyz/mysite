import {countryDeadline,type CardFallbackPolicy} from './gift-deadline.ts';
import {mailingAddress,printedGreeting,foldedBackText,finishSavedPrintOrder,type PrintEnv,type MailingAddress} from './printing.ts';
import {invitationMembers,invitationName,invitationRecipientName,type InvitationAudience} from './invitations.ts';
import {printOrderLimitCents} from './handwrytten-fulfillment.ts';
import {imageDimensions} from './image-dimensions.ts';
import {digest,now} from './security.ts';

type Candidate=InvitationAudience&{version:number;revoked_at:number|null;expires_at:number;mailing_address:string|null;person_name:string;person_version:number;print_order_count:number};
interface Job {invitation_id:string;year:number;household_key:string;cutoff_at:number;run_at:number;state:string;reason:string;order_id:string|null;attempts:number}
const members=(i:InvitationAudience)=>[...new Set([i.person_id,...invitationMembers(i)].filter((id):id is string=>!!id))].sort();
const overlap=(a:string[],b:string[])=>a.some(id=>b.includes(id));
const householdKey=(i:InvitationAudience)=>JSON.stringify(members(i).length?members(i):[i.id]);

async function fallbackPlan(env:PrintEnv,year:number,at:number){
 const policy=await env.DB.prepare('SELECT * FROM card_fallback_policies WHERE year=?1').bind(year).first<CardFallbackPolicy>();
 if(!policy)return {policy:null,rows:[],edition:null,defaults:null};
 const [edition,defaults,invitations,jobs,orders]=await Promise.all([
  env.DB.prepare('SELECT published_json,published_version,is_active,allow_print_orders FROM editions WHERE year=?1').bind(year).first<any>(),
  env.DB.prepare('SELECT revision,frames_json FROM keepsake_defaults WHERE year=?1').bind(year).first<{revision:string;frames_json:string}>(),
  env.DB.prepare('SELECT i.*,p.mailing_address,p.name AS person_name,p.version AS person_version FROM invites i LEFT JOIN people p ON p.id=i.person_id WHERE i.edition_year=?1 ORDER BY i.id').bind(year).all<Candidate>(),
  env.DB.prepare('SELECT * FROM card_fallback_jobs WHERE year=?1').bind(year).all<Job>(),
  env.DB.prepare("SELECT o.id,o.invitation_id,o.status,o.budget_review_required,f.state AS fulfillment_state,f.error AS fulfillment_error,o.handwrytten_quote_json FROM print_orders o LEFT JOIN print_fulfillment f ON f.order_id=o.id WHERE o.year=?1 AND o.status IN ('preparing','simulated','submitted','unknown')").bind(year).all<any>()
 ]);
 const published=edition?.published_json?JSON.parse(edition.published_json):null;
 const note=published?.defaultPrintNote?.trim()||published?.printNote?.trim()||'';
 const defaultKey=defaults?JSON.parse(defaults.frames_json)['starry-night']:null;
 const selected:string[][]=[];
 const rows=invitations.results.map(invitation=>{
  const job=jobs.results.find(j=>j.invitation_id===invitation.id);
  let address:MailingAddress|null=null,country:unknown;
  try{const raw=JSON.parse(invitation.mailing_address||'{}');country=raw.country;address=mailingAddress(raw);}catch{}
  const deadline=job?{closesAt:job.cutoff_at,runAt:job.run_at}:countryDeadline(policy,country);
  const audience=members(invitation),key=householdKey(invitation);
  const existing=orders.results.find(o=>o.invitation_id===invitation.id||overlap(audience,members(invitations.results.find(i=>i.id===o.invitation_id)!)));
  let reason='',decision='';
  if(existing){
   decision=job?.state==='failed'&&existing.id===job.order_id&&existing.status==='preparing'?'failed':existing.budget_review_required?'awaiting-approval':existing.status==='unknown'||['unknown','review'].includes(existing.fulfillment_state)?'needs-review':existing.status==='submitted'?'submitted':'ordered';
   reason=decision==='failed'?job!.reason:'A card order already exists for this household.';
  }else if(job&&['saved','skipped','failed'].includes(job.state)){decision=job.state;reason=job.reason||'The cutoff decision has already been recorded.';}
  else if(job&&job.household_key!==key)reason='Household membership changed after cutoff; admin review is required.';
  else if(invitation.revoked_at||invitation.expires_at<=at)reason='Invitation is inactive.';
  else if(!invitation.allow_print)reason='Card permission is off.';
  else if(!edition?.is_active||!edition.published_version||!published)reason='Scrapbook is not published and active.';
  else if(!edition.allow_print_orders)reason='Card orders are turned off.';
  else if(!address)reason=invitation.mailing_address?'Saved address is incomplete or unsupported.':'No saved mailing address.';
  else if(!note)reason='The default card note is not published.';
  else if(!defaultKey)reason='Approved Starry Night artwork is unavailable.';
  else if(invitation.print_order_count)reason='The card allowance is already used.';
  else if(selected.some(other=>overlap(audience,other)))reason='Another invitation represents this household.';
  if(!decision)decision=reason?'skipped':at>=deadline.runAt?'due':'scheduled';
  if(!reason)selected.push(audience);
  return {invitationId:invitation.id,name:invitationName(invitation),country:country||'US',address,householdKey:key,cutoffAt:deadline.closesAt,runAt:deadline.runAt,closed:at>=deadline.closesAt,decision,reason,orderId:existing?.id||job?.order_id||null,jobState:job?.state||null,fulfillment:existing?.fulfillment_state||null,fulfillmentError:existing?.fulfillment_error||null,quote:existing?.handwrytten_quote_json?JSON.parse(existing.handwrytten_quote_json):null,job:job||null,invitation};
 });
 return {policy,rows,edition,defaults,defaultKey,note,published};
}

// A dry run reads DB/R2 only. No proofs, vendor quotes, baskets, orders or jobs are created.
export async function cardFallbackPreview(env:PrintEnv,year:number,at=now()){
 const plan=await fallbackPlan(env,year,at);
 let artworkAvailable=false;
 if(plan.defaultKey)artworkAvailable=!!await env.MEDIA.head(plan.defaultKey);
 const rows=plan.rows.map(({invitation,job,...row})=>!artworkAvailable&&['scheduled','due'].includes(row.decision)?{...row,decision:'skipped',reason:'Approved Starry Night artwork is missing from storage.'}:row);
 return {year,asOf:at,policy:plan.policy,policyEditable:!!plan.policy&&at<Math.min(plan.policy.international_cutoff,plan.policy.us_cutoff)&&!plan.rows.some(row=>row.job),frame:'starry-night',testMode:true,submissionEnabled:env.ORDER_MODE==='simulation'&&env.PRINT_ORDER_MODE==='handwrytten_test',automaticLimitCents:printOrderLimitCents,artworkAvailable,rows,summary:rows.reduce<Record<string,number>>((counts,row)=>({...counts,[row.decision]:(counts[row.decision]||0)+1}),{})};
}

export async function tickCardFallback(env:PrintEnv,at=now()){
 const policies=await env.DB.prepare('SELECT year FROM card_fallback_policies WHERE min(international_cutoff,us_cutoff)<=?1').bind(at).all<{year:number}>();
 for(const {year} of policies.results){
  const plan=await fallbackPlan(env,year,at);
  for(const row of plan.rows){
   if(!row.closed||row.job)continue;
   // Record every cutoff decision, including missing addresses. It cannot reopen later.
   await env.DB.prepare("INSERT INTO card_fallback_jobs(invitation_id,year,household_key,cutoff_at,run_at,state,reason,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8) ON CONFLICT DO NOTHING")
    .bind(row.invitationId,year,row.householdKey,row.cutoffAt,row.runAt,['scheduled','due'].includes(row.decision)?'pending':'skipped',row.reason,at).run();
  }
 }
 // No live adapter is enabled by this automation. Vendor Test Mode is checked again by fulfillment.
 if(env.ORDER_MODE!=='simulation'||env.PRINT_ORDER_MODE!=='handwrytten_test')return;
 const owner=crypto.randomUUID();
 const job=await env.DB.prepare(`UPDATE card_fallback_jobs SET state='preparing',owner=?1,lease_until=?2,attempts=attempts+1,updated_at=?3
 WHERE (year,invitation_id)=(SELECT year,invitation_id FROM card_fallback_jobs WHERE run_at<=?3 AND next_at<=?3 AND (state='pending' OR (state='preparing' AND lease_until<=?3)) ORDER BY run_at,created_at,invitation_id LIMIT 1)
 RETURNING *`).bind(owner,at+300,at).first<Job>();
 if(!job)return;
 const update=async(state:string,reason='',orderId:string|null=job.order_id)=>env.DB.prepare('UPDATE card_fallback_jobs SET state=?1,reason=?2,order_id=coalesce(order_id,?3),owner=NULL,lease_until=0,next_at=?4,updated_at=?5 WHERE year=?6 AND invitation_id=?7 AND owner=?8').bind(state,reason,orderId,at+60*Math.min(10,job.attempts),at,job.year,job.invitation_id,owner).run();
 try{
  // Resume a crash during preparation using the frozen order, never submit a second vendor order.
  if(job.order_id){
   const saved=await env.DB.prepare('SELECT status FROM print_orders WHERE id=?1').bind(job.order_id).first<{status:string}>();
   if(saved?.status==='preparing')await finishSavedPrintOrder(env,job.order_id,job.year);
   else if(!saved||!['simulated','submitted','unknown'].includes(saved.status)){await update('failed','The reserved order was canceled or failed; admin review is required.');return;}
   await update('saved','Fallback order is saved; normal test fulfillment and budget approval apply.');return;
  }
  const plan=await fallbackPlan(env,job.year,at),row=plan.rows.find(r=>r.invitationId===job.invitation_id);
  if(!row||!['due','scheduled'].includes(row.decision)){await update('skipped',row?.reason||'Invitation is no longer eligible.');return;}
  const file=plan.defaultKey?await env.MEDIA.get(plan.defaultKey):null;
  if(!file)throw new Error('Approved Starry Night artwork is unavailable.');
  const bytes=new Uint8Array(await file.arrayBuffer()),dimensions=imageDimensions(bytes);
  if(dimensions?.width!==1200||dimensions.height!==1500)throw new Error('Approved Starry Night artwork has invalid dimensions.');
  const id='print-fallback-'+(await digest(JSON.stringify([job.year,job.invitation_id]))).slice(0,24),key=`${job.year}/print-orders/${id}/${owner}/front.jpg`;
  await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  const recipientName=await invitationRecipientName(env.DB,row.invitation,row.invitation.person_name);
  const recipe={format:'folded',mode:'default',source:'automatic-fallback',frame:'starry-night',frontDesign:'default',photoIds:[],crops:{},defaultRevision:plan.defaults!.revision,layout:'a2-portrait-v1'};
  const inserted=await env.DB.batch([
   env.DB.prepare(`INSERT INTO print_orders(id,invitation_id,year,request_key,status,address_json,recipient_name,note,authors,recipe_json,artwork_key,published_version,default_artwork_key,default_revision,card_count,default_note,format,back_text)
    SELECT ?1,i.id,e.year,?1,'preparing',?2,?3,?4,?5,?6,?7,e.published_version,?7,?8,1,?4,'folded',?9
    FROM invites i JOIN editions e ON e.year=i.edition_year JOIN people p ON p.id=i.person_id
    JOIN card_fallback_jobs j ON j.invitation_id=i.id AND j.year=e.year
    WHERE i.id=?10 AND i.version=?11 AND p.version=?12 AND e.published_version=?13
    AND i.revoked_at IS NULL AND i.expires_at>?14 AND i.allow_print=1 AND i.print_order_count=0 AND e.is_active=1 AND e.allow_print_orders=1
    AND j.owner=?15 AND j.state='preparing' AND j.run_at<=?14
    AND EXISTS(SELECT 1 FROM keepsake_defaults d WHERE d.year=e.year AND d.revision=?8)
    AND NOT EXISTS(SELECT 1 FROM print_orders o JOIN invites other ON other.id=o.invitation_id WHERE o.year=e.year AND o.status IN ('preparing','simulated','submitted','unknown') AND
      (other.id=i.id OR other.person_id=i.person_id OR EXISTS(SELECT 1 FROM json_each(other.member_ids) a JOIN json_each(i.member_ids) b ON a.value=b.value)))
    ON CONFLICT DO NOTHING RETURNING id`)
    .bind(id,JSON.stringify(row.address),recipientName,printedGreeting(row.invitation)+plan.note,plan.published.authors,JSON.stringify(recipe),key,plan.defaults!.revision,foldedBackText(job.year),row.invitationId,row.invitation.version,row.invitation.person_version,plan.edition.published_version,at,owner),
   env.DB.prepare("UPDATE card_fallback_jobs SET order_id=?1 WHERE year=?2 AND invitation_id=?3 AND owner=?4 AND EXISTS(SELECT 1 FROM print_orders WHERE id=?1 AND invitation_id=?3 AND status='preparing')").bind(id,job.year,job.invitation_id,owner)
  ]);
  if(!inserted[0].results.length){await env.MEDIA.delete(key);await update('skipped','Eligibility changed or a household card order already exists.');return;}
  // Link was committed with the reservation, so a crash resumes this exact immutable order.
  job.order_id=id;
  await finishSavedPrintOrder(env,id,job.year);
  await update('saved','Default Starry Night card queued in Test Mode; normal budget approval applies.',id);
 }catch(error){
  await update(job.attempts>=3?'failed':'pending',error instanceof Error?error.message:'Card preparation failed.');
 }
}
