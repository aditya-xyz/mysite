import {localPrintProvider,mailingAddress,PrintProblem,type PrintEnv,type MailingAddress} from '../../src/printing.ts';
import {clearExpiredAddressVerifications} from '../../src/address-state.ts';
import {now,token} from '../../src/security.ts';

export interface AddressEnv extends PrintEnv {
 ADDRESS_VERIFICATION_PROVIDER?:string;
 GOOGLE_ADDRESS_VALIDATION_API_KEY?:string;
 ADDRESS_VALIDATION_DAILY_LIMIT?:string;
 ADDRESS_VALIDATION_MONTHLY_LIMIT?:string;
 GOOGLE_PLACES_API_KEY?:string;
 GOOGLE_PLACES_ENABLED?:string;
 ADDRESS_AUTOCOMPLETE_DAILY_LIMIT?:string;
 ADDRESS_AUTOCOMPLETE_MONTHLY_LIMIT?:string;
}
export function addressMode(request:Request,env:AddressEnv){
 if(env.ADDRESS_VERIFICATION_PROVIDER==='google'&&env.GOOGLE_ADDRESS_VALIDATION_API_KEY?.trim())return 'google';
 if((env.ADDRESS_VERIFICATION_PROVIDER==='local_mock'&&localPrintProvider(request,{...env,PRINT_PROVIDER:'local_mock'}))||(!env.ADDRESS_VERIFICATION_PROVIDER&&localPrintProvider(request,env)))return 'local_mock';
 return 'disabled';
}
function cap(value:string|undefined,fallback:number){
 if(value===undefined||value==='')return fallback;
 const n=Number(value);if(!Number.isInteger(n)||n<0||n>5000)throw new PrintProblem(503,'Address verification limits need configuration.');return n;
}
export function limits(env:AddressEnv,provider='google'){return provider==='google_places'?{daily:cap(env.ADDRESS_AUTOCOMPLETE_DAILY_LIMIT,200),monthly:cap(env.ADDRESS_AUTOCOMPLETE_MONTHLY_LIMIT,2000)}:{daily:cap(env.ADDRESS_VALIDATION_DAILY_LIMIT,50),monthly:cap(env.ADDRESS_VALIDATION_MONTHLY_LIMIT,1000)};}
export function autocompleteAvailable(request:Request,env:AddressEnv){return addressMode(request,env)==='local_mock'||env.GOOGLE_PLACES_ENABLED==='true'&&!!(env.GOOGLE_PLACES_API_KEY||env.GOOGLE_ADDRESS_VALIDATION_API_KEY);}
export async function reserveGoogleRequest(env:AddressEnv,provider:'google'|'google_places'='google'){
 const date=new Date().toISOString(),day=date.slice(0,10),month=date.slice(0,7),budget=limits(env,provider);
 if(!budget.daily||!budget.monthly)throw new PrintProblem(429,'Address verification is paused by its usage limit.');
 const reserved=await env.DB.prepare(`INSERT INTO address_verification_usage(provider,day,month,requests)
 SELECT ?5,?1,?2,1 WHERE coalesce((SELECT sum(requests) FROM address_verification_usage WHERE provider=?5 AND month=?2),0)<?4
 ON CONFLICT(provider,day) DO UPDATE SET requests=requests+1
 WHERE requests<?3 AND (SELECT sum(requests) FROM address_verification_usage WHERE provider=?5 AND month=?2)<?4 RETURNING requests`)
 .bind(day,month,budget.daily,budget.monthly,provider).first();
 if(!reserved)throw new PrintProblem(429,'Address verification has reached its daily or monthly limit. Try later; your contact is unchanged.');
}
export function googleMailingAddress(response:unknown):MailingAddress {
 const result=(response as any)?.result,v=result?.verdict,usps=result?.uspsData,p=result?.address?.postalAddress;
 if(!v||v.addressComplete!==true||!['PREMISE','SUB_PREMISE'].includes(v.validationGranularity)||v.hasUnconfirmedComponents===true||['FIX','CONFIRM_ADD_SUBPREMISES'].includes(v.possibleNextAction)||usps?.dpvConfirmation!=='Y'||usps?.dpvVacant==='Y'||usps?.dpvNoStat==='Y')throw new PrintProblem(422,usps?.dpvConfirmation==='D'||usps?.dpvConfirmation==='S'?'Check the apartment or unit number before verifying this address.':'Google could not confirm a complete, deliverable US address. Check the address and try again.');
 if(!p||p.regionCode!=='US'||!Array.isArray(p.addressLines)||p.addressLines.length<1||p.addressLines.length>2)throw new PrintProblem(422,'Google did not return a supported US mailing address.');
 try{return mailingAddress({line1:p.addressLines[0],line2:p.addressLines[1]||'',city:p.locality,state:p.administrativeArea,postalCode:p.postalCode,country:p.regionCode});}
 catch{throw new PrintProblem(422,'Google did not return a complete US mailing address.');}
}
async function verifyGoogle(env:AddressEnv,address:MailingAddress){
 await reserveGoogleRequest(env);
 let response:Response;
 try{response=await fetch('https://addressvalidation.googleapis.com/v1:validateAddress',{
  method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':env.GOOGLE_ADDRESS_VALIDATION_API_KEY!},
  body:JSON.stringify({address:{regionCode:'US',administrativeArea:address.state,locality:address.city,postalCode:address.postalCode,addressLines:[address.line1,address.line2].filter(Boolean)},enableUspsCass:true}),signal:AbortSignal.timeout(10000)
 });}catch{throw new PrintProblem(503,'Google address verification is unavailable. Your contact is unchanged; try again later.');}
 // Never echo upstream bodies: they may include credentials, addresses, or quota details.
 if(!response.ok)throw new PrintProblem(response.status===429?429:503,response.status===429?'Google address verification quota was reached. Your contact is unchanged.':'Google address verification is unavailable or needs configuration. Your contact is unchanged.');
 let result:unknown;try{result=await response.json();}catch{throw new PrintProblem(503,'Google returned an unreadable verification result. Your contact is unchanged.');}
 return googleMailingAddress(result);
}
async function persistAddress(env:AddressEnv,id:string,version:number,address:MailingAddress,verification?:{provider:string;at:number}){
 const encoded=JSON.stringify(address);
 let person=await env.DB.prepare('UPDATE people SET mailing_address=?1,address_verified=0,address_verified_at=NULL,address_verified_until=NULL,address_verifier=NULL,address_verification_key=NULL,version=version+1,updated_at=unixepoch() WHERE id=?2 AND version=?3 RETURNING *').bind(encoded,id,version).first();
 if(!person)throw new PrintProblem(409,'This person changed in another window. Refresh before saving the address.');
 if(verification){person=await env.DB.prepare('UPDATE people SET address_verified=1,address_verified_at=?1,address_verified_until=?6,address_verifier=?7,address_verification_key=?5,version=version+1 WHERE id=?2 AND version=?3 AND mailing_address=?4 RETURNING *').bind(verification.at,id,version+1,encoded,token(),verification.provider==='google'?verification.at+28*86400:null,verification.provider).first();if(!person)throw new PrintProblem(409,'The contact changed before verification was saved. The address is unverified; verify again.');}
 return person;
}
export async function addressAdminRoute(request:Request,env:AddressEnv,path:string,readBody:()=>Promise<Record<string,unknown>>){
 if(path==='/api/address-verification/settings'&&request.method==='GET'){
  const budget=limits(env),date=new Date().toISOString(),usage=await env.DB.prepare("SELECT coalesce(sum(CASE WHEN day=?1 THEN requests ELSE 0 END),0) AS today,coalesce(sum(requests),0) AS month FROM address_verification_usage WHERE provider='google' AND month=?2").bind(date.slice(0,10),date.slice(0,7)).first();
  return Response.json({mode:addressMode(request,env),limits:budget,usage,autocompleteAvailable:autocompleteAvailable(request,env),autocompleteLimits:limits(env,'google_places')});
 }
 const route=/^\/api\/contacts\/([a-z0-9-]{1,100})\/address(\/verify|\/clear)?$/.exec(path);
 if(!route||request.method!=='POST')return null;
 await clearExpiredAddressVerifications(env.DB);
 const data=await readBody(),id=route[1];
 if(!Number.isInteger(data.version))throw new PrintProblem(400,'Check the person version.');
 const person=await env.DB.prepare('SELECT * FROM people WHERE id=?1 AND version=?2').bind(id,data.version as number).first();
 if(!person)throw new PrintProblem(409,'This person changed in another window. Refresh before saving the address.');
 if(route[2]==='/clear'){
  const [updated]=await env.DB.batch([
   env.DB.prepare('UPDATE people SET mailing_address=NULL,address_verified=0,address_verified_at=NULL,address_verified_until=NULL,address_verifier=NULL,address_verification_key=NULL,version=version+1,updated_at=unixepoch() WHERE id=?1 AND version=?2 RETURNING *').bind(id,data.version as number),
   env.DB.prepare('DELETE FROM address_verification_challenges WHERE person_id=?1 AND person_version<=?2 AND EXISTS(SELECT 1 FROM people WHERE id=?1 AND version=?2+1 AND mailing_address IS NULL)').bind(id,data.version as number)
  ]);
  if(!updated.results.length)throw new PrintProblem(409,'This person changed in another window. Refresh before deleting the address.');
  return Response.json({person:updated.results[0],simulated:false});
 }
 const mode=addressMode(request,env);
 if(route[2]){
  if(mode==='disabled')throw new PrintProblem(503,'Address validation is not configured. You can save an unverified address.');
  const original=mailingAddress(data.address),address=mode==='google'?await verifyGoogle(env,original):{...original,line1:original.line1.toUpperCase(),line2:original.line2.toUpperCase(),city:original.city.toUpperCase()};
  const at=now(),verificationId=token();
  await env.DB.prepare('INSERT INTO address_verification_challenges(id,person_id,person_version,address_json,provider,created_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(verificationId,id,data.version as number,JSON.stringify(address),mode,at,at+900).run();
  return Response.json({verificationId,address,simulated:mode==='local_mock',expiresAt:at+900});
 }
 if(typeof data.verify!=='boolean')throw new PrintProblem(400,'Choose whether to verify the address.');
 if(!data.verify)return Response.json({person:await persistAddress(env,id,data.version as number,mailingAddress(data.address)),simulated:false});
 if(typeof data.verificationId==='string'){
  const challenge=await env.DB.prepare('DELETE FROM address_verification_challenges WHERE id=?1 AND person_id=?2 AND person_version=?3 AND expires_at>?4 AND provider=?5 RETURNING *').bind(data.verificationId,id,data.version as number,now(),mode).first<{address_json:string;provider:string;created_at:number}>();
  if(!challenge)throw new PrintProblem(409,'The address suggestion expired or was already used. Verify the address again.');
  return Response.json({person:await persistAddress(env,id,data.version as number,mailingAddress(JSON.parse(challenge.address_json)),{provider:challenge.provider,at:challenge.created_at}),simulated:challenge.provider==='local_mock'});
 }
 // Compatibility for the original loopback-only fixture. Real Google verification
 // always requires a one-use, contact/version-bound suggestion approval.
 if(mode!=='local_mock')throw new PrintProblem(400,'Verify and review the suggested address before saving it as verified.');
 const address=mailingAddress(data.address);for(const key of ['line1','line2','city'] as const)address[key]=address[key].toUpperCase();
 if(person.mailing_address===JSON.stringify(address)&&person.address_verified===1&&person.address_verifier==='local_mock')return Response.json({person,simulated:true});
 return Response.json({person:await persistAddress(env,id,data.version as number,address,{provider:'local_mock',at:now()}),simulated:true});
}
