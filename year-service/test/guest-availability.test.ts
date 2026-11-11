import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const startup=source.slice(source.indexOf('async function start()'),source.indexOf('function showCode('));
async function openGuest(hash:string,responses:Record<string,unknown>){
 const calls:string[]=[],footer={hidden:false,replaceChildren(){}},app={innerHTML:''};let offline=0,shown=0,error:unknown;
 const context:any={app,document:{querySelector:(selector:string)=>selector==='footer'?footer:{}},location:{hash,pathname:'/'},history:{replaceState(){}},clearBrand(){},showOffline(){offline++;},showJournal(){shown++;},applyBrand(){},renderFooter(){},escape:(s:unknown)=>s,message(e:unknown){error=e;},api:async(path:string)=>{calls.push(path);const result=responses[path];if(result instanceof Error)throw result;return result;}};
 runInNewContext(startup,context);await context.start();
 return {calls,offline,shown,error,footer};
}
const offlineError=()=>Object.assign(new Error('This scrapbook has been taken offline.'),{code:'SCRAPBOOK_OFFLINE'});
test('offline fragment invitation stops before journal, verification or branding',async()=>{
 const result=await openGuest('#'+'a'.repeat(64),{open:{offline:true}});
 assert.deepEqual(result.calls,['open']);assert.equal(result.offline,1);assert.equal(result.footer.hidden,true);
});
test('expired 2FA falls back to invitation availability and shows offline directly',async()=>{
 const result=await openGuest('',{journal:new Error('Session expired'),invitation:offlineError()});
 assert.deepEqual(result.calls,['journal','invitation']);assert.equal((result.error as any).code,'SCRAPBOOK_OFFLINE');assert.equal(result.shown,0);
});
test('valid sessions see offline immediately while invalid invitations retain their generic error',async()=>{
 const valid=await openGuest('',{journal:offlineError()});assert.deepEqual(valid.calls,['journal']);assert.equal(valid.offline,1);
 const invalid=await openGuest('',{journal:new Error('Session expired'),invitation:new Error('Open original invitation')});
 assert.equal(invalid.offline,0);assert.equal((invalid.error as Error).message,'Open original invitation');
});
