import {cutoffSchedule,type CardFallbackPolicy} from '../../src/gift-deadline.ts';
import {now} from '../../src/security.ts';
import {cardFallbackPreview} from '../../src/card-fallback.ts';
import {PrintProblem,type PrintEnv} from '../../src/printing.ts';
export async function cardFallbackAdminRoute(request:Request,env:PrintEnv,path:string,year:number,actor:string,readBody:()=>Promise<Record<string,unknown>>){
 if(path==='/api/card-fallback'&&request.method==='GET')return Response.json(await cardFallbackPreview(env,year));
 if(path==='/api/card-fallback/dates'&&request.method==='POST'){
  const data=await readBody(),previous=data.previousPolicy as CardFallbackPolicy|undefined;
  if(typeof data.internationalLastDay!=='string'||typeof data.usLastDay!=='string'||!previous||previous.year!==year||!['international_cutoff','international_run_at','us_cutoff','us_run_at'].every(key=>Number.isSafeInteger((previous as unknown as Record<string,unknown>)[key])))throw new PrintProblem(400,'Choose both cutoff dates and reload the current schedule before saving.');
  let international,us;
  try{international=cutoffSchedule(data.internationalLastDay,year);us=cutoffSchedule(data.usLastDay,year);}catch(error){throw new PrintProblem(400,error instanceof Error?error.message:'Choose valid cutoff dates.');}
  if(Math.min(international.closesAt,us.closesAt)<=now())throw new PrintProblem(400,'Choose dates whose gift cutoff is still in the future.');
  const result=await env.DB.batch([
   env.DB.prepare(`UPDATE card_fallback_policies SET international_cutoff=?1,international_run_at=?2,us_cutoff=?3,us_run_at=?4
    WHERE year=?5 AND international_cutoff=?6 AND international_run_at=?7 AND us_cutoff=?8 AND us_run_at=?9
    AND international_cutoff>unixepoch() AND us_cutoff>unixepoch()
    AND NOT EXISTS(SELECT 1 FROM card_fallback_jobs WHERE year=?5) RETURNING *`)
    .bind(international.closesAt,international.runAt,us.closesAt,us.runAt,year,previous.international_cutoff,previous.international_run_at,previous.us_cutoff,previous.us_run_at),
   env.DB.prepare('INSERT INTO admin_events(actor,action,target) SELECT ?1,?2,?3 WHERE changes()>0').bind(actor,'update-card-cutoff-dates',JSON.stringify({year,internationalLastDay:data.internationalLastDay,usLastDay:data.usLastDay}))
  ]);
  if(!result[0].results.length)throw new PrintProblem(409,'The schedule changed or a cutoff has already started. Refresh to see the current dates. Recorded decisions and existing orders are preserved.');
  return Response.json({policy:result[0].results[0]});
 }
 const retry=/^\/api\/card-fallback\/retry\/([a-z0-9-]{1,100})$/.exec(path);
 if(retry&&request.method==='POST'){
  const result=await env.DB.prepare(`UPDATE card_fallback_jobs SET state='pending',attempts=0,next_at=0,reason='',updated_at=unixepoch()
   WHERE year=?1 AND invitation_id=?2 AND state='failed' AND (order_id IS NULL OR EXISTS(SELECT 1 FROM print_orders o WHERE o.id=order_id AND o.status='preparing')) RETURNING invitation_id`).bind(year,retry[1]).first();
  if(!result)throw new PrintProblem(409,'Only failed preparation can be retried. Submitted or uncertain orders require review.');
  await env.DB.prepare('INSERT INTO admin_events(actor,action,target) VALUES(?1,?2,?3)').bind(actor,'retry-fallback-preparation',JSON.stringify({year,invitationId:retry[1]})).run();
  return Response.json({queued:true,testMode:true});
 }
 return null;
}
