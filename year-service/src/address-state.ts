export interface AddressState {
 address_verified?:unknown; address_verifier?:unknown;
 address_verified_at?:unknown; address_verified_until?:unknown;
}
// Google verification metadata has a short lifetime. The confirmed contact
// address itself is owned/confirmed by the admin, not a cached provider response.
export function addressVerificationCurrent(person:AddressState|null|undefined,at=Math.floor(Date.now()/1000)) {
 if(!person?.address_verified)return false;
 if(person.address_verifier==='local_mock')return true;
 return person.address_verifier==='google'&&typeof person.address_verified_at==='number'&&
  typeof person.address_verified_until==='number'&&person.address_verified_at<=at&&
  person.address_verified_until>at&&at<person.address_verified_at+28*86400;
}
export async function clearExpiredAddressVerifications(db:D1Database,at=Math.floor(Date.now()/1000)) {
 await db.batch([
  db.prepare('DELETE FROM address_verification_challenges WHERE expires_at<=?1').bind(at),
  db.prepare("UPDATE people SET address_verified=0,address_verified_at=NULL,address_verified_until=NULL,address_verifier=NULL,address_verification_key=NULL WHERE address_verifier='google' AND (address_verified_until IS NULL OR address_verified_until<=?1)").bind(at)
 ]);
}
