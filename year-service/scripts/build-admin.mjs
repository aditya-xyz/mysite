import {copyFile,mkdir} from 'node:fs/promises';
import { build } from 'esbuild';
await build({entryPoints:['admin/client/app.js'],outfile:'admin/web/app.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'eof'});
console.log('Built private admin client. Authentication is enforced before serving every asset.');

await mkdir('admin/web/fonts',{recursive:true});
await copyFile('web/fonts/caveat-400.ttf','admin/web/fonts/caveat-400.ttf');
await copyFile('web/fonts/Caveat-OFL.txt','admin/web/fonts/Caveat-OFL.txt');
await copyFile('web/fonts/asap-variable.woff2','admin/web/fonts/asap-variable.woff2');
await copyFile('web/fonts/Asap-OFL.txt','admin/web/fonts/Asap-OFL.txt');

await copyFile('web/folded-card.css','admin/web/folded-card.css');
