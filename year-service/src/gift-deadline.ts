import {now} from './security.ts';
import type {InvitationAudience} from './invitations.ts';
export interface CardFallbackPolicy {year:number;international_cutoff:number;international_run_at:number;us_cutoff:number;us_run_at:number}
export function countryDeadline(policy:CardFallbackPolicy,country:unknown){
 const international=typeof country==='string'&&country!==''&&country!=='US';
 return {closesAt:international?policy.international_cutoff:policy.us_cutoff,runAt:international?policy.international_run_at:policy.us_run_at};
}
export async function giftWindow(db:D1Database,invite:Pick<InvitationAudience,'id'|'person_id'|'edition_year'>,at=now()){
 const policy=await db.prepare('SELECT * FROM card_fallback_policies WHERE year=?1').bind(invite.edition_year).first<CardFallbackPolicy>();
 if(!policy)return {closed:false,closesAt:null,runAt:null};
 const [person,job]=await Promise.all([
  db.prepare('SELECT mailing_address FROM people WHERE id=?1').bind(invite.person_id).first<{mailing_address:string|null}>(),
  db.prepare('SELECT cutoff_at,run_at FROM card_fallback_jobs WHERE year=?1 AND invitation_id=?2').bind(invite.edition_year,invite.id).first<{cutoff_at:number;run_at:number}>()
 ]);
 let country:unknown;try{country=JSON.parse(person?.mailing_address||'{}').country;}catch{}
 const deadline=job?{closesAt:job.cutoff_at,runAt:job.run_at}:countryDeadline(policy,country);
 return {closed:at>=deadline.closesAt,...deadline};
}
