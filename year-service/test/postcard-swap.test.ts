import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../web/print-flow.js',import.meta.url),'utf8');
const swap=source.slice(source.indexOf('  function swapPictures(){'),source.indexOf('  function finish('));
function fixture(previewOnly:boolean){
  let notice='Previous message',renders=0,focuses=0,keys=0;
  const state:any={submitting:false,data:{personalized:true,recipe:{frontDesign:'personal'}},frontDesign:'personal',requestKey:'original',
    previewMessage:previewOnly?'Admin preview · Final ordering is disabled. No allowance is used.':'',
    previewData:()=>({personalized:true,recipe:{frontDesign:state.frontDesign}}),
    crypto:{randomUUID:()=>`swap-${++keys}`},message:(text:string)=>notice=text,
    renderCard:()=>renders++,sheet:{querySelector:()=>({focus:()=>focuses++})},
  };
  runInNewContext(swap,state);
  return {state,run:()=>state.swapPictures(),notice:()=>notice,renders:()=>renders,focuses:()=>focuses};
}
test('swapping either way preserves the persistent admin-preview notice',()=>{
  const f=fixture(true);
  f.run();assert.equal(f.state.frontDesign,'default');assert.equal(f.notice(),f.state.previewMessage);
  f.run();assert.equal(f.state.frontDesign,'personal');assert.equal(f.notice(),f.state.previewMessage);
  assert.equal(f.renders(),2);assert.equal(f.focuses(),2);assert.equal(f.state.requestKey,'swap-2');
});
test('normal swaps still clear temporary messages, while unavailable swaps change nothing',()=>{
  const f=fixture(false);f.run();assert.equal(f.notice(),'');assert.equal(f.renders(),1);
  f.state.submitting=true;f.run();assert.equal(f.renders(),1);assert.equal(f.state.requestKey,'swap-1');
  f.state.submitting=false;f.state.data.personalized=false;f.run();assert.equal(f.renders(),1);
});
