import type { Draft } from "../../src/edition.ts";

// Existing manifests keep invitation IDs. New drafts use directory IDs. Resolve
// aliases only within this year so another year's invitation is never accepted.
export async function canonicalDraft(draft: Draft, db: D1Database, year: number): Promise<Draft> {
  const invites=await db.prepare("SELECT id,person_id FROM invites WHERE edition_year=?1").bind(year).all<{id:string;person_id:string}>();
  const aliases=new Map(invites.results.map(i=>[i.id,i.person_id]));
  if (!Array.isArray(draft?.photos)) return draft;
  return {...draft,photos:draft.photos.map(p=>p && Array.isArray(p.recipients)?
    {...p,recipients:[...new Set(p.recipients.map(id=>aliases.get(id)||id))]}:p)};
}
export interface Contact { id:string; name:string; phone:string; version:number }
