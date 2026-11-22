import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starterTranslations} from '../src/translations.ts';
// @ts-expect-error Shared guest presentation module.
import {openingMarkup} from '../web/pixelbook.js';
test('the opening tail greeting says saw you first in every supported language and preserves its animated word',()=>{
 const markup=openingMarkup({name:'Friend'}),line=markup.match(/<span class="pb-tail-line" translate="no">(.*?)<\/span><\/p>/)?.[1];
 assert.equal(line,'my <span class="pb-tail-word">tail</span> saw you first');
 for(const [locale,expected] of [['mr','माझ्या शेपटीने तुला आधी पाहिलं'],['zh-TW','我的尾巴先看到你了']] as const){
  const translations=starterTranslations(locale),translatedMarkup=openingMarkup({name:'Friend',language:locale,uiTranslations:{tail:'outdated saved wording'}});
  const actual=translatedMarkup.match(/<span class="pb-tail-line" translate="no">(.*?)<\/span><\/p>/)?.[1]?.replace(/<[^>]+>/g,'');
  assert.equal(actual,expected);assert.equal(translations['ui:knew first.'],undefined);assert.ok(translations['ui:saw you first']);
 }
});
