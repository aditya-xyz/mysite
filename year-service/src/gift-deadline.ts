import {now} from './security.ts';
import type {InvitationAudience} from './invitations.ts';
export interface CardFallbackPolicy {year:number;international_cutoff:number;international_run_at:number;us_cutoff:number;us_run_at:number}
const pacificParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function cutoffSchedule(lastDay:string,year:number){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)||Number(lastDay.slice(0,4))!==year)throw new Error('Choose a valid cutoff date in this scrapbook’s year.');
 const day=Date.parse(lastDay+'T00:00:00Z');
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==lastDay)throw new Error('Choose a valid cutoff date.');
 const followingDay=day+86400000;
 const pacific=(hour:number)=>{
  const target=followingDay+hour*3600000;let instant=target;
  for(let n=0;n<3;n++){
   const p=Object.fromEntries(pacificParts.formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
   const wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);instant+=target-wall;
  }
  return instant/1000;
 };
 return {closesAt:pacific(0),runAt:pacific(6)};
}
export function countryDeadline(policy:CardFallbackPolicy,country:unknown){
 const international=typeof country==='string'&&country!==''&&country!=='US';
 return {closesAt:international?policy.international_cutoff:policy.us_cutoff,runAt:international?policy.international_run_at:policy.us_run_at};
}
// Re-read editable dates inside the reservation so an in-flight claim cannot use an old cutoff.
export const giftReservationOpenSQL=`NOT EXISTS(SELECT 1 FROM card_fallback_policies cutoff_policy WHERE cutoff_policy.year=i.edition_year AND unixepoch()>=
 CASE WHEN coalesce(nullif((SELECT CASE WHEN json_valid(gp.mailing_address) THEN json_extract(gp.mailing_address,'$.country') END FROM people gp WHERE gp.id=i.person_id),''),'US')!='US'
 THEN cutoff_policy.international_cutoff ELSE cutoff_policy.us_cutoff END)`;
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
