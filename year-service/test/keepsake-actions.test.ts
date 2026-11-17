import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the editor's real update path while tracking mounted button identities.
const source=readFileSync(new URL('../web/keepsake.js',import.meta.url),'utf8');
const update=source.slice(source.indexOf('  function updateExport(){'),source.indexOf('  function drawCard('));
function fixture(){
  let writes=0;
  const buttons=new Map<string,any>(),attributes=new Map<string,string>();
  const bottom={
    set innerHTML(markup:string){
      writes++;buttons.clear();
      for(const match of markup.matchAll(/data-(print|save|share)\b/g))buttons.set(match[1],{disabled:false,listeners:0,addEventListener(){this.listeners++;}});
    },
    querySelector:(selector:string)=>buttons.get(selector.slice(6,-1)),
    querySelectorAll:()=>[...buttons.values()],
    setAttribute:(name:string,value:string)=>attributes.set(name,value),
  };
  const state:any={file:{},busy:false,step:'edit',exportSignature:null,mode:'save',print:true,
    modal:{querySelector:(selector:string)=>selector==='.ks-export-actions'?bottom:null},
    printFlow:{prepare(){},bind:(container:any)=>container.querySelector('[data-print]')?.addEventListener('click',()=>{})},
    download(){},shareCard(){},
  };
  state.exportActions=()=>`${state.print?`<button data-print ${state.file?'':'disabled'}>A Christmas gift</button>`:''}<button data-${state.mode} ${state.file?'':'disabled'}>Keep it digital</button>`;
  runInNewContext(update,state);
  return {state,buttons,attributes,run:()=>state.updateExport(),writes:()=>writes};
}

test('border repaints keep both export buttons mounted and block stale exports until ready',()=>{
  const f=fixture();f.run();
  const print=f.buttons.get('print'),digital=f.buttons.get('save');
  for(let i=0;i<3;i++){
    f.state.file=null;f.state.busy=true;f.run();
    assert.equal(f.buttons.get('print'),print);assert.equal(f.buttons.get('save'),digital);
    assert.equal(print.disabled,true);assert.equal(digital.disabled,true);
    assert.equal(f.attributes.get('aria-busy'),'true');
    f.state.file={};f.state.busy=false;f.run();
    assert.equal(print.disabled,false);assert.equal(digital.disabled,false);
    assert.equal(f.attributes.get('aria-busy'),'false');
  }
  assert.equal(f.writes(),1);assert.equal(print.listeners,1);assert.equal(digital.listeners,1);
});

test('a real action change still replaces and binds the correct share/save and print actions',()=>{
  const f=fixture();f.run();const save=f.buttons.get('save');
  f.state.mode='share';f.run();
  assert.equal(f.writes(),2);assert.equal(f.buttons.has('save'),false);
  assert.notEqual(f.buttons.get('share'),save);assert.equal(f.buttons.get('share').listeners,1);
  f.state.print=false;f.run();assert.equal(f.buttons.has('print'),false);
  f.run();assert.equal(f.writes(),3);assert.equal(f.buttons.get('share').listeners,1);
});
