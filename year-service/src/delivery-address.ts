import {addressAdminRoute,addressMode,autocompleteAvailable,type AddressEnv} from '../admin/src/address-verification.ts';
import {addressAutocompleteRoute} from '../admin/src/address-autocomplete.ts';
import {addressVerificationCurrent,type AddressState} from './address-state.ts';
import {mailingAddress,PrintProblem,type MailingAddress} from './printing.ts';
import type {InvitationAudience} from './invitations.ts';
interface Contact extends AddressState {id:string;name:string;version:number;mailing_address:string|null;address_verification_key:string|null}
export async function deliveryContact(env:AddressEnv,invite:InvitationAudience){
 const person=invite.person_id?await env.DB.prepare('SELECT id,name,version,mailing_address,address_verified,address_verifier,address_verified_at,address_verified_until,address_verification_key FROM people WHERE id=?1').bind(invite.person_id).first<Contact>():null;
 if(!person)throw new PrintProblem(409,'Ask dad to set a verification contact for this invitation.');
 return person;
}
export function verifiedDelivery(person:Contact){
 if(!addressVerificationCurrent(person)||!person.mailing_address)return null;
 try{return mailingAddress(JSON.parse(person.mailing_address));}catch{return null;}
}
export async function deliveryState(request:Request,env:AddressEnv,invite:InvitationAudience){
 const person=await deliveryContact(env,invite),mode=addressMode(request,env);
 const address=verifiedDelivery(person);
 // Test verification is valid only inside the explicit local preview, never production.
 const verified=!!address&&!!person.address_verification_key&&(person.address_verifier==='google'||mode==='local_mock');
 return {verified,recipientName:person.name,version:person.version,address:verified?address:null,mode,autocompleteAvailable:autocompleteAvailable(request,env)};
}
export async function confirmDelivery(request:Request,env:AddressEnv,invite:InvitationAudience,version:unknown){
 const person=await deliveryContact(env,invite),state=await deliveryState(request,env,invite);
 if(!Number.isInteger(version)||version!==person.version)throw new PrintProblem(409,'The saved address changed. Reopen the address step.');
 if(!state.verified||!state.address)throw new PrintProblem(409,'Verify and save your US mailing address first.');
 // Accepting the current verified address renews this invitation's address binding,
 // without granting print permission or changing anybody else's invitation.
 const result=await env.DB.prepare(`UPDATE invites SET print_address_key=CASE WHEN allow_print=1 THEN ?1 ELSE print_address_key END
 WHERE id=?2 AND person_id=?3 AND version=?4 AND EXISTS(SELECT 1 FROM people WHERE id=?3 AND version=?5) RETURNING id`).bind(person.address_verification_key,invite.id,person.id,(invite as InvitationAudience&{version:number}).version,person.version).first();
 if(!result)throw new PrintProblem(409,'The invitation or address changed. Reopen the address step.');
 return {person,address:state.address as MailingAddress};
}
export async function deliveryAddressRoute(request:Request,env:AddressEnv,invite:InvitationAudience,path:string,readBody:()=>Promise<Record<string,unknown>>){
 if(path==='/api/delivery-address'&&request.method==='GET')return Response.json(await deliveryState(request,env,invite));
 const match=/^\/api\/delivery-address\/(autocomplete|place|verify|save|confirm)$/.exec(path);
 if(!match||request.method!=='POST')return null;
 const data=await readBody(),person=await deliveryContact(env,invite),action=match[1];
 if(action==='confirm'){await confirmDelivery(request,env,invite,data.version);return Response.json(await deliveryState(request,env,invite));}
 if((await deliveryState(request,env,invite)).verified)throw new PrintProblem(409,'This invitation already has a verified address. Contact dad if it needs to change.');
 if(data.version!==person.version)throw new PrintProblem(409,'The saved contact changed. Check the address again.');
 if(action==='autocomplete'||action==='place')return addressAutocompleteRoute(request,env,`/api/contacts/${person.id}/address/${action}`,()=>Promise.resolve(data));
 if(action==='save'&&(typeof data.verificationId!=='string'||data.verify!==true))throw new PrintProblem(400,'Verify and review the suggested address before saving it.');
 const response=await addressAdminRoute(request,env,`/api/contacts/${person.id}/address${action==='verify'?'/verify':''}`,()=>Promise.resolve(data));
 if(action==='verify')return response;
 if(!response?.ok)throw new PrintProblem(503,'The verified address could not be saved.');
 // Return only the invitation's shipping address, never the full People record.
 await env.DB.prepare("INSERT INTO admin_events(actor,action,target) VALUES(?1,'guest-verified-address',?2)").bind('invitation:'+invite.id,person.id).run();
 return Response.json(await deliveryState(request,env,invite));
}
