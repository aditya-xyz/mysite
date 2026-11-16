import type {Draft} from '../../src/edition.ts';
import {language,translationSources,starterTranslations,type TranslationEntries} from '../../src/translations.ts';
import {PrintProblem} from '../../src/printing.ts';
const problem=(status:number,message:string):never=>{throw new PrintProblem(status,message);};
export async function translationsRoute(request:Request,env:{DB:D1Database},path:string,year:number,actor:string,readBody:()=>Promise<Record<string,unknown>>){
 const match=/^\/api\/translations\/(mr|zh-TW)(\/publish)?$/.exec(path);if(!match)return null;
 const locale=language(match[1]),db=env.DB;
 const edition=await db.prepare('SELECT draft_json,draft_version FROM editions WHERE year=?1').bind(year).first<{draft_json:string;draft_version:number}>();
 if(!edition)problem(404,'Scrapbook not found.');
 const sources=translationSources(JSON.parse(edition!.draft_json) as Draft);
 const row=await db.prepare('SELECT * FROM edition_translations WHERE year=?1 AND language=?2').bind(year,locale).first<{draft_json:string;published_json:string|null;version:number;published_at:number|null;reviewed_by:string|null}>();
 const drafts:TranslationEntries=row?JSON.parse(row.draft_json):starterTranslations(locale);
 if(request.method==='GET'&&!match[2])return Response.json({language:locale,sources,entries:drafts,version:row?.version||0,sourceVersion:edition!.draft_version,publishedAt:row?.published_at,reviewedBy:row?.reviewed_by,publishedEntries:JSON.parse(row?.published_json||'{}')});
 if(request.method!=='POST')problem(405,'Use GET or POST.');
 const data=await readBody();
 if(data.version!==(row?.version||0)||data.sourceVersion!==edition!.draft_version)problem(409,'The English source or translation changed. Reopen the review before saving.');
 const entries:TranslationEntries=Object.create(null);
 if(match[2]){
  if(data.reviewed!==true||!row)problem(400,'Save the translation draft, then confirm you reviewed it before publishing.');
  for(const s of sources){const e=drafts[s.key];if(e?.source!==s.source||!e.value?.trim())problem(409,'Complete and review every current translation before publishing.');entries[s.key]=e;}
 }else{
  if(!data.entries||typeof data.entries!=='object'||Array.isArray(data.entries))problem(400,'Provide translation entries.');
  const submitted=data.entries as TranslationEntries;
  for(const s of sources){const e=submitted[s.key];if(!e)continue;
   if(e.source!==s.source||typeof e.value!=='string'||e.value.length>Math.max(2000,s.source.length*5))problem(400,'Check the translated text and its English source.');
   const placeholders=(value:string)=>[...value.matchAll(/\{[a-zA-Z]+\}/g)].map(m=>m[0]).sort().join(',');
   if(e.value.trim()&&placeholders(e.value)!==placeholders(s.source))problem(400,'Keep every {placeholder} exactly once in the translation.');
   entries[s.key]={source:s.source,value:e.value.trim()};
  }
 }
 const serialized=JSON.stringify(entries);
 const result=match[2]?await db.prepare(`UPDATE edition_translations SET published_json=?1,published_at=unixepoch(),reviewed_by=?2,version=version+1 WHERE year=?3 AND language=?4 AND version=?5 AND EXISTS(SELECT 1 FROM editions WHERE year=?3 AND draft_version=?6) RETURNING version`).bind(serialized,actor,year,locale,data.version as number,data.sourceVersion as number).first():row?await db.prepare('UPDATE edition_translations SET draft_json=?1,version=version+1 WHERE year=?2 AND language=?3 AND version=?4 AND EXISTS(SELECT 1 FROM editions WHERE year=?2 AND draft_version=?5) RETURNING version').bind(serialized,year,locale,data.version as number,data.sourceVersion as number).first():await db.prepare(`INSERT INTO edition_translations(year,language,draft_json,version) SELECT ?1,?2,?3,1 WHERE ?4=0 AND EXISTS(SELECT 1 FROM editions WHERE year=?1 AND draft_version=?5) ON CONFLICT(year,language) DO NOTHING RETURNING version`).bind(year,locale,serialized,data.version as number,data.sourceVersion as number).first();
 if(!result)problem(409,'Another editor changed this translation or its English source. Reopen it.');
 await db.prepare('INSERT INTO admin_events(actor,action,target) VALUES(?1,?2,?3)').bind(actor,match[2]?'publish-translation':'save-translation',`${year}:${locale}`).run();
 return Response.json(result);
}
