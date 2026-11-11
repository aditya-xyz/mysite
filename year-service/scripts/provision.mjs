// Local administrative tool. Never runs in the browser or exposes an admin endpoint.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const privateDir = new URL('../.private/',import.meta.url);
await mkdir(privateDir,{recursive:true,mode:0o700});
const source=await readFile(new URL('../.dev.vars',import.meta.url),'utf8');
const vars=Object.fromEntries(source.split('\n').filter(l=>/^\w+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
const remote=process.argv.includes('--remote');
const mode=remote?'--remote':'--local';
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
function wrangler(args) {
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8'});
  // Do not echo SQL output, phone numbers, invitation tokens, or configuration values.
  if(result.status!==0) throw new Error('Wrangler command failed: '+args.slice(0,3).join(' ')+'. Inspect the provider dashboard; no sensitive output was printed.');
}
const action=process.argv[2];
if(action==='seed') {
  if(!/^\+[1-9]\d{7,14}$/.test(vars.INITIAL_RECIPIENT_PHONE_E164||'')) throw new Error('Set INITIAL_RECIPIENT_PHONE_E164 in .dev.vars first.');
  let invite;
  try {invite=JSON.parse(await readFile(new URL('angela.json',privateDir),'utf8'));}
  catch {invite={token:randomBytes(32).toString('hex'),expiresAt:Math.floor(Date.now()/1000)+90*86400};await writeFile(new URL('angela.json',privateDir),JSON.stringify(invite),{mode:0o600});}
  const hash=createHash('sha256').update(invite.token).digest('hex');
  const rows=[`INSERT INTO invites(id,token_hash,name,phone,expires_at) VALUES('angela',${quote(hash)},${quote(vars.INITIAL_RECIPIENT_NAME||'Guest')},${quote(vars.INITIAL_RECIPIENT_PHONE_E164)},${invite.expiresAt}) ON CONFLICT(id) DO NOTHING;`];
  for(const [id,personal,caption,alt,order] of [
    ['personal-coast',true,'Some days are worth keeping.','Illustrative coastal sample',1],
    ['personal-evening',true,'The little moments, together.','Illustrative evening sample',2],
    ['shared-hills',false,'A little room to wander.','Illustrative hills sample',1],
    ['shared-sky',false,'An ordinary day, remembered.','Illustrative sunset sample',2]
  ]) {
    rows.push(`INSERT INTO photos(id,invite_id,preview_key,original_key,filename,caption,alt,sort_order) VALUES(${quote(id)},${personal?"'angela'":'NULL'},${quote(id+'.jpg')},${personal?quote(id+'-original.jpg'):'NULL'},${personal?quote(id+'.jpg'):'NULL'},${quote(caption)},${quote(alt)},${order}) ON CONFLICT(id) DO NOTHING;`);
    wrangler(['r2','object','put','aditya-year-2026-private/'+id+'.jpg','--file',new URL('samples/'+id+'.jpg',privateDir).pathname,'--content-type','image/jpeg',mode]);
    if(personal) wrangler(['r2','object','put','aditya-year-2026-private/'+id+'-original.jpg','--file',new URL('samples/'+id+'-original.jpg',privateDir).pathname,'--content-type','image/jpeg',mode]);
  }
  const sql=new URL('seed.sql',privateDir);await writeFile(sql,rows.join('\n'),{mode:0o600});
  wrangler(['d1','execute','DB',mode,'--file',sql.pathname]);
  console.log('Seeded the initial recipient invitation and four illustrative samples. No SMS sent.');
} else if(action==='secrets') {
  const keys=['TWILIO_ACCOUNT_SID','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_VERIFY_SERVICE_SID'];
  if(keys.some(k=>!vars[k])) throw new Error('Missing Twilio settings in .dev.vars.');
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk'],{input:JSON.stringify(Object.fromEntries(keys.map(k=>[k,vars[k]]))),encoding:'utf8'});
  if(result.status!==0) throw new Error('Installing Worker secrets failed. Sensitive output suppressed.');
  console.log('Installed four server-side secrets.');
} else if(action==='invitation') {
  const base=process.argv[3];if(!base?.startsWith('https://')) throw new Error('Supply the HTTPS pilot URL.');
  const invite=JSON.parse(await readFile(new URL('angela.json',privateDir),'utf8'));
  const url=base.replace(/\/$/,'')+'/#'+invite.token;
  await writeFile(new URL('angela-invite.txt',privateDir),url+'\n',{mode:0o600});
  const {default:QR}=await import('qrcode');
  await writeFile(new URL('angela-qr.svg',privateDir),await QR.toString(url,{type:'svg',margin:3,color:{dark:'#293c35',light:'#f6f3ea'}}),{mode:0o600});
  console.log('Saved invitation link and QR to .private/angela-invite.txt and .private/angela-qr.svg.');
} else if(action==='revoke') {
  const sql=new URL('revoke.sql',privateDir);await writeFile(sql,"UPDATE invites SET revoked_at=unixepoch() WHERE id='angela'; DELETE FROM sessions WHERE invite_id='angela';",{mode:0o600});
  wrangler(['d1','execute','DB',mode,'--file',sql.pathname]);console.log('Angela’s invitation and sessions revoked.');
} else throw new Error('Use seed, secrets, invitation <https-url>, or revoke.');
