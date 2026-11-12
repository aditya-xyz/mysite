import {PrintProblem} from '../../src/printing.ts';
export async function deleteInvitation(db:D1Database,id:string,year:number,version:unknown){
 if(!Number.isInteger(version))throw new PrintProblem(400,'Missing invitation version.');
 const invite=await db.prepare('SELECT revoked_at FROM invites WHERE id=?1 AND edition_year=?2 AND version=?3').bind(id,year,version as number).first<{revoked_at:number|null}>();
 if(!invite)throw new PrintProblem(409,'This invitation changed. Refresh Invitations before deleting.');
 if(invite.revoked_at===null)throw new PrintProblem(409,'Revoke access before deleting this invitation.');
 const eligible=`id=?1 AND edition_year=?2 AND version=?3 AND revoked_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM print_orders WHERE invitation_id=?1)
 AND NOT EXISTS(SELECT 1 FROM mug_orders WHERE invitation_id=?1)
 AND NOT EXISTS(SELECT 1 FROM photos WHERE invite_id=?1)
 AND NOT EXISTS(SELECT 1 FROM editions e,json_each(e.draft_json,'$.photos') p,json_each(p.value,'$.recipients') r WHERE r.value=?1)
 AND NOT EXISTS(SELECT 1 FROM editions e,json_each(e.published_json,'$.photos') p,json_each(p.value,'$.recipients') r WHERE r.value=?1)`;
 const free=await db.prepare(`SELECT id FROM invites WHERE ${eligible}`).bind(id,year,version as number).first();
 if(!free)throw new PrintProblem(409,'This invitation has order history or legacy photo references and must be kept.');
 const result=await db.batch([
  db.prepare(`DELETE FROM sessions WHERE invite_id=?1 AND EXISTS(SELECT 1 FROM invites WHERE ${eligible})`).bind(id,year,version as number),
  db.prepare(`DELETE FROM original_downloads WHERE invite_id=?1 AND EXISTS(SELECT 1 FROM invites WHERE ${eligible})`).bind(id,year,version as number),
  db.prepare(`DELETE FROM invites WHERE ${eligible} RETURNING id`).bind(id,year,version as number)
 ]);
 if(!result[2].results.length)throw new PrintProblem(409,'This invitation changed or is now in use. Refresh before deleting.');
 return {deleted:true,id};
}
