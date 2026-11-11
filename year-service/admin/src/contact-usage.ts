import {PrintProblem} from '../../src/printing.ts';
export async function contactUsage(db:D1Database,id:string){
 if(!await db.prepare('SELECT id FROM people WHERE id=?1').bind(id).first())throw new PrintProblem(404,'Person not found.');
 const photoSql=(column:string)=>`SELECT e.year,CAST(p.key AS INTEGER)+1 AS number,json_extract(p.value,'$.id') AS id,json_extract(p.value,'$.caption') AS caption,coalesce(json_extract(p.value,'$.hidden'),0) AS hidden FROM editions e,json_each(e.${column},'$.photos') p WHERE EXISTS(SELECT 1 FROM json_each(p.value,'$.recipients') r WHERE r.value=?1) ORDER BY e.year DESC,number`;
 const [drafts,published,invitations]=await Promise.all([
  db.prepare(photoSql('draft_json')).bind(id).all(),db.prepare(photoSql('published_json')).bind(id).all(),
  db.prepare(`SELECT i.id,i.edition_year AS year,i.version,coalesce(i.addressed_to,i.name) AS name,CASE WHEN i.revoked_at IS NOT NULL THEN 'Revoked' WHEN i.expires_at<=unixepoch() THEN 'Expired' ELSE 'Active' END AS status,(SELECT count(*) FROM print_orders o WHERE o.invitation_id=i.id) AS printOrders FROM invites i WHERE i.person_id=?1 OR EXISTS(SELECT 1 FROM json_each(i.member_ids) m WHERE m.value=?1) ORDER BY i.edition_year DESC,i.name`).bind(id).all()
 ]);
 return {drafts:drafts.results,published:published.results,invitations:invitations.results};
}
