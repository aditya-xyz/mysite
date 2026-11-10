import {validToken} from '../../src/security.ts';
export interface LinkConfig { JOURNAL_ORIGIN:string; SOCIAL_JOURNAL_ORIGIN?:string; INVITATION_LINK_KEY?:string }
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const base64=(value:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(value)));
async function key(secret:string){
 if(!/^[a-f0-9]{64}$/i.test(secret))throw new Error('Invitation link storage is not configured.');
 return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g)!,s=>parseInt(s,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function sealLink(raw:string,secret:string|undefined,id:string,year:number){
 if(!secret)return null;
 const iv=crypto.getRandomValues(new Uint8Array(12)),additionalData=new TextEncoder().encode(`${year}/${id}`);
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},await key(secret),new TextEncoder().encode(raw));
 return `v1.${base64(iv)}.${base64(encrypted)}`;
}
export async function unsealLink(value:string,secret:string|undefined,id:string,year:number){
 if(!secret)throw new Error('Invitation link storage is not configured.');
 const [version,iv,ciphertext]=value.split('.');if(version!=='v1'||!iv||!ciphertext)throw new Error('Invalid stored invitation.');
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:new TextEncoder().encode(`${year}/${id}`)},await key(secret),bytes(ciphertext));
 const raw=new TextDecoder().decode(clear);if(!validToken(raw))throw new Error('Invalid stored invitation.');return raw;
}
export function invitationUrl(env:LinkConfig,raw:string,shareSocials:boolean){
 const origin=shareSocials?(env.SOCIAL_JOURNAL_ORIGIN||env.JOURNAL_ORIGIN):env.JOURNAL_ORIGIN;
 return new URL(origin).origin+'/#'+raw;
}
