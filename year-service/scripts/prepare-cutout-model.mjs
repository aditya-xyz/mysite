import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path='admin/web/models/u2netp.onnx',sha='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';
let bytes;try{bytes=await readFile(path);}catch{}
if(!bytes){const response=await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx');if(!response.ok)throw new Error('Could not download the cutout model.');bytes=Buffer.from(await response.arrayBuffer());}
if(createHash('sha256').update(bytes).digest('hex')!==sha)throw new Error('Cutout model checksum mismatch.');
await mkdir('admin/web/models',{recursive:true});await writeFile(path,bytes);
console.log('Verified browser-local U2Netp model (4.6 MB).');
