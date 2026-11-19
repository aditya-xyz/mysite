import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared admin browser module.
import {canResetMugOrder,mugOrderStatusLabel,mugAllowanceMarkup} from '../admin/client/mug-orders.js';

test('mug orders UI allows simulation reset only for genuine simulated orders and hides it for live mugs',()=>{
 const simulated={count:1,status:'simulated',live:0,live_state:null,can_reset:1};
 assert.equal(canResetMugOrder(simulated),true);
 assert.equal(mugOrderStatusLabel(simulated),'simulated');
 const simulatedMarkup=mugAllowanceMarkup(simulated);
 assert.match(simulatedMarkup,/Mugs ordered: 1 · Allowance used/);
 assert.match(simulatedMarkup,/data-reset-mug/);
 assert.match(simulatedMarkup,/Reset mug allowance/);
 assert.doesNotMatch(simulatedMarkup,/disabled/);

 for(const state of ['pending','draft']){
  const liveWithSimulatedStatus={count:1,status:'simulated',live:1,live_state:state,can_reset:0};
  assert.equal(canResetMugOrder(liveWithSimulatedStatus),false);
  assert.equal(mugOrderStatusLabel(liveWithSimulatedStatus),`Live · ${state}`);
  const liveMarkup=mugAllowanceMarkup(liveWithSimulatedStatus);
  assert.match(liveMarkup,new RegExp(`Mugs ordered: 1 · Live · ${state} · Allowance used`));
  assert.doesNotMatch(liveMarkup,/data-reset-mug/);
  assert.doesNotMatch(liveMarkup,/Reset mug allowance/);
 }

 const staleLivePayload={count:1,status:'simulated',live:1,live_state:null};
 assert.equal(canResetMugOrder(staleLivePayload),false);
 assert.equal(mugOrderStatusLabel(staleLivePayload),'Live');
 const staleLiveMarkup=mugAllowanceMarkup(staleLivePayload);
 assert.match(staleLiveMarkup,/Mugs ordered: 1 · Live · Allowance used/);
 assert.doesNotMatch(staleLiveMarkup,/data-reset-mug/);
 assert.doesNotMatch(staleLiveMarkup,/Reset mug allowance/);

 const preparing={count:1,status:'preparing',live:0,can_reset:0};
 assert.equal(canResetMugOrder(preparing),false);
 const preparingMarkup=mugAllowanceMarkup(preparing);
 assert.match(preparingMarkup,/data-reset-mug disabled/);

 for(const empty of [{count:0},undefined]){
  assert.equal(canResetMugOrder(empty),false);
  const emptyMarkup=mugAllowanceMarkup(empty);
  assert.match(emptyMarkup,/Mugs ordered: 0 · Allowance available/);
  assert.doesNotMatch(emptyMarkup,/data-reset-mug/);
  assert.doesNotMatch(emptyMarkup,/Reset mug allowance/);
 }
});
