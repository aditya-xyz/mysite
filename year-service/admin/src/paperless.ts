import {digitalPostcard} from '../../src/digital-postcards.ts';
import type {InvitationAudience} from '../../src/invitations.ts';
import {PrintProblem} from '../../src/printing.ts';
import {token} from '../../src/security.ts';
export async function resetPaperless(db:D1Database,year:number,id:string,version:unknown,claimId:unknown,actor:string){
 if(!Number.isInteger(version)||typeof claimId!=='string')throw new PrintProblem(400,'Choose the current invitation and paperless preference.');
 const invite=await db.prepare('SELECT * FROM invites WHERE id=?1 AND edition_year=?2 AND version=?3').bind(id,year,version as number).first<InvitationAudience>();
 if(!invite)throw new PrintProblem(409,'This invitation changed. Refresh before resetting its paperless preference.');
 const claim=await digitalPostcard(db,invite);
 if(!claim||claim.id!==claimId)throw new PrintProblem(409,'This paperless preference changed. Refresh before resetting it.');
 const resetId='reset-'+token().slice(0,24);
 const guard=`EXISTS(SELECT 1 FROM invites WHERE id=?2 AND edition_year=?3 AND version=?4)`;
 const result=await db.batch([
  db.prepare(`INSERT INTO digital_postcard_resets(id,year,invitation_id,reset_invitation_id,reset_by,claim_json)
   SELECT ?5,year,invitation_id,?2,?6,?7 FROM digital_postcards WHERE id=?1 AND ${guard} RETURNING id`).bind(claim.id,id,year,version as number,resetId,actor,JSON.stringify(claim)),
  db.prepare(`DELETE FROM digital_postcards WHERE id=?1 AND ${guard} AND EXISTS(SELECT 1 FROM digital_postcard_resets WHERE id=?5)`).bind(claim.id,id,year,version as number,resetId),
  db.prepare(`DELETE FROM card_fallback_jobs WHERE year=?1 AND state='skipped' AND order_id IS NULL AND reason='This household permanently chose a digital postcard.'
   AND EXISTS(SELECT 1 FROM digital_postcard_resets WHERE id=?2)
   AND (invitation_id=?3 OR invitation_id IN (SELECT i.id FROM invites i WHERE i.edition_year=?1 AND (i.person_id IN (SELECT value FROM json_each(?4)) OR EXISTS(SELECT 1 FROM json_each(i.member_ids) a JOIN json_each(?4) b ON a.value=b.value))))`).bind(year,resetId,claim.invitation_id,claim.member_ids),
  db.prepare(`UPDATE invites SET version=version+1 WHERE id=?1 AND edition_year=?2 AND version=?3 AND EXISTS(SELECT 1 FROM digital_postcard_resets WHERE id=?4)`).bind(id,year,version as number,resetId)
 ]);
 if(!result[0].results.length)throw new PrintProblem(409,'This invitation changed. Refresh before resetting its paperless preference.');
 return {reset:true};
}
