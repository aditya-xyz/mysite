import {cardFallbackPreview,setCardFallbackExclusion} from '../../src/card-fallback.ts';
import {PrintProblem,type PrintEnv} from '../../src/printing.ts';
export async function cardFallbackAdminRoute(request:Request,env:PrintEnv,path:string,year:number,actor:string,readBody:()=>Promise<Record<string,unknown>>){
 if(path==='/api/card-fallback'&&request.method==='GET')return Response.json(await cardFallbackPreview(env,year));
 const exclude=/^\/api\/card-fallback\/exclusions\/([a-z0-9-]{1,100})$/.exec(path);
 if(exclude&&request.method==='POST'){
  const data=await readBody();if(typeof data.excluded!=='boolean')throw new PrintProblem(400,'Choose whether to exclude this household.');
  if(!await env.DB.prepare('SELECT id FROM invites WHERE id=?1 AND edition_year=?2').bind(exclude[1],year).first())throw new PrintProblem(404,'Invitation not found.');
  await setCardFallbackExclusion(env,year,exclude[1],data.excluded,actor);return Response.json({excluded:data.excluded});
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
