// Owner-only provisioning: pre-rendered approved defaults remain in ignored .private/ and private R2.
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {defaultKeepsakeCopy} from './keepsake-default-copy.mjs';
const year=Number(process.argv[2]||2026),remote=process.argv.includes('--remote'),mode=remote?'--remote':'--local';
if(!Number.isInteger(year)||year<2000||year>2200)throw Error('Choose a valid scrapbook year.');
const base=new URL('../.private/keepsake-defaults/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
if(manifest.copy?.greeting!==defaultKeepsakeCopy.greeting||manifest.copy?.signature!==defaultKeepsakeCopy.signature)throw Error('Re-render the default keepsake with the current greeting and signature before publishing.');
if(!/^[a-f0-9]{32,64}$/.test(manifest.revision))throw Error('Use an immutable default revision.');
function wrangler(args){const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8'});if(result.status!==0)throw Error('Private default provisioning failed; provider output suppressed.');}
for(const frame of ['moss','classic','santa']){
 if(manifest.frames[frame]!==`${year}/keepsake-defaults/${manifest.revision}/${frame}.jpg`)throw Error('Check the private default manifest.');
 const file=new URL(frame+'.jpg',base),bytes=await readFile(file);if(bytes.length>3*1024*1024||bytes[0]!==255||bytes[1]!==216)throw Error('Use JPEG defaults under 3 MB.');
 wrangler(['r2','object','put','aditya-year-2026-private/'+manifest.frames[frame],'--file',file.pathname,'--content-type','image/jpeg',mode]);
}
const sql=new URL('provision.sql',base);await writeFile(sql,`INSERT INTO keepsake_defaults(year,revision,frames_json) VALUES(${year},'${manifest.revision}','${JSON.stringify(manifest.frames)}') ON CONFLICT(year) DO UPDATE SET revision=excluded.revision,frames_json=excluded.frames_json;`,{mode:0o600});
wrangler(['d1','execute','DB',mode,'--file',sql.pathname]);console.log('Saved three approved private keepsake borders. Permissions and publication were not changed.');
