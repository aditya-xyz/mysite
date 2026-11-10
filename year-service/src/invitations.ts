export interface InvitationAudience { id:string; person_id:string|null; edition_year:number; member_ids:string; addressed_to:string|null; name:string; share_socials?:number }
export const invitationName = (invite: Pick<InvitationAudience,'addressed_to'|'name'>) => invite.addressed_to || invite.name;
export const invitationMembers = (invite: Pick<InvitationAudience,'member_ids'|'person_id'>):string[] =>
  invite.member_ids ? JSON.parse(invite.member_ids) : invite.person_id ? [invite.person_id] : [];
// Include aliases from old published manifests, restricted to this scrapbook.
export async function invitationAudience(db:D1Database, invite:InvitationAudience):Promise<string[]> {
  const members=invitationMembers(invite);
  const aliases=await db.prepare(`SELECT id FROM invites WHERE edition_year=?1 AND person_id IN (SELECT value FROM json_each(?2))`)
    .bind(invite.edition_year,JSON.stringify(members)).all<{id:string}>();
  return [...new Set([invite.id,...members,...aliases.results.map(p=>p.id)])];
}
