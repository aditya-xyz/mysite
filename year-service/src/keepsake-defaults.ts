import {PrintProblem,type PrintEnv} from './printing.ts';
import type {InvitationAudience} from './invitations.ts';
export interface KeepsakeDefault {revision:string;frames:Record<string,string>}
export async function keepsakeDefault(env:PrintEnv,year:number):Promise<KeepsakeDefault|null>{
 const row=await env.DB.prepare('SELECT revision,frames_json FROM keepsake_defaults WHERE year=?1').bind(year).first<{revision:string;frames_json:string}>();
 return row?{revision:row.revision,frames:JSON.parse(row.frames_json)}:null;
}
export async function keepsakeAccess(env:PrintEnv,invite:InvitationAudience){
 const row=await env.DB.prepare('SELECT i.allow_print,e.allow_print_orders,e.is_active FROM invites i JOIN editions e ON e.year=i.edition_year WHERE i.id=?1 AND i.edition_year=?2').bind(invite.id,invite.edition_year).first<{allow_print:number;allow_print_orders:number;is_active:number}>();
 return !!(row?.allow_print&&row.allow_print_orders&&row.is_active);
}
export async function keepsakeManifest(env:PrintEnv,invite:InvitationAudience,personalCount:number){
 if(!await keepsakeAccess(env,invite))return {enabled:false};
 const defaults=await keepsakeDefault(env,invite.edition_year);if(!defaults)return {enabled:false};
 return {enabled:true,mode:personalCount>=3?'personal':'default',cardCount:personalCount>=3?2:1,defaultRevision:defaults.revision,defaultSrc:`/api/keepsake/default/${defaults.revision}/`};
}
export async function keepsakeDefaultImage(env:PrintEnv,invite:InvitationAudience,revision:string,frame:string){
 if(!await keepsakeAccess(env,invite))throw new PrintProblem(403,'Keepsakes are not enabled for this invitation and scrapbook.');
 const defaults=await keepsakeDefault(env,invite.edition_year),key=defaults?.revision===revision?defaults.frames[frame]:null;
 const file=key&&await env.MEDIA.get(key);if(!file)throw new PrintProblem(404,'Keepsake not found.');
 return new Response(file.body,{headers:{'Content-Type':'image/jpeg'}});
}
