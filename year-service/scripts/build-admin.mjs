import { build } from 'esbuild';
await build({entryPoints:['admin/client/app.js'],outfile:'admin/web/app.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'eof'});
console.log('Built private admin client. Authentication is enforced before serving every asset.');
