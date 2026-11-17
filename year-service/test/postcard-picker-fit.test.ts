import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser layout calculation.
import {fittedPickerWidth} from '../web/postcard-picker-fit.js';
test('six mixed-aspect photos fit phone and desktop pages without cropping',()=>{
 for(const [column,available,columns] of [[145,330,2],[230,540,3],[145,560,2],[230,880,3]]){
  const ratios=[.75,1.5,.75,.75,.75,.75],border=14,gap=12;
  const width=fittedPickerWidth(column,available,ratios,columns,gap,border);let height=0;
  for(let i=0;i<ratios.length;i+=columns)height+=Math.max(...ratios.slice(i,i+columns).map(r=>(width-border)/r+border));
  height+=(Math.ceil(ratios.length/columns)-1)*gap;
  assert.ok(width<=column);assert.ok(height<=available+.1,`${height} exceeds ${available}`);
 }
});
test('a short page stays at natural column width when it fits',()=>{
 assert.equal(fittedPickerWidth(200,400,[.75,1.5],2,12),200);
 assert.ok(Number.isFinite(fittedPickerWidth(200,400,[0,NaN],2,12)));
});
