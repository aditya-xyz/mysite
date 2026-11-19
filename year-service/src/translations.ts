import type {Draft} from './edition.ts';
// @ts-expect-error Shared browser/admin catalog.
import {uiDrafts} from './translation-catalog.js';
export type Language='en'|'mr'|'zh-TW';
export type TranslationEntries=Record<string,{source:string;value:string}>;
export interface TranslationSource {key:string;source:string;group:string}
export function language(value:unknown):Language{return value==='mr'||value==='zh-TW'?value:'en';}
export function translationSources(d:Draft):TranslationSource[]{
 const entries:TranslationSource[]=[];
 const add=(key:string,source:string,group:string)=>{if(source?.trim())entries.push({key,source,group});};
 for(const [source] of uiDrafts as string[][])add('ui:'+source,source,'Site controls & Pixel’s voice');
 for(const key of ['intro','note','sharedTitle'] as const)add(key,d[key],'Opening & story');
 for(const s of d.stories||[]){add(`story:${s.id}:title`,s.title,'Opening & story');add(`story:${s.id}:body`,s.body,'Opening & story');}
 for(const p of d.photos||[]){if(p.hidden)continue;add(`photo:${p.id}:caption`,p.caption,'Photo zingers');if(p.shortLabel)add(`photo:${p.id}:shortLabel`,p.shortLabel,'Photo zingers');}
 return entries;
}
export function starterTranslations(locale:Language):TranslationEntries{
 const entries:TranslationEntries=Object.create(null);
 for(const [source,mr,zh] of uiDrafts as string[][])entries['ui:'+source]={source,value:locale==='mr'?mr:zh};
 return entries;
}
export const withoutAccessibilityTranslations=(entries:TranslationEntries):TranslationEntries=>Object.fromEntries(Object.entries(entries).filter(([key])=>!/^photo:.*:alt$/.test(key)));
export async function translationPayload(db:D1Database,year:number,requested:unknown,preview=false){
 const locale=language(requested);
 if(locale==='en')return {language:locale,translations:{} as TranslationEntries};
 const row=await db.prepare('SELECT draft_json,published_json FROM edition_translations WHERE year=?1 AND language=?2').bind(year,locale).first<{draft_json:string;published_json:string|null}>();
 return {language:locale,translations:withoutAccessibilityTranslations(JSON.parse((preview?row?.draft_json:row?.published_json)||'{}'))};
}
export function translated(entries:TranslationEntries,key:string,source:string){const e=entries[key];return e?.source===source&&e.value?.trim()?e.value:source;}
// Only recipient presentation is localized. Printing uses the original edition and its English note.
export function localizeJournal<T extends {intro?:string;note?:string;sharedTitle?:string;stories?:{id:string;title:string;body:string}[];photos:{id:string;caption:string;shortLabel?:string;alt:string}[]}>(journal:T,payload:{language:Language;translations:TranslationEntries}){
 const entries=payload.translations;
 for(const key of ['intro','note','sharedTitle'] as const)if(journal[key])journal[key]=translated(entries,key,journal[key]!);
 journal.stories=journal.stories?.map(s=>({...s,title:translated(entries,`story:${s.id}:title`,s.title),body:translated(entries,`story:${s.id}:body`,s.body)}));
 journal.photos=journal.photos.map(photo=>{
  const caption=translated(entries,`photo:${photo.id}:caption`,photo.caption);
  const label=entries[`photo:${photo.id}:shortLabel`];
  const shortLabel=payload.language==='en'?photo.shortLabel:label?.source===photo.shortLabel&&label?.value.trim()?label.value:undefined;
  return {...photo,caption,shortLabel};
 });
 // Never send the full translation draft (including other recipients’ captions) to a guest.
 const ui:Record<string,string>=Object.create(null);
 for(const [source] of uiDrafts as string[][]){const e=entries['ui:'+source];if(e?.source===source&&e.value?.trim())ui[source]=e.value;}
 return Object.assign(journal,{language:payload.language,uiTranslations:ui});
}
