import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser canvas implementation shared with the admin preparer.
import {renderMugPrint} from '../web/mug-print.js';
test('one full wrap contains the selected captioned cutout and Santa signature in opposite handle-facing panels',async()=>{
 const previousDocument=(globalThis as any).document,previousImage=(globalThis as any).Image;
 const draws:any[]=[],texts:any[]=[];let canvas:any;
 (globalThis as any).Image=class{src='';naturalWidth=369;naturalHeight=400;async decode(){assert.equal(this.src,'/pixel-santa.png');}};
 const context={font:'',drawImage(...args:any[]){draws.push(args);},measureText(text:string){return {width:text.length*8};},fillText(...args:any[]){texts.push(args);}};
 (globalThis as any).document={fonts:{async load(){}},createElement(tag:string){assert.equal(tag,'canvas');return canvas={width:0,height:0,getContext(){return context;},toBlob(fn:any){fn(new Blob(['paired-wrap'],{type:'image/png'}));}};}};
 try{
  const cutout={naturalWidth:1200,naturalHeight:1200};
  const blob=await renderMugPrint({caption:'How your email finds me'},{font:'clean',style:'enamel'},{printWidth:2400,printHeight:720,renderWidth:2400,sourceImage:cutout});
  assert.equal(blob.type,'image/png');assert.equal(canvas.width,2400);assert.equal(canvas.height,720);assert.equal(draws.length,2);
  for(const [index,center] of [[0,600],[1,1800]]){const [,x,y,w,h]=draws[index];assert.equal(x+w/2,center);assert.ok(y>=0&&y+h<=720);}
  assert.deepEqual(texts.map(t=>[t[0],t[1]]),[['How your email finds me',600],['pixelbook ’26',1800]]);
 }finally{(globalThis as any).document=previousDocument;(globalThis as any).Image=previousImage;}
});
