import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {addressVerificationCurrent,clearExpiredAddressVerifications} from '../src/address-state.ts';
import {cleanPrintInvitations} from '../src/printing.ts';

test('Google address verification requires admin review, respects quotas, and never enables printing',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true}),issuer='https://address-test.cloudflareaccess.com';
 const jwk={...await exportJWK(publicKey),kid:'address',alg:'RS256',use:'sig'};
 const input={line1:'123 Example Lane',line2:'Unit 2',city:'Portland',state:'OR',postalCode:'97201',country:'US'};
 const expected={...input,line1:'123 EXAMPLE LN',line2:'UNIT 2',city:'PORTLAND',postalCode:'97201-1234'};
 const valid=()=>({result:{verdict:{addressComplete:true,validationGranularity:'SUB_PREMISE'},uspsData:{dpvConfirmation:'Y'},address:{postalAddress:{regionCode:'US',administrativeArea:'OR',locality:'PORTLAND',postalCode:'97201-1234',addressLines:['123 EXAMPLE LN','UNIT 2']}}}});
 let reply:unknown=valid(),upstreamStatus=200,calls=0,lastBody:any,placesCalls=0,placesMask='',placesCountry='US';
 const outbound=async(request:Request)=>{
  if(request.url===issuer+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});
  if(request.url.startsWith('https://places.googleapis.com/v1/')){
   placesCalls++;placesMask=request.headers.get('X-Goog-FieldMask')||'';assert.equal(request.headers.get('X-Goog-Api-Key'),'not-a-real-google-key');
   if(request.url.endsWith('places:autocomplete')){const body=await request.json() as any;assert.deepEqual(body.includedRegionCodes,['us']);assert.equal(body.includeQueryPredictions,false);return Response.json({suggestions:[{placePrediction:{placeId:'test-place',text:{text:'123 Example Lane, Portland, OR, USA'}}},{queryPrediction:{text:{text:'Must not be returned'}}}]});}
   assert.match(request.url,/^https:\/\/places.googleapis.com\/v1\/places\/test-place\?sessionToken=/);assert.equal(placesMask,'id,addressComponents');
   return Response.json({addressComponents:[['123','123','street_number'],['Example Lane','Example Ln','route'],['Portland','Portland','locality'],['Oregon','OR','administrative_area_level_1'],['97201','97201','postal_code'],['United States',placesCountry,'country']].map(([longText,shortText,type])=>({longText,shortText,types:[type]}))});
  }
  assert.equal(request.url,'https://addressvalidation.googleapis.com/v1:validateAddress' ,'No mailing, SMS, or other external requests');
  assert.equal(request.headers.get('X-Goog-Api-Key'),'not-a-real-google-key');lastBody=await request.json();calls++;
  return Response.json(reply,{status:upstreamStatus});
 };
 const bindings={ADMIN_EMAIL:'owner@example.com',ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:'address',JOURNAL_ORIGIN:'https://guest.test',ADDRESS_VERIFICATION_PROVIDER:'google',ADDRESS_VALIDATION_DAILY_LIMIT:'2',ADDRESS_VALIDATION_MONTHLY_LIMIT:'3',GOOGLE_PLACES_ENABLED:'true',ADDRESS_AUTOCOMPLETE_DAILY_LIMIT:'3',ADDRESS_AUTOCOMPLETE_MONTHLY_LIMIT:'5'};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:'admin',routes:['admin.test/*'],modules:true,compatibilityDate:'2026-08-06',scriptPath:'.wrangler/admin-test-bundle/index.js',d1Databases:{DB:'address-test'},r2Buckets:{MEDIA:'address-test'},outboundService:outbound,bindings:{...bindings,GOOGLE_ADDRESS_VALIDATION_API_KEY:'not-a-real-google-key'}},
  {name:'disabled',routes:['disabled.test/*'],modules:true,compatibilityDate:'2026-08-06',scriptPath:'.wrangler/admin-test-bundle/index.js',d1Databases:{DB:'address-test'},r2Buckets:{MEDIA:'address-test'},outboundService:outbound,bindings}
 ]}));
 const jwt=await new SignJWT({email:'owner@example.com'}).setProtectedHeader({alg:'RS256',kid:'address'}).setSubject('owner').setIssuedAt().setIssuer(issuer).setAudience('address').setExpirationTime('1h').sign(privateKey);
 try{
  const db=await mf.getD1Database('DB','admin');
  for(const name of ['0001_invites.sql','0002_editor.sql','0003_scrapbooks.sql','0004_people.sql'])await db.exec((await readFile('migrations/'+name,'utf8')).replace(/\n/g,' '));
  for(const name of ['0005_shared_invitations.sql','0006_photo_renditions_downloads.sql','0007_photo_uploads.sql','0008_media_library.sql','0009_invitation_sharing.sql','0010_print_orders.sql','0011_print_allowance_resets.sql','0012_google_address_verification.sql','0013_unpublish.sql']){
   const sql=await readFile('migrations/'+name,'utf8');if(name.startsWith('0006')||name.startsWith('0007'))await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));else await db.batch(sql.split('--> statement-breakpoint').map(part=>db.prepare(part)));
  }
  await db.prepare("INSERT INTO people(id,name,phone) VALUES('contact','Test Recipient','+15555550100'),('other','Another Recipient',NULL)").run();
  async function reset(){
   calls=0;reply=valid();upstreamStatus=200;placesCalls=0;placesCountry='US';
   await db.batch([db.prepare('DELETE FROM address_verification_challenges'),db.prepare('DELETE FROM address_verification_usage'),db.prepare("UPDATE people SET mailing_address=NULL,address_verified=0,address_verifier=NULL,address_verified_at=NULL,address_verified_until=NULL,address_verification_key=NULL,version=1")]);
  }
  async function request(path:string,data?:unknown,options:{auth?:boolean;origin?:string;host?:string}={}){
   const host=options.host||'admin.test';return mf.dispatchFetch('http://'+host+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:options.origin||'http://'+host,'Content-Type':'application/json',...(options.auth===false?{}:{'Cf-Access-Jwt-Assertion':jwt})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  }
  const verify=(id='contact')=>request(`contacts/${id}/address/verify`,{version:1,address:input});
  const approve=(suggestion:any,extra={})=>request('contacts/contact/address',{version:1,verify:true,verificationId:suggestion.verificationId,...extra});
  const person=()=>db.prepare("SELECT * FROM people WHERE id='contact'").first<any>();
  await t.test('authentication and CSRF protect settings and Google calls',async()=>{
   await reset();assert.equal((await request('address-verification/settings',undefined,{auth:false})).status,401);
   assert.equal((await request('contacts/contact/address/verify',{version:1,address:input},{origin:'https://wrong.test'})).status,403);
   assert.equal(calls,0);
  });
  await t.test('a suggestion does not change the contact until reviewed and approved',async()=>{
   await reset();const suggestion=await (await verify()).json() as any;
   assert.deepEqual(suggestion.address,expected);assert.equal(suggestion.simulated,false);assert.equal((await person()).mailing_address,null);
   assert.equal(lastBody.enableUspsCass,true);assert.deepEqual(lastBody.address.addressLines,[input.line1,input.line2]);assert.equal('name' in lastBody,false);assert.equal('phone' in lastBody,false);
   const saved=await approve(suggestion,{address:{...input,line1:'Client tampering is ignored'}});assert.equal(saved.status,200);const p=(await saved.json() as any).person;
   assert.deepEqual(JSON.parse(p.mailing_address),expected);assert.equal(p.address_verifier,'google');assert.ok(addressVerificationCurrent(p));assert.equal(p.address_verified_until-p.address_verified_at,28*86400);
   assert.equal((await db.prepare('SELECT count(*) n FROM address_verification_challenges').first<any>()).n,0);assert.equal((await approve(suggestion)).status,409);
   assert.equal((await db.prepare('SELECT allow_print_orders FROM editions WHERE year=2026').first<any>()).allow_print_orders,0);
   assert.equal((await request('editions/2026/print-settings',{allowPrintOrders:true})).status,503);
  });
  await t.test('approval is bound to the contact, version, and expiry',async()=>{
   await reset();const suggestion=await (await verify()).json() as any;
   assert.equal((await request('contacts/other/address',{version:1,verify:true,verificationId:suggestion.verificationId})).status,409);
   await db.prepare("UPDATE people SET version=2 WHERE id='contact'").run();assert.equal((await approve(suggestion)).status,409);assert.equal((await approve(suggestion,{version:2})).status,409);assert.equal((await person()).mailing_address,null);
   await reset();const expired=await (await verify()).json() as any;await db.prepare('UPDATE address_verification_challenges SET expires_at=0').run();assert.equal((await approve(expired)).status,409);
  });
  await t.test('unverified saves and address edits invalidate verification without a Google call',async()=>{
   await reset();const suggestion=await (await verify()).json() as any;const p=(await (await approve(suggestion)).json() as any).person;
   const saved=await request('contacts/contact/address',{version:p.version,verify:false,address:input});assert.equal(saved.status,200);const changed=(await saved.json() as any).person;assert.equal(changed.address_verified,0);assert.equal(changed.address_verified_until,null);assert.equal(changed.address_verification_key,null);assert.equal(calls,1);
   assert.equal((await request('contacts/contact/address',{version:changed.version,verify:true,address:input})).status,400);
  });
  await t.test('clearing an address requires authorization and current version, and removes verification and pending approvals',async()=>{
   await reset();const suggestion=await (await verify()).json() as any;const saved=(await (await approve(suggestion)).json() as any).person;
   await db.prepare("INSERT INTO address_verification_challenges(id,person_id,person_version,address_json,provider,created_at,expires_at) VALUES('pending','contact',?1,?2,'google',unixepoch(),unixepoch()+900)").bind(saved.version,JSON.stringify(expected)).run();
   const clear=(version=saved.version,options={})=>request('contacts/contact/address/clear',{version},options);
   assert.equal((await clear(saved.version,{auth:false})).status,401);
   assert.equal((await clear(saved.version,{origin:'https://wrong.test'})).status,403);
   assert.equal((await clear(saved.version-1)).status,409);
   assert.equal((await person()).mailing_address,saved.mailing_address);
   const response=await clear();assert.equal(response.status,200);const cleared=(await response.json() as any).person;
   assert.equal(cleared.mailing_address,null);assert.equal(cleared.address_verified,0);
   for(const key of ['address_verifier','address_verified_at','address_verified_until','address_verification_key'])assert.equal(cleared[key],null);
   assert.equal(cleared.version,saved.version+1);assert.equal(cleared.name,saved.name);assert.equal(cleared.phone,saved.phone);
   assert.equal((await db.prepare('SELECT count(*) n FROM address_verification_challenges').first<any>()).n,0);
   assert.equal((await db.prepare("SELECT version FROM people WHERE id='other'").first<any>()).version,1);
   assert.equal(calls,1,'Clearing must not contact Google');
   assert.equal((await request('contacts/contact/address',{version:cleared.version,verify:true,verificationId:'pending'})).status,409);
   assert.equal((await clear()).status,409);
   assert.equal((await request('contacts/contact/address/clear',{version:cleared.version},{host:'disabled.test'})).status,200,'Clearing works without a configured provider');
  });
  await t.test('missing unit and incomplete or unconfirmed results cannot be approved',async()=>{
   for(const mutate of [(r:any)=>r.result.uspsData.dpvConfirmation='D',(r:any)=>r.result.uspsData.dpvConfirmation='S',(r:any)=>r.result.verdict.addressComplete=false,(r:any)=>r.result.verdict.hasUnconfirmedComponents=true,(r:any)=>r.result.uspsData.dpvVacant='Y',(r:any)=>r.result.address.postalAddress.regionCode='CA']){
    await reset();reply=valid();mutate(reply);assert.equal((await verify()).status,422);assert.equal((await person()).address_verified,0);assert.equal((await person()).mailing_address,null);assert.equal((await db.prepare('SELECT count(*) n FROM address_verification_challenges').first<any>()).n,0);
   }
  });
  await t.test('provider failures do not leak upstream bodies or change the contact',async()=>{
   await reset();reply={error:{message:'secret upstream detail'}};upstreamStatus=403;const r=await verify();assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret upstream detail/);assert.equal((await person()).mailing_address,null);
   assert.equal((await db.prepare('SELECT sum(requests) n FROM address_verification_usage').first<any>()).n,1);
  });
  await t.test('atomic daily cap stops concurrent requests before Google',async()=>{
   await reset();const results=await Promise.all(Array.from({length:5},()=>verify()));assert.equal(results.filter(r=>r.status===200).length,2);assert.equal(results.filter(r=>r.status===429).length,3);assert.equal(calls,2);
  });
  await t.test('monthly cap includes earlier days and reports bounded usage',async()=>{
   await reset();const month=new Date().toISOString().slice(0,7);await db.prepare("INSERT INTO address_verification_usage(provider,day,month,requests) VALUES('google',?1,?2,2)").bind(month+'-00',month).run();
   assert.equal((await verify()).status,200);assert.equal((await verify()).status,429);assert.equal(calls,1);const settings=await (await request('address-verification/settings')).json() as any;assert.deepEqual(settings.usage,{today:1,month:3});
  });
  await t.test('autocomplete uses US predictions and address-only details without verifying or storing them',async()=>{
   await reset();const sessionToken=crypto.randomUUID(),base={version:1,sessionToken};
   const short=await request('contacts/contact/address/autocomplete',{...base,input:'12'});assert.deepEqual((await short.json() as any).suggestions,[]);assert.equal(placesCalls,0);
   const search=await request('contacts/contact/address/autocomplete',{...base,input:'123 Example'});assert.equal(search.status,200);const result=await search.json() as any;assert.equal(result.suggestions.length,1);assert.equal(result.suggestions[0].placeId,'test-place');
   assert.equal(placesMask,'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');
   const selected=await request('contacts/contact/address/place',{...base,placeId:'test-place'});assert.equal(selected.status,200);assert.deepEqual((await selected.json() as any).address,{...input,line2:''});
   assert.equal((await person()).mailing_address,null);assert.equal((await person()).address_verified,0);assert.equal(calls,0);assert.equal(placesCalls,2);
  });
  await t.test('autocomplete rejects unsafe IDs, non-US details, and stops at its own quota',async()=>{
   await reset();const base={version:1,sessionToken:crypto.randomUUID()};
   assert.equal((await request('contacts/contact/address/place',{...base,placeId:'../../private'})).status,400);assert.equal(placesCalls,0);
   placesCountry='CA';assert.equal((await request('contacts/contact/address/place',{...base,placeId:'test-place'})).status,422);
   const responses=await Promise.all(Array.from({length:4},()=>request('contacts/contact/address/autocomplete',{...base,input:'123 Example'})));assert.equal(responses.filter(r=>r.status===200).length,2);assert.equal(responses.filter(r=>r.status===429).length,2);assert.equal(placesCalls,3);
   assert.equal((await verify()).status,200,'Autocomplete cannot consume the separate validation allowance');
  });
  await t.test('missing key fails closed without a provider request',async()=>{
   await reset();const settings=await (await request('address-verification/settings',undefined,{host:'disabled.test'})).json() as any;assert.equal(settings.mode,'disabled');assert.equal((await request('contacts/contact/address/verify',{version:1,address:input},{host:'disabled.test'})).status,503);assert.equal(calls,0);
  });
  await t.test('expiry blocks print permission and sweeps Google metadata while retaining the confirmed address',async()=>{
   await reset();const suggestion=await (await verify()).json() as any;const p=(await (await approve(suggestion)).json() as any).person;
   await db.prepare("INSERT OR IGNORE INTO invites(id,person_id,token_hash,name,phone,expires_at,member_ids) VALUES('invite','contact','test-hash','Test Recipient','+15555550100',?1,'[\"contact\"]')").bind(Math.floor(Date.now()/1000)+86400).run();
   const draft:any={photos:['one','two','three'].map(id=>({id,recipients:['contact']})),printInvitations:['invite'],printAddressKeys:{invite:p.address_verification_key}};
   assert.deepEqual((await cleanPrintInvitations(draft,db as any,2026)).printInvitations,['invite']);
   assert.equal(addressVerificationCurrent(p,p.address_verified_until),false);await db.prepare("UPDATE people SET address_verified_until=0 WHERE id='contact'").run();assert.deepEqual((await cleanPrintInvitations(draft,db as any,2026)).printInvitations,[]);
   await clearExpiredAddressVerifications(db as any);const expired=await person();assert.equal(expired.address_verified,0);assert.equal(expired.address_verification_key,null);assert.equal(expired.address_verifier,null);assert.deepEqual(JSON.parse(expired.mailing_address),expected);
  });
 }finally{await mf.dispose();}
});
