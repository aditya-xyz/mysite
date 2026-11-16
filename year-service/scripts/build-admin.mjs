import {copyFile,mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import { build } from 'esbuild';
await build({entryPoints:['admin/client/app.js'],outfile:'admin/web/app.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'eof'});
console.log('Built private admin client. Authentication is enforced before serving every asset.');

await mkdir('admin/web/fonts',{recursive:true});
await copyFile('web/fonts/caveat-400.ttf','admin/web/fonts/caveat-400.ttf');
await copyFile('web/fonts/Caveat-OFL.txt','admin/web/fonts/Caveat-OFL.txt');
await copyFile('web/fonts/asap-variable.woff2','admin/web/fonts/asap-variable.woff2');
await copyFile('web/fonts/Asap-OFL.txt','admin/web/fonts/Asap-OFL.txt');

await copyFile('web/folded-card.css','admin/web/folded-card.css');

await copyFile('web/loading.css','admin/web/loading.css');

await copyFile('web/pixel-santa.png','admin/web/pixel-santa.png');

// The guest UI is a private admin asset; adminIdentity protects every request.
await cp('web','admin/web/pixelbook-preview',{recursive:true});
await build({entryPoints:['admin/client/recipient-preview.js'],outfile:'admin/web/pixelbook-preview/preview-entry.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true});
let previewHTML=await readFile('web/index.html','utf8');
previewHTML=previewHTML.replaceAll('src="/','src="/pixelbook-preview/').replaceAll('href="/','href="/pixelbook-preview/').replace('/pixelbook-preview/app.bundle.js','/pixelbook-preview/preview-entry.js');
previewHTML=previewHTML.replace('</head>','<link rel="stylesheet" href="/pixelbook-preview/admin-preview.css"></head>');
await writeFile('admin/web/pixelbook-preview/index.html',previewHTML);
await writeFile('admin/web/pixelbook-preview/admin-preview.css','.admin-preview-banner{position:sticky;top:0;z-index:15;display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:12px 24px;background:#2c5745;color:#fff;font:14px system-ui}.admin-preview-banner a{color:inherit;margin-left:auto}.admin-preview-banner span{font-size:12px}.admin-preview-banner+header{margin-top:12px}button:disabled{cursor:not-allowed}');
