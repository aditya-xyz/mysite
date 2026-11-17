import type {Draft} from '../../src/edition.ts';
import {language,translationSources,starterTranslations,withoutAccessibilityTranslations,type TranslationEntries} from '../../src/translations.ts';
import {PrintProblem} from '../../src/printing.ts';
const problem=(status:number,message:string):never=>{throw new PrintProblem(status,message);};
// Run before the edition UPDATE in the same D1 batch, with identical source guards.
export function translationPublication(db:D1Database,year:number,draft:Draft,version:number,revision:number,actor:string){
 const sources=Object.fromEntries(translationSources(draft).map(s=>[s.key,s.source]));
 const matches=`t.key=s.key AND json_extract(t.value,'$.source')=s.value AND json_type(t.value,'$.value')='text'`;
 return db.prepare(`UPDATE edition_translations SET
 published_json=json_patch(coalesce(published_json,'{}'),(SELECT json_group_object(t.key,json(t.value)) FROM json_each(edition_translations.draft_json) t JOIN json_each(?2) s ON ${matches})),
 published_at=unixepoch(),reviewed_by=?3,version=version+1
 WHERE year=?1 AND EXISTS(SELECT 1 FROM editions WHERE year=?1 AND draft_version=?4 AND publication_revision=?5)
 AND EXISTS(SELECT 1 FROM json_each(edition_translations.draft_json) t JOIN json_each(?2) s ON ${matches})`).bind(year,JSON.stringify(sources),actor,version,revision);
}
export async function translationsRoute(request:Request,env:{DB:D1Database},path:string,year:number,actor:string,readBody:()=>Promise<Record<string,unknown>>){
 const match=/^\/api\/translations\/(mr|zh-TW)(\/publish)?$/.exec(path);if(!match)return null;
 if(match[2])problem(410,'Translations publish with the scrapbook. No separate approval is needed.');
 const locale=language(match[1]),db=env.DB;
 const edition=await db.prepare('SELECT draft_json,draft_version FROM editions WHERE year=?1').bind(year).first<{draft_json:string;draft_version:number}>();
 if(!edition)problem(404,'Scrapbook not found.');
 const draft=JSON.parse(edition!.draft_json) as Draft,sources=translationSources(draft);
 const row=await db.prepare('SELECT * FROM edition_translations WHERE year=?1 AND language=?2').bind(year,locale).first<{draft_json:string;published_json:string|null;version:number;published_at:number|null;reviewed_by:string|null}>();
 const drafts:TranslationEntries=withoutAccessibilityTranslations(row?JSON.parse(row.draft_json):starterTranslations(locale));
 if(request.method==='GET')return Response.json({language:locale,sources,entries:drafts,version:row?.version||0,sourceVersion:edition!.draft_version,publishedAt:row?.published_at,publishedEntries:withoutAccessibilityTranslations(JSON.parse(row?.published_json||'{}'))});
 if(request.method!=='POST')problem(405,'Use GET or POST.');
 const data=await readBody();
 if(data.version!==(row?.version||0)||data.sourceVersion!==edition!.draft_version)problem(409,'The English source or translation changed. Reopen the editor before saving.');
 if(!data.entries||typeof data.entries!=='object'||Array.isArray(data.entries))problem(400,'Provide translation entries.');
 const submitted=data.entries as TranslationEntries,patch=data.patch===true,entries:TranslationEntries=Object.create(null);
 if(Object.keys(submitted).some(key=>/^photo:.*:alt$/.test(key)))problem(400,'Accessibility descriptions use English only. Reload the editor.');
 if(patch)Object.assign(entries,drafts);
 const checkedSources=patch?translationSources({...draft,photos:draft.photos.map(p=>({...p,hidden:false}))}).filter(s=>['intro','note','sharedTitle'].includes(s.key)||s.key.startsWith('story:')||s.key.startsWith('photo:')&&s.key.endsWith(':caption')):sources;
 if(patch&&Object.keys(submitted).some(key=>!checkedSources.some(s=>s.key===key)))problem(400,'Inline edits can only update story text and photo zingers.');
 for(const s of checkedSources){const e=submitted[s.key];if(!e)continue;
  if(typeof e.source!=='string'||e.source.length>20000||(!patch&&e.source!==s.source)||typeof e.value!=='string'||e.value.length>Math.max(2000,s.source.length*5))problem(400,'Check the translated text and its English source.');
  const placeholders=(value:string)=>[...value.matchAll(/\{[a-zA-Z]+\}/g)].map(m=>m[0]).sort().join(',');
  if(e.value.trim()&&placeholders(e.value)!==placeholders(e.source))problem(400,'Keep every {placeholder} exactly once in the translation.');
  // Keep stale inline drafts attached to their original source; publication still requires an exact current match.
  entries[s.key]={source:e.source,value:e.value.trim()};
 }
 const serialized=JSON.stringify(entries);
 const result=row?await db.prepare('UPDATE edition_translations SET draft_json=?1,version=version+1 WHERE year=?2 AND language=?3 AND version=?4 AND EXISTS(SELECT 1 FROM editions WHERE year=?2 AND draft_version=?5) RETURNING version').bind(serialized,year,locale,data.version as number,data.sourceVersion as number).first():await db.prepare(`INSERT INTO edition_translations(year,language,draft_json,version) SELECT ?1,?2,?3,1 WHERE ?4=0 AND EXISTS(SELECT 1 FROM editions WHERE year=?1 AND draft_version=?5) ON CONFLICT(year,language) DO NOTHING RETURNING version`).bind(year,locale,serialized,data.version as number,data.sourceVersion as number).first();
 if(!result)problem(409,'Another editor changed this translation or its English source. Reopen it.');
 await db.prepare('INSERT INTO admin_events(actor,action,target) VALUES(?1,?2,?3)').bind(actor,'save-translation',`${year}:${locale}`).run();
 return Response.json(result);
}
