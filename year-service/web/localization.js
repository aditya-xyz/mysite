import {digitalDictionary} from './digital-copy.js';
// Exact, reviewed strings only. No network translation and no HTML injection.
export function translateText(value,dictionary={}){
 if(value.includes('\n'))return value.split('\n').map(line=>translateText(line,dictionary)).join('\n');
 const trimmed=value.trim(),exact=dictionary[trimmed];
 if(exact)return value.replace(trimmed,()=>exact);
 if(value.includes(' · '))return value.split(' · ').map(part=>translateText(part,dictionary)).join(' · ');
 if(trimmed.startsWith(', '))return value.replace(trimmed,()=>', '+translateText(trimmed.slice(2),dictionary));
 for(const [source,target] of Object.entries(dictionary)){
  if(!source.includes('{'))continue;
  const names=[];
  const pattern=source.split(/(\{[a-zA-Z]+\})/).map(part=>{
   if(/^\{[a-zA-Z]+\}$/.test(part)){names.push(part);return '(.+?)';}
   return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }).join('');
  const match=new RegExp('^'+pattern+'$','u').exec(trimmed);
  if(match){let result=target;names.forEach((name,i)=>{result=result.replace(name,()=>match[i+1]);});return value.replace(trimmed,()=>result);}
 }
 return value;
}
let observer;
export function installLocalization(context){
 observer?.disconnect();
 const locale=context?.language||'en',dictionary={...digitalDictionary(locale),...context?.uiTranslations};
 document.documentElement.lang=locale;
 if(locale==='en')return;
 const excluded='script,style,textarea,input,canvas,address,[translate="no"],.admin-preview-banner,.fc-note,.fc-back,.pb-design-caption,.pb-design-name,.pb-mug-print p,.card>span,.card>img,#photo-caption,.prose,.letter,.pb-letter-copy>p:not(.pb-eyebrow):not(.pb-letter-greeting):not(.signoff):not(.pb-gift-postscript)';
 const visit=root=>{
  if(root.nodeType===3){if(root.parentElement&&!root.parentElement.closest(excluded)){const result=root.parentElement.matches('[data-card-view="back"]')&&dictionary['Back of card']?dictionary['Back of card']:translateText(root.nodeValue,dictionary);if(result!==root.nodeValue)root.nodeValue=result;}return;}
  if(root.nodeType!==1||root.closest(excluded))return;
  for(const attr of ['aria-label','title','placeholder','alt'])if(root.hasAttribute(attr)){
   const text=root.getAttribute(attr),result=translateText(text,dictionary);if(result!==text)root.setAttribute(attr,result);
  }
  for(const child of [...root.childNodes])visit(child);
 };
 visit(document.body);
 observer=new MutationObserver(records=>{for(const record of records){if(record.type==='childList')record.addedNodes.forEach(visit);else if(record.type==='characterData')visit(record.target);else visit(record.target);}});
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});
}
