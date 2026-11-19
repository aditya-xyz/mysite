import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared admin browser module.
import {canResetMugOrder,mugOrderStatusLabel,mugAllowanceMarkup} from '../admin/client/mug-orders.js';

test('mug orders UI offers reset only for an active, completed mug order',()=>{
 const simulated={count:1,used:1,status:'simulated',live:0,live_state:null,can_reset:1};
 assert.equal(canResetMugOrder(simulated),true);
 assert.equal(mugOrderStatusLabel(simulated),'simulated');
 const simulatedMarkup=mugAllowanceMarkup(simulated);
 assert.match(simulatedMarkup,/Mugs ordered: 1 · Allowance used/);
 assert.match(simulatedMarkup,/data-reset-mug/);
 assert.match(simulatedMarkup,/Reset mug allowance/);
 assert.doesNotMatch(simulatedMarkup,/disabled/);

 for(const state of ['pending','draft']){
  const liveWithSimulatedStatus={count:1,used:1,status:'simulated',live:1,live_state:state,can_reset:0};
  assert.equal(canResetMugOrder(liveWithSimulatedStatus),false);
  assert.equal(mugOrderStatusLabel(liveWithSimulatedStatus),`Live · ${state}`);
  const liveMarkup=mugAllowanceMarkup(liveWithSimulatedStatus);
  assert.match(liveMarkup,new RegExp(`Mugs ordered: 1 · Live · ${state} · Allowance used`));
  assert.match(liveMarkup,/data-reset-mug disabled/);
 }

 const staleLivePayload={count:1,used:1,status:'simulated',live:1,live_state:null};
 assert.equal(canResetMugOrder(staleLivePayload),false);
 assert.equal(mugOrderStatusLabel(staleLivePayload),'Live');
 const staleLiveMarkup=mugAllowanceMarkup(staleLivePayload);
 assert.match(staleLiveMarkup,/Mugs ordered: 1 · Live · Allowance used/);
 assert.match(staleLiveMarkup,/data-reset-mug disabled/);

 const preparing={count:1,used:1,status:'preparing',live:0,can_reset:0};
 assert.equal(canResetMugOrder(preparing),false);
 const preparingMarkup=mugAllowanceMarkup(preparing);
 assert.match(preparingMarkup,/data-reset-mug disabled/);

 const submitted={count:1,used:1,status:'submitted',live:1,live_state:'submitted',can_reset:1};
 assert.equal(canResetMugOrder(submitted),true);
 assert.doesNotMatch(mugAllowanceMarkup(submitted),/disabled/);
 assert.match(mugAllowanceMarkup({count:2,used:0}),/Mugs ordered: 2 · Allowance available/);
 assert.doesNotMatch(mugAllowanceMarkup({count:2,used:0}),/Reset mug allowance/);
 for(const empty of [{count:0},undefined]){
  assert.equal(canResetMugOrder(empty),false);
  const emptyMarkup=mugAllowanceMarkup(empty);
  assert.match(emptyMarkup,/Mugs ordered: 0 · Allowance available/);
  assert.doesNotMatch(emptyMarkup,/data-reset-mug/);
  assert.doesNotMatch(emptyMarkup,/Reset mug allowance/);
 }
});
