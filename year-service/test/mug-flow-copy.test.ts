import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Shared guest rendering module.
import {mugPreview,mugLoadingPreview} from '../web/mug-preview.js';
test('mug previews omit placement disclaimers in all states',()=>{
 for(const markup of [mugLoadingPreview(),mugPreview({src:'/dog.png'}),mugPreview({src:'/dog.png',mockupSrc:'/proof.png'})])assert.doesNotMatch(markup,/final placement|<figcaption>/);
});
