import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../web/theme.js',import.meta.url),'utf8');
function boot(saved:string|null,dark:boolean,blocked=false,legacy:string|null=null){
  const listeners:Record<string,Function>={},metas:Record<string,string>={};
  const root={dataset:{} as Record<string,string>,style:{} as Record<string,string>};
  const system={matches:dark,addEventListener:(name:string,fn:Function)=>{listeners[name]=fn;}};
  vm.runInNewContext(script,{
    document:{documentElement:root,readyState:'loading',getElementById:()=>null,addEventListener:()=>{},querySelector:(selector:string)=>({setAttribute:(_:string,value:string)=>{metas[selector]=value;}})},
    window:{matchMedia:()=>system,addEventListener:(name:string,fn:Function)=>{listeners[name]=fn;}},
    localStorage:{getItem:(key:string)=>{if(blocked)throw Error('blocked');return key==='scrapbook-color-mode-v2'?saved:legacy;}},
  });
  return {root,metas,system,listeners};
}
test('theme follows the system before login and tracks system changes',()=>{
  for(const dark of [false,true]){
    const state=boot(null,dark);
    assert.equal(state.root.dataset.colorMode,'system');
    assert.equal(state.root.dataset.palette,dark?'night':'moss');
    assert.equal(state.root.style.colorScheme,'light dark');
    assert.equal(state.metas['meta[name="color-scheme"]'],'light dark');
    state.system.matches=!dark;state.listeners.change();
    assert.equal(state.root.dataset.palette,dark?'moss':'night');
  }
});
test('saved overrides survive OS changes; invalid or unavailable storage follows system',()=>{
  for(const saved of ['dark','light']){
    const state=boot(saved,saved==='light');
    state.system.matches=!state.system.matches;state.listeners.change();
    assert.equal(state.root.dataset.palette,saved==='dark'?'night':'moss');
  }
  for(const saved of ['system','unknown',null])assert.equal(boot(saved,true).root.dataset.palette,'night');
  assert.equal(boot(null,true,true).root.dataset.palette,'night');
});
test('theme follows preference changes in another tab',()=>{
  const state=boot('light',true);
  state.listeners.storage({key:'scrapbook-color-mode-v2',newValue:'dark'});
  assert.equal(state.root.dataset.palette,'night');
  state.listeners.storage({key:null,newValue:null});
  assert.equal(state.root.dataset.colorMode,'system');
});

test('existing readers start on System regardless of their legacy choice',()=>{
  for(const legacy of ['light','dark']){
    for(const dark of [false,true]){
      const state=boot(null,dark,false,legacy);
      assert.equal(state.root.dataset.colorMode,'system');
      assert.equal(state.root.dataset.palette,dark?'night':'moss');
      state.listeners.storage({key:'scrapbook-color-mode',newValue:legacy});
      assert.equal(state.root.dataset.colorMode,'system');
    }
  }
});
