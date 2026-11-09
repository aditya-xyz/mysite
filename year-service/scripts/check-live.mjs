import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://aditya-year-2026.aditya-year-service.workers.dev';
const {token}=JSON.parse(await readFile(new URL('../.private/angela.json',import.meta.url),'utf8'));
let cookie='';
async function req(path,data) {
  return fetch(base+path,{headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},
    ...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
}
try {
  assert.equal((await req('/')).status,200);console.log('HTTPS app shell: OK');
  assert.equal((await req('/api/journal')).status,401);
  assert.equal((await req('/api/media/personal-coast')).status,401);console.log('Unauthenticated journal and media: denied');
  const opened=await req('/api/open',{token});assert.equal(opened.status,200);
  cookie=opened.headers.get('Set-Cookie').split(';')[0];
  const response=await req('/api/invitation'), invite=await response.json();
  assert.equal(response.status,200);assert.equal(invite.name,'Angela');console.log('Phone-bound invitation: OK');
  if(!invite.smsEnabled) {assert.equal((await req('/api/send',{})).status,503);console.log('Disabled SMS send gate: OK');}
  assert.equal((await req('/api/journal')).status,401);console.log('Invitation without verification cannot read journal: OK');
  console.log('Live smoke checks passed. No SMS sent.');
} catch(error) {console.error('Live check failed:',error.cause?.code || error.message);process.exitCode=1;}
