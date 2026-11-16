import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {digest} from '../src/security.ts';

test('guest delivery names all invitation members while verifying and saving only the contact address',async()=>{
 let validationCalls=0,placesCalls=0;
 const canonical={line1:'123 VERIFIED ST',line2:'',city:'PORTLAND',state:'OR',postalCode:'97201-1234',country:'US'};
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'.wrangler/test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'delivery'},r2Buckets:{MEDIA:'delivery'},bindings:{ORDER_MODE:'simulation',ADDRESS_VERIFICATION_PROVIDER:'google',GOOGLE_ADDRESS_VALIDATION_API_KEY:'test-key',GOOGLE_PLACES_ENABLED:'true',SMS_ENABLED:'false'},outboundService:async(req:Request)=>{
  if(req.url.startsWith('https://places.googleapis.com/')){placesCalls++;return Response.json({suggestions:[{placePrediction:{placeId:'test-place',text:{text:'123 Verified St, Portland, OR'}}}]});}
  assert.equal(req.url,'https://addressvalidation.googleapis.com/v1:validateAddress');validationCalls++;
  const body=await req.json() as any;assert.equal(body.enableUspsCass,true);
  return Response.json({result:{verdict:{addressComplete:true,validationGranularity:'PREMISE'},uspsData:{dpvConfirmation:'Y'},address:{postalAddress:{regionCode:'US',addressLines:[canonical.line1],locality:canonical.city,administrativeArea:canonical.state,postalCode:canonical.postalCode}}}});
 }}));
 try{
  const db=await mf.getD1Database('DB');
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()){
   const sql=await readFile('migrations/'+name,'utf8');if(sql.includes('--> statement-breakpoint'))await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s)));else await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));
  }
  await db.prepare("UPDATE editions SET is_active=1,published_json='{}' WHERE year=2026").run();
  await db.prepare("INSERT INTO people(id,name,phone) VALUES('contact','Phone Contact','+15555550123'),('other','Other Person','+15555550124')").run();
  await db.prepare("INSERT INTO invites(id,person_id,token_hash,name,phone,expires_at,member_ids,allow_print) VALUES('invite','contact',?1,'Household','+15555550123',unixepoch()+86400,'[\"contact\",\"other\"]',1)").bind(await digest('a'.repeat(64))).run();
  const raw='b'.repeat(64);await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?1,'invite',unixepoch()+86400)").bind(await digest(raw)).run();
  const api=(action='',data?:unknown,auth=true,origin='https://guest.test')=>mf.dispatchFetch('https://guest.test/api/delivery-address'+(action?'/'+action:''),{method:data===undefined?'GET':'POST',headers:{Origin:origin,...(auth?{Cookie:'__Host-year_session='+raw}:{}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
  assert.equal((await api('',undefined,false)).status,401);
  assert.equal((await api('verify',{},true,'https://evil.test')).status,403);
  const state=await (await api()).json() as any;assert.equal(state.verified,false);assert.equal(state.address,null);assert.equal(state.recipientName,'Phone Contact & Other Person');assert.equal(state.mode,'google');
  const search=await api('autocomplete',{version:state.version,sessionToken:'session-token-123456',input:'123',personId:'other'});assert.equal(search.status,200);assert.equal(placesCalls,1);
  assert.equal((await api('save',{version:state.version,verify:false,address:canonical})).status,400);
  const reviewResponse=await api('verify',{version:state.version,address:{...canonical,line1:'123 verified st'},personId:'other'});assert.equal(reviewResponse.status,200,await reviewResponse.clone().text());
  const review=await reviewResponse.json() as any;assert.equal(review.simulated,false);assert.deepEqual(review.address,canonical);assert.equal(validationCalls,1);
  assert.equal((await db.prepare("SELECT address_verified FROM people WHERE id='contact'").first<any>()).address_verified,0,'Verification review does not save without approval');
  assert.equal((await api('save',{version:state.version,verify:true,verificationId:'invalid'})).status,409);
  const savedResponse=await api('save',{version:state.version,verify:true,verificationId:review.verificationId,address:{...canonical,line1:'ATTACKER ADDRESS'},personId:'other'});assert.equal(savedResponse.status,200,await savedResponse.clone().text());
  const saved=await savedResponse.json() as any;assert.equal(saved.verified,true);assert.deepEqual(saved.address,canonical);assert.equal(saved.version,state.version+2);assert.equal('phone' in saved,false);assert.equal('id' in saved,false);
  const contact=await db.prepare("SELECT * FROM people WHERE id='contact'").first<any>();assert.deepEqual(JSON.parse(contact.mailing_address),canonical);assert.equal(contact.address_verifier,'google');assert.equal((await db.prepare("SELECT mailing_address FROM people WHERE id='other'").first<any>()).mailing_address,null);
  assert.equal((await api('save',{version:state.version,verify:true,verificationId:review.verificationId})).status,409,'Used challenges cannot overwrite a saved address');
  assert.equal((await api('confirm',{version:state.version})).status,409,'Stale order review cannot silently accept a changed address');
  assert.equal((await api('confirm',{version:saved.version})).status,200);
  assert.equal((await db.prepare("SELECT print_address_key FROM invites WHERE id='invite'").first<any>()).print_address_key,contact.address_verification_key);
  const oldAddress={...canonical};canonical.line1='456 UPDATED ST';
  const editResponse=await api('verify',{version:saved.version,address:canonical});assert.equal(editResponse.status,200);const edit=await editResponse.json() as any;
  assert.deepEqual((await(await api()).json() as any).address,oldAddress,'Checking an edit leaves the old verified address intact');
  assert.equal((await api('save',{version:saved.version,verify:true,verificationId:edit.verificationId})).status,200);
  const updated=await(await api()).json() as any;assert.deepEqual(updated.address,canonical);assert.equal(updated.version,saved.version+2);
  assert.equal((await api('confirm',{version:saved.version})).status,409,'Old order reviews cannot confirm a newly edited address');
  assert.equal((await api('confirm',{version:updated.version})).status,200);
  await db.prepare("UPDATE people SET address_verified_until=unixepoch()-1 WHERE id='contact'").run();assert.equal((await (await api()).json() as any).verified,false);assert.equal((await api('confirm',{version:saved.version})).status,409);
  await db.prepare("UPDATE invites SET revoked_at=unixepoch() WHERE id='invite'").run();assert.equal((await api()).status,401);
  assert.equal(validationCalls,2,'Stored address reads and confirmation do not reverify or fulfill orders');
  assert.equal((await db.prepare('SELECT count(*) n FROM mug_orders').first<any>()).n,0);assert.equal((await db.prepare('SELECT count(*) n FROM print_orders').first<any>()).n,0);
  await db.prepare("UPDATE invites SET revoked_at=NULL WHERE id='invite'").run();
  const india={country:'IN',line1:'504 Building 1 Sample Phase 8',line2:'Sample Road 2',city:'Thane',state:'Maharashtra',postalCode:'400610'};
  await db.prepare("UPDATE people SET mailing_address=?1 WHERE id='contact'").bind(JSON.stringify(india)).run();
  await db.prepare("UPDATE people SET address_verified=1,address_verifier='admin',address_verified_at=unixepoch(),address_verification_key='manual-india',version=version+1 WHERE id='contact'").run();
  const manual=(await (await api()).json()) as any;assert.equal(manual.verified,true);assert.deepEqual(manual.address,india);const before=validationCalls;
  assert.equal((await api('confirm',{version:manual.version})).status,200);
  assert.equal((await api('verify',{version:manual.version,address:canonical})).status,409,'Guest must not replace the saved India address with US input');assert.equal(validationCalls,before);
  await db.prepare("UPDATE people SET mailing_address=NULL,version=version+1 WHERE id='contact'").run();
  const empty=(await (await api()).json()) as any;assert.equal(empty.country,'US');
  assert.equal((await api('verify',{version:empty.version,address:india})).status,400);assert.equal(validationCalls,before);
 }finally{await mf.dispose();}
});
