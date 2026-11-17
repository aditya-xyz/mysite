import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Browser client with a minimal DOM.
import {openMugCustomizer} from '../web/mug-customizer.js';
for(const action of ['backdrop','escape'])test(`customizer ${action} acts like Done and keeps edited choices exactly once`,async()=>{
 const previous=(globalThis as any).document;const events=new Map<string,Function[]>();let result:any,count=0;
 const done:any={focus(){}},restore:any={focus(){}},option:any={dataset:{selectOption:'color',selectValue:'black'}};
 const dialog:any={open:false,setAttribute(){},closest:(selector:string)=>selector==='dialog'?dialog:null,querySelector:(s:string)=>s==='[data-customizer-done]'?done:s==='[data-restore-style]'?restore:done,querySelectorAll:(s:string)=>s==='[data-select-option]'?[option]:[],addEventListener(k:string,fn:Function){events.set(k,[...(events.get(k)||[]),fn]);},removeEventListener(k:string,fn:Function){events.set(k,(events.get(k)||[]).filter(f=>f!==fn));},showModal(){this.open=true;},close(){this.open=false;},remove(){},getBoundingClientRect:()=>({left:100,right:500,top:100,bottom:500})};
 (globalThis as any).document={createElement:()=>dialog,body:{append(){}},activeElement:null};
 const styles=[{id:'classic',label:'Classic',sizes:['11oz'],colors:['white','black']}];
 try{
  openMugCustomizer({id:'sample'},{style:'classic',size:'11oz',color:'white',font:'clean'},(value:any)=>{result=value;count++;},styles,()=>{},()=>'',()=>true);
  option.onclick();
  const click=(x:number)=>{for(const fn of [...(events.get('click')||[])])fn({target:dialog,clientX:x,clientY:200});};
  click(200);assert.equal(dialog.open,true);assert.equal(count,0);
  if(action==='backdrop'){click(50);click(50);}else{let prevented=false;for(let i=0;i<2;i++)for(const fn of [...(events.get('cancel')||[])])fn({preventDefault(){prevented=true;}});assert.equal(prevented,true);}
  await new Promise(r=>setImmediate(r));assert.equal(dialog.open,false);assert.equal(count,1);assert.deepEqual(result,{style:'classic',size:'11oz',color:'black',font:'clean'});
 }finally{(globalThis as any).document=previous;}
});
