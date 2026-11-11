import {PrintProblem} from '../../src/printing.ts';

// Check the stored draft and publication, including hidden photos and older years.
// Every condition is repeated in DELETE so a new reference cannot slip between
// the initial explanation and the database write.
const unused=`
 NOT EXISTS (SELECT 1 FROM invites i WHERE i.person_id=?1
   OR EXISTS (SELECT 1 FROM json_each(i.member_ids) m WHERE m.value=?1))
 AND NOT EXISTS (SELECT 1 FROM editions e,json_each(e.draft_json,'$.photos') p,
   json_each(p.value,'$.recipients') r WHERE r.value=?1)
 AND NOT EXISTS (SELECT 1 FROM editions e,json_each(e.published_json,'$.photos') p,
   json_each(p.value,'$.recipients') r WHERE r.value=?1)`;

export async function deleteContact(db:D1Database,id:string,version:unknown){
 if(!Number.isInteger(version))throw new PrintProblem(400,'Missing person version.');
 const person=await db.prepare('SELECT id FROM people WHERE id=?1 AND version=?2').bind(id,version as number).first();
 if(!person)throw new PrintProblem(409,'This person changed. Refresh People before deleting.');
 const free=await db.prepare(`SELECT id FROM people WHERE id=?1 AND version=?2 AND ${unused}`).bind(id,version as number).first();
 if(!free)throw new PrintProblem(409,'This person is still used in a saved draft, published scrapbook, or invitation. Remove those references first. Invitation and print history are kept.');
 const results=await db.batch([
  db.prepare(`DELETE FROM address_verification_challenges WHERE person_id=?1 AND EXISTS(SELECT 1 FROM people WHERE id=?1 AND version=?2 AND ${unused})`).bind(id,version as number),
  db.prepare(`DELETE FROM people WHERE id=?1 AND version=?2 AND ${unused} RETURNING id`).bind(id,version as number)
 ]);
 if(!results[1].results.length)throw new PrintProblem(409,'This person changed or is now in use. Refresh People before deleting.');
 return {deleted:true,id};
}
