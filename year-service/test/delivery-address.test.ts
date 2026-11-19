import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {digest} from '../src/security.ts';

test('guest delivery names all invitation members while verifying and saving only the contact address',async t=>{
 let validationCalls=0,placesCalls=0;
 const canonical={line1:'123 VERIFIED ST',line2:'',city:'PORTLAND',state:'OR',postalCode:'97201-1234',country:'US'};
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'.wrangler/test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'delivery'},r2Buckets:{MEDIA:'delivery'},bindings:{ORDER_MODE:'simulation',ADDRESS_VERIFICATION_PROVIDER:'google',GOOGLE_ADDRESS_VALIDATION_API_KEY:'test-key',GOOGLE_PLACES_ENABLED:'true',SMS_ENABLED:'false'},outboundService:async(req:Request)=>{
  if(req.url.startsWith('https://places.googleapis.com/')){
   placesCalls++;
   if(req.url.endsWith('places:autocomplete'))return Response.json({suggestions:[{placePrediction:{placeId:'test-place',text:{text:'123 Verified St, Portland, OR'}}}]});
   return Response.json({addressComponents:[['123','123','street_number'],['Verified St','Verified St','route'],['Portland','Portland','locality'],['Oregon','OR','administrative_area_level_1'],['97201','97201','postal_code'],['United States','US','country']].map(([longText,shortText,type])=>({longText,shortText,types:[type]}))});
  }
  assert.equal(req.url,'https://addressvalidation.googleapis.com/v1:validateAddress');validationCalls++;
  const body=await req.json() as any;assert.equal(body.enableUspsCass,true);
  return Response.json({result:{verdict:{addressComplete:true,validationGranularity:'PREMISE'},uspsData:{dpvConfirmation:'Y'},address:{postalAddress:{regionCode:'US',addressLines:[canonical.line1],locality:canonical.city,administrativeArea:canonical.state,postalCode:canonical.postalCode}}}});
 }}));
 try{
  const db=await mf.getD1Database('DB');
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()){
   const sql=await readFile('migrations/'+name,'utf8');if(sql.includes('--> statement-breakpoint'))await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s)));else await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));
  }
  const cutout='a'.repeat(32);
  for(let n=0;n<4;n++)await db.prepare("INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,?2,?2,'image/jpeg',1)").bind(`mug-${n}`,`mug-${n}.jpg`).run();
  const fullPublished=JSON.stringify({
   authors:'Pixel',
   photos:[],
   printNote:'With love from Pixel',
   mugDesigns:[0,1,2,3].map(n=>({id:`mug-${n}`,caption:`caption ${n}`,alt:`alt ${n}`,preview_key:`mug-${n}.jpg`,cutoutVersion:cutout}))
  });
  await db.prepare('UPDATE editions SET is_active=1,published_version=1,published_json=?1,allow_print_orders=1,allow_mug_orders=0 WHERE year=2026').bind(fullPublished).run();
  await db.prepare('INSERT INTO keepsake_defaults(year,revision,frames_json) VALUES(2026,?1,?2)').bind('r'.repeat(32),JSON.stringify({moss:'default.jpg'})).run();
  await db.prepare('UPDATE card_fallback_policies SET international_cutoff=unixepoch()+86400,international_run_at=unixepoch()+90000,us_cutoff=unixepoch()+86400,us_run_at=unixepoch()+90000 WHERE year=2026').run();
  await db.prepare("INSERT INTO people(id,name,phone) VALUES('contact','Phone Contact','+15555550123'),('other','Other Person','+15555550124')").run();
  await db.prepare("INSERT INTO invites(id,person_id,token_hash,name,phone,expires_at,member_ids,allow_print,allow_mug) VALUES('invite','contact',?1,'Household','+15555550123',unixepoch()+86400,'[\"contact\",\"other\"]',1,0)").bind(await digest('a'.repeat(64))).run();
  const raw='b'.repeat(64);await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?1,'invite',unixepoch()+86400)").bind(await digest(raw)).run();
  const api=(action='',data?:unknown,auth=true,origin='https://guest.test')=>mf.dispatchFetch('https://guest.test/api/delivery-address'+(action?'/'+action:''),{method:data===undefined?'GET':'POST',headers:{Origin:origin,...(auth?{Cookie:'__Host-year_session='+raw}:{}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const snapshot=async()=>({
   person:await db.prepare("SELECT * FROM people WHERE id='contact'").first<any>(),
   invite:await db.prepare("SELECT allow_print,allow_mug,print_address_key FROM invites WHERE id='invite'").first<any>(),
   challenges:(await db.prepare('SELECT id,person_id,person_version,address_json,provider FROM address_verification_challenges ORDER BY id').all()).results,
   usage:(await db.prepare('SELECT provider,day,month,requests FROM address_verification_usage ORDER BY provider,day').all()).results
  });
  const expectAllDenied=async(expectedStatus:number,errorMatch:RegExp,verificationId='pending')=>{
   await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'delivery:%'").run();
   const beforeCalls={placesCalls,validationCalls},beforeDb=await snapshot(),version=beforeDb.person.version;
   const get=await api();assert.equal(get.status,expectedStatus);assert.match((await get.json() as any).error,errorMatch);
   const posts:[string,unknown][]=[
    ['autocomplete',{version,sessionToken:'session-token-123456',input:'123 Main'}],
    ['place',{version,sessionToken:'session-token-123456',placeId:'test-place'}],
    ['verify',{version,address:canonical}],
    ['save',{version,verify:true,verificationId}],
    ['confirm',{version}]
   ];
   for(const [action,payload] of posts){
    const res=await api(action,payload);
    assert.equal(res.status,expectedStatus,action);
    assert.match((await res.json() as any).error,errorMatch,action);
   }
   assert.deepEqual({placesCalls,validationCalls},beforeCalls,'Denied requests must never call address providers');
   assert.deepEqual(await snapshot(),beforeDb,'Denied requests must never mutate address, challenge, or usage records');
  };

  assert.equal((await api('',undefined,false)).status,401);
  assert.equal((await api('verify',{},true,'https://evil.test')).status,403);
  const state=await (await api()).json() as any;assert.equal(state.verified,false);assert.equal(state.address,null);assert.equal(state.recipientName,'Phone Contact & Other Person');assert.equal(state.mode,'google');
  const search=await api('autocomplete',{version:state.version,sessionToken:'session-token-123456',input:'123',personId:'other'});assert.equal(search.status,200);assert.equal(placesCalls,1);
  const picked=await api('place',{version:state.version,sessionToken:'session-token-123456',placeId:'test-place'});assert.equal(picked.status,200);assert.equal(placesCalls,2);
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
  await db.prepare("UPDATE people SET mailing_address=NULL,address_verified=0,address_verifier=NULL,address_verified_at=NULL,address_verified_until=NULL,address_verification_key=NULL,version=version+1 WHERE id='contact'").run();
  const empty=(await (await api()).json()) as any;assert.equal(empty.country,'US');
  assert.equal((await api('verify',{version:empty.version,address:india})).status,400);assert.equal(validationCalls,before);

  await t.test('postcard-only guest loses address access once digital or mailed postcard is claimed',async()=>{
   await db.prepare("INSERT INTO digital_postcards(id,year,invitation_id,member_ids,personalized,frame,note,authors,frames_json,default_revision,artwork_key,recipe_json) VALUES('dp-1',2026,'invite','[\"contact\"]',0,'evergreen','Note','Pixel','{}','r','dp.jpg','{}')").run();
   await expectAllDenied(403,/not available/);
   await db.prepare("DELETE FROM digital_postcards WHERE id='dp-1'").run();
   await db.prepare("INSERT INTO print_orders(id,invitation_id,year,request_key,status,address_json,recipient_name,note,authors,recipe_json,artwork_key,published_version,created_at) VALUES('print-1','invite',2026,'req-1','simulated','{}','Household','Note','Pixel','{}','print.jpg',1,unixepoch())").run();
   await expectAllDenied(403,/not available/);
   await db.prepare("DELETE FROM print_orders WHERE id='print-1'").run();
  });

  await t.test('mug-only guest can verify, edit, and confirm an existing address, then loses access after claiming',async()=>{
   await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'delivery:%'").run();
   await db.prepare("UPDATE editions SET allow_print_orders=0,allow_mug_orders=1 WHERE year=2026").run();
   await db.prepare("UPDATE invites SET allow_print=0,allow_mug=1,print_address_key=NULL WHERE id='invite'").run();
   const initial=await (await api()).json() as any;
   assert.equal(initial.verified,false);
   assert.equal((await api('autocomplete',{version:initial.version,sessionToken:'session-token-123456',input:'123 Verified'})).status,200);
   const verifyMug=await (await api('verify',{version:initial.version,address:canonical})).json() as any;
   const savedMug=await (await api('save',{version:initial.version,verify:true,verificationId:verifyMug.verificationId})).json() as any;
   assert.equal(savedMug.verified,true);
   const confirmMug=await api('confirm',{version:savedMug.version});
   assert.equal(confirmMug.status,200);
   assert.equal((await db.prepare("SELECT print_address_key FROM invites WHERE id='invite'").first<any>()).print_address_key,null,'Confirming for mug-only invitation must not grant print_address_key');
   const editAddress={...canonical,line1:'789 MUG EDIT ST'};canonical.line1='789 MUG EDIT ST';
   const editVerify=await (await api('verify',{version:savedMug.version,address:editAddress})).json() as any;
   const editSave=await api('save',{version:savedMug.version,verify:true,verificationId:editVerify.verificationId});
   assert.equal(editSave.status,200);
   assert.equal((await api('confirm',{version:savedMug.version+2})).status,200);

   await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify({authors:'Pixel',photos:[],printNote:'With love from Pixel',mugDesigns:[0,1,2].map(n=>({id:`mug-${n}`,caption:`caption ${n}`,alt:`alt ${n}`,preview_key:`mug-${n}.jpg`,cutoutVersion:cutout}))})).run();
   await expectAllDenied(403,/not available/);
   await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(fullPublished).run();

   await db.prepare("INSERT INTO mug_orders(id,invitation_id,year,request_key,status,design_id,caption,alt,artwork_key,address_json,recipient_name,save_address,published_version) VALUES('mug-1','invite',2026,'mug-req-1','simulated','mug-0','caption 0','alt 0','mug.png','{}','Household',1,1)").run();
   await expectAllDenied(403,/not available/);
   await db.prepare("DELETE FROM mug_orders WHERE id='mug-1'").run();
  });

  await t.test('guests with neither gift enabled are blocked before provider calls or writes',async()=>{
   await db.prepare('UPDATE editions SET allow_print_orders=1,allow_mug_orders=1 WHERE year=2026').run();
   await db.prepare("UPDATE invites SET allow_print=0,allow_mug=0 WHERE id='invite'").run();
   await expectAllDenied(403,/not available/);

   await db.prepare('UPDATE editions SET allow_print_orders=0,allow_mug_orders=0 WHERE year=2026').run();
   await db.prepare("UPDATE invites SET allow_print=1,allow_mug=1 WHERE id='invite'").run();
   await expectAllDenied(403,/not available/);
  });

  await t.test('requests after US or international gift deadline are blocked without provider calls or writes',async()=>{
   await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'delivery:%'").run();
   await db.prepare('UPDATE editions SET allow_print_orders=1,allow_mug_orders=1 WHERE year=2026').run();
   await db.prepare("UPDATE invites SET allow_print=1,allow_mug=1 WHERE id='invite'").run();
   const open=await (await api()).json() as any;
   const pending=await (await api('verify',{version:open.version,address:canonical})).json() as any;
   assert.equal((await api('confirm',{version:open.version})).status,200);

   await db.prepare('UPDATE card_fallback_policies SET us_cutoff=unixepoch()-60,us_run_at=unixepoch()-30 WHERE year=2026').run();
   await expectAllDenied(403,/deadline/,pending.verificationId);

   await db.prepare('UPDATE card_fallback_policies SET us_cutoff=unixepoch()+86400,us_run_at=unixepoch()+90000 WHERE year=2026').run();
   await db.prepare("UPDATE people SET mailing_address=?1 WHERE id='contact'").bind(JSON.stringify(india)).run();
   await db.prepare("UPDATE people SET address_verified=1,address_verifier='admin',address_verified_at=unixepoch(),address_verified_until=NULL,address_verification_key='manual-india-deadline',version=version+1 WHERE id='contact'").run();
   const intlBefore=await (await api()).json() as any;
   assert.equal((await api('confirm',{version:intlBefore.version})).status,200);

   await db.prepare('UPDATE card_fallback_policies SET international_cutoff=unixepoch()-60,international_run_at=unixepoch()-30 WHERE year=2026').run();
   await expectAllDenied(403,/deadline/);
  });
 }finally{await mf.dispose();}
});
