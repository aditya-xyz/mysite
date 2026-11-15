import {addressMode,verifyGoogle,type AddressEnv} from './address-verification.ts';
import {mailingAddress,PrintProblem} from '../../src/printing.ts';
import {now,token,digest} from '../../src/security.ts';

function draftKey(value:unknown){
 if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(value))throw new PrintProblem(400,'Reopen Add a person and try again.');
 return value;
}
export async function verifyNewContactAddress(request:Request,env:AddressEnv,actor:string,data:Record<string,unknown>){
 const key=draftKey(data.draftKey),mode=addressMode(request,env),original=mailingAddress(data.address);
 if(original.country==='IN')throw new PrintProblem(409,'India addresses are entered manually in admin. Save without checking.');
 if(mode==='disabled')throw new PrintProblem(503,'Google verification is unavailable. You can save without checking.');
 const address=mode==='google'?await verifyGoogle(env,original):{...original,line1:original.line1.toUpperCase(),city:original.city.toUpperCase()};
 const id=token(),at=now();
 await env.DB.batch([
  env.DB.prepare('DELETE FROM contact_address_checks WHERE expires_at<=?1 OR (draft_key=?2 AND actor=?3)').bind(at,key,actor),
  env.DB.prepare('INSERT INTO contact_address_checks VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(id,key,actor,JSON.stringify(address),mode,at,at+900)
 ]);
 return Response.json({verificationId:id,address,simulated:mode==='local_mock',expiresAt:at+900});
}

export async function createContact(request:Request,env:AddressEnv,actor:string,data:Record<string,unknown>){
 const key=draftKey(data.draftKey);
 if(typeof data.name!=='string'||!data.name.trim()||data.name.length>100)throw new PrintProblem(400,'Check the person’s name.');
 const name=data.name.trim(),phone=typeof data.phone==='string'?data.phone.trim()||null:null;
 if((data.phone!=null&&typeof data.phone!=='string')||(phone&&!/^\+[1-9]\d{7,14}$/.test(phone)))throw new PrintProblem(400,'Use a full phone number including country code.');
 if(typeof data.verify!=='boolean')throw new PrintProblem(400,'Choose whether to verify the address.');
 const verified=data.verify;
 if(verified&&typeof data.verificationId!=='string')throw new PrintProblem(400,'Check and review the address before saving it as verified.');
 const hash=await digest(JSON.stringify({name,phone,verify:verified,address:verified?data.verificationId:data.address??null}));
 async function reused(){
  const receipt=await env.DB.prepare('SELECT actor,request_hash,person_id FROM contact_create_requests WHERE draft_key=?1').bind(key).first<{actor:string;request_hash:string;person_id:string}>();
  if(!receipt)return null;
  if(receipt.actor!==actor||receipt.request_hash!==hash)throw new PrintProblem(409,'This person was already saved. Close this form and edit them in People.');
  return env.DB.prepare('SELECT * FROM people WHERE id=?1').bind(receipt.person_id).first();
 }
 const previous=await reused();if(previous)return Response.json({person:previous,reused:true});
 let address=data.address==null?null:mailingAddress(data.address),provider:string|null=null,at:number|null=null;
 if(verified){
  const check=await env.DB.prepare('SELECT address_json,provider,created_at FROM contact_address_checks WHERE id=?1 AND draft_key=?2 AND actor=?3 AND expires_at>?4 AND provider=?5')
   .bind(data.verificationId,key,actor,now(),addressMode(request,env)).first<{address_json:string;provider:string;created_at:number}>();
  if(!check)throw new PrintProblem(409,'The address recommendation expired or changed. Check and review the address again.');
  address=mailingAddress(JSON.parse(check.address_json));if(address.country==='IN')throw new PrintProblem(409,'Save the India address manually without checking.');provider=check.provider;at=check.created_at;
 }
 if(!verified&&address?.country==='IN'){provider='admin';at=now();}
 const confirmed=verified||provider==='admin';
 const id='contact-'+(await digest(key)).slice(0,24),encoded=address?JSON.stringify(address):null;
 const values=[id,name,phone,encoded,confirmed?1:0,at,provider,confirmed?token():null,provider==='google'&&at!==null?at+28*86400:null];
 const insert=`INSERT INTO people(id,name,phone,mailing_address,address_verified,address_verified_at,address_verifier,address_verification_key,address_verified_until)
  SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 ${verified?'FROM contact_address_checks WHERE id=?10 AND draft_key=?11 AND actor=?12 AND expires_at>unixepoch()':''} RETURNING *`;
 try{
  const results=await env.DB.batch([
   env.DB.prepare(insert).bind(...values,...(verified?[data.verificationId,key,actor]:[])),
   env.DB.prepare('INSERT INTO contact_create_requests SELECT ?1,?2,?3,?4 WHERE EXISTS(SELECT 1 FROM people WHERE id=?4)').bind(key,actor,hash,id),
   env.DB.prepare('DELETE FROM contact_address_checks WHERE draft_key=?1 AND actor=?2 AND EXISTS(SELECT 1 FROM people WHERE id=?3)').bind(key,actor,id),
   env.DB.prepare("INSERT INTO admin_events(actor,action,target) SELECT ?1,'create-contact',?2 WHERE EXISTS(SELECT 1 FROM people WHERE id=?2)").bind(actor,id)
  ]);
  if(!results[0].results.length)throw new PrintProblem(409,'The address recommendation expired. Check it again.');
  return Response.json({person:results[0].results[0]},{status:201});
 }catch(error){
  if(error instanceof Error&&error.message.includes('UNIQUE constraint failed')){
   const person=await reused();if(person)return Response.json({person,reused:true});
   throw new PrintProblem(409,'That phone number is already in People. Search for the existing person.');
  }
  throw error;
 }
}
