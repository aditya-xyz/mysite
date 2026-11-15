import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
// @ts-expect-error Shared browser address presentation.
import {contactAddressFields,contactMailingAddress,mailingLabel,usStates,indianStates} from '../admin/client/contact-address.js';

test('country-specific new-person fields preserve complete mailing addresses',()=>{
 assert.equal(usStates.length,51);assert.equal(indianStates.length,36);
 assert.match(contactAddressFields('US'),/ZIP code/);assert.match(contactAddressFields('IN'),/State or union territory/);
 assert.doesNotMatch(contactAddressFields('NL'),/name="state"/);
 const dutch=contactMailingAddress('NL',{line1:'Voorbeeldstraat',houseNumber:'12',addition:'-2',city:'Amsterdam',postalCode:'1234ab'});
 assert.equal(dutch.line1,'Voorbeeldstraat 12 -2');assert.equal(dutch.postalCode,'1234 AB');assert.equal(dutch.state,'');
 assert.match(mailingLabel(dutch),/1234 AB  Amsterdam/);
 const indian=contactMailingAddress('IN',{line1:'Flat 4, Sample House',line2:'Sample Road',landmark:'Near sample school',district:'Sample district',postOffice:'Sample post office',city:'Pune',state:'Maharashtra',postalCode:'411001'});
 assert.equal(indian.line2,'Sample Road, Near sample school, Sample district, Sample post office');
 assert.throws(()=>contactMailingAddress('NL',{line1:'Street'}),/house number/);
 assert.throws(()=>contactMailingAddress('IN',{line2:'a'.repeat(100),landmark:'b'.repeat(100)}),/too long/);
 assert.match(contactAddressFields('US',{line1:'<script>'}),/&lt;script&gt;/);
});

test('new contacts and optional reviewed addresses save atomically without invitations or SMS',async t=>{
 const issuer='https://new-person.cloudflareaccess.com',aud='new-person',keys=await generateKeyPair('RS256',{extractable:true});
 const jwk={...await exportJWK(keys.publicKey),kid:'new-person',alg:'RS256',use:'sig'};
 let googleCalls=0,googleFailure=false,lastCountry='',placesCalls=0;
 const outbound=async(request:Request)=>{
  if(request.url===issuer+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});
  if(request.url==='https://places.googleapis.com/v1/places:autocomplete'){
   placesCalls++;const input=await request.json() as any;assert.deepEqual(input.includedRegionCodes,['nl']);
   return Response.json({suggestions:[{placePrediction:{placeId:'sample-place',text:{text:'Voorbeeldstraat 12, Amsterdam'}}}]});
  }
  if(request.url.startsWith('https://places.googleapis.com/v1/places/sample-place?')){
   placesCalls++;return Response.json({addressComponents:[['Voorbeeldstraat','Voorbeeldstraat','route'],['12A','12A','street_number'],['Amsterdam','Amsterdam','locality'],['1234 AB','1234 AB','postal_code'],['Netherlands','NL','country']].map(([longText,shortText,type])=>({longText,shortText,types:[type]}))});
  }
  assert.equal(request.url,'https://addressvalidation.googleapis.com/v1:validateAddress','Never send SMS or create a provider order');
  googleCalls++;const body=await request.json() as any,p=body.address;lastCountry=p.regionCode;
  assert.equal(body.enableUspsCass,p.regionCode==='US');
  if(googleFailure)return Response.json({error:'private upstream diagnostic'},{status:503});
  return Response.json({result:{verdict:{addressComplete:true,validationGranularity:'SUB_PREMISE'},uspsData:{dpvConfirmation:'Y'},address:{postalAddress:{...p,addressLines:p.addressLines.map((line:string)=>line.toUpperCase())}}}});
 };
 const common={ADMIN_EMAIL:'owner@example.com',ADMIN_EMAILS:'editor@example.com',ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:aud,JOURNAL_ORIGIN:'http://guest.test',ADDRESS_VERIFICATION_PROVIDER:'google',GOOGLE_ADDRESS_VALIDATION_API_KEY:'synthetic-key',GOOGLE_PLACES_ENABLED:'true',ADDRESS_VALIDATION_DAILY_LIMIT:'100',ADDRESS_VALIDATION_MONTHLY_LIMIT:'200'};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:'admin',routes:['admin.test/*'],modules:true,scriptPath:'.wrangler/admin-test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'new-contacts'},r2Buckets:{MEDIA:'new-contacts'},bindings:common,outboundService:outbound},
  {name:'disabled',routes:['disabled.test/*'],modules:true,scriptPath:'.wrangler/admin-test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'new-contacts'},r2Buckets:{MEDIA:'new-contacts'},bindings:{...common,GOOGLE_ADDRESS_VALIDATION_API_KEY:''},outboundService:outbound}
 ]}));
 const signed=async(email:string)=>new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'new-person'}).setSubject(email).setIssuedAt().setIssuer(issuer).setAudience(aud).setExpirationTime('1h').sign(keys.privateKey);
 const jwt=await signed('owner@example.com'),editor=await signed('editor@example.com');
 const req=(path:string,data:any,host='admin.test',identity=jwt,origin='http://'+host)=>mf.dispatchFetch('http://'+host+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Cf-Access-Jwt-Assertion':identity},body:JSON.stringify(data)});
 const addresses={US:{line1:'123 Example Lane',line2:'Unit 2',city:'Portland',state:'OR',postalCode:'97201',country:'US'},IN:{line1:'Flat 4, Sample House',line2:'Sample Road, Near sample school',city:'Pune',state:'Maharashtra',postalCode:'411001',country:'IN'},NL:{line1:'Voorbeeldstraat 12 -2',line2:'',city:'Amsterdam',state:'',postalCode:'1234 AB',country:'NL'}};
 try{
  const db=await mf.getD1Database('DB','admin');
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
   const sql=await readFile('migrations/'+file,'utf8');
   if(sql.includes('--> statement-breakpoint'))await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s)));
   else await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));
  }
  const count=async()=>Number((await db.prepare('SELECT count(*) n FROM people').first<any>()).n);
  await t.test('no-address creation and network retries are idempotent, even without a phone',async()=>{
   const data={draftKey:crypto.randomUUID(),name:'No address',phone:'',verify:false,address:null},before=await count();
   const responses=await Promise.all([req('contacts',data),req('contacts',data)]);
   assert.ok(responses.every(r=>[200,201].includes(r.status)));assert.equal(await count(),before+1);
   const saved=await responses[0].json() as any;assert.equal(saved.person.mailing_address,null);assert.equal(saved.person.address_verified,0);
   assert.equal((await req('contacts',{...data,name:'Changed'})).status,409);
   assert.equal((await req('contacts',data,'admin.test',editor)).status,409);
   assert.equal(googleCalls,0);
  });
  await t.test('all three countries save without checking while Google is unavailable',async()=>{
   const before=googleCalls;
   for(const [country,address] of Object.entries(addresses)){
    const response=await req('contacts',{draftKey:crypto.randomUUID(),name:'Unchecked '+country,verify:false,address},'disabled.test');
    assert.equal(response.status,201,await response.clone().text());const person=(await response.json() as any).person;
    assert.deepEqual(JSON.parse(person.mailing_address),address);assert.equal(person.address_verified,0);assert.equal(person.address_verifier,null);
   }
   assert.equal(googleCalls,before);
  });
  await t.test('Google review creates no person until accepted; all countries save verified',async()=>{
   for(const [country,address] of Object.entries(addresses)){
    const draftKey=crypto.randomUUID(),before=await count();
    const check=await req('contacts/new/address/verify',{draftKey,address});assert.equal(check.status,200,await check.clone().text());
    assert.equal(await count(),before);assert.equal(lastCountry,country);
    const recommendation=await check.json() as any;
    assert.equal((await req('contacts',{draftKey:crypto.randomUUID(),name:'Wrong draft',verify:true,verificationId:recommendation.verificationId})).status,409);
    assert.equal((await req('contacts',{draftKey,name:'Wrong admin',verify:true,verificationId:recommendation.verificationId},'admin.test',editor)).status,409);
    const data={draftKey,name:'Reviewed '+country,verify:true,verificationId:recommendation.verificationId,address:{...address,line1:'Attempted substitution'}};
    const saved=await req('contacts',data);assert.equal(saved.status,201,await saved.clone().text());
    const person=(await saved.json() as any).person;assert.equal(person.address_verified,1);assert.equal(person.address_verifier,'google');
    assert.deepEqual(JSON.parse(person.mailing_address),recommendation.address);assert.equal(person.address_verified_until,person.address_verified_at+28*86400);
    assert.equal((await req('contacts',data)).status,200);assert.equal(await count(),before+1);
    assert.equal(await db.prepare('SELECT id FROM contact_address_checks WHERE id=?1').bind(recommendation.verificationId).first(),null);
   }
  });
  await t.test('expired recommendations and duplicate phones leave no partial contact',async()=>{
   const draftKey=crypto.randomUUID(),check=await (await req('contacts/new/address/verify',{draftKey,address:addresses.US})).json() as any;
   await db.prepare('UPDATE contact_address_checks SET expires_at=0 WHERE id=?1').bind(check.verificationId).run();
   const before=await count();assert.equal((await req('contacts',{draftKey,name:'Expired',verify:true,verificationId:check.verificationId})).status,409);assert.equal(await count(),before);
   const first={draftKey:crypto.randomUUID(),name:'Unique phone',phone:'+15555550123',verify:false,address:addresses.US};
   assert.equal((await req('contacts',first)).status,201);
   assert.equal((await req('contacts',{...first,draftKey:crypto.randomUUID(),name:'Duplicate phone'})).status,409);
   assert.equal(await count(),before+1);
  });
  await t.test('Google failure can be followed by saving the same draft unchecked',async()=>{
   googleFailure=true;const draftKey=crypto.randomUUID(),before=await count();
   const failed=await req('contacts/new/address/verify',{draftKey,address:addresses.IN});assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private upstream/);assert.equal(await count(),before);
   assert.equal((await req('contacts',{draftKey,name:'Manual fallback',verify:false,address:addresses.IN})).status,201);googleFailure=false;
  });
  await t.test('invalid input and forged verification flags fail before creating a person',async()=>{
   const before=await count(),base={draftKey:crypto.randomUUID(),name:'Invalid',verify:false};
   for(const address of [{...addresses.IN,postalCode:'12345'},{...addresses.US,state:''},{...addresses.NL,postalCode:'bad'},{...addresses.US,country:'CA'}])assert.equal((await req('contacts',{...base,address})).status,400);
   assert.equal((await req('contacts',{...base,verify:true,address:addresses.US})).status,400);
   assert.equal((await req('contacts',{...base,phone:'123'})).status,400);
   assert.equal((await req('contacts',base,'admin.test','')).status,401);
   assert.equal((await req('contacts',base,'admin.test',jwt,'http://other.test')).status,403);
   assert.equal(await count(),before);
  });
  await t.test('address suggestions work before a person exists and do not verify or create them',async()=>{
   const before=await count(),search={draftKey:crypto.randomUUID(),version:0,sessionToken:crypto.randomUUID(),country:'NL',input:'Voorbeeld'},result=await req('contacts/new/address/autocomplete',search);
   assert.equal(result.status,200);assert.equal(placesCalls,1);assert.equal(await count(),before);
   const selected=await req('contacts/new/address/place',{...search,placeId:'sample-place'});assert.equal(selected.status,200);
   const place=await selected.json() as any;assert.equal(place.address.line1,'Voorbeeldstraat 12A');assert.equal(place.addressFields.line1,'Voorbeeldstraat');assert.equal(place.addressFields.houseNumber,'12A');
   assert.equal(await count(),before);
   assert.equal((await db.prepare('SELECT count(*) n FROM invites').first<any>()).n,0);
  });
 }finally{await mf.dispose();}
});
