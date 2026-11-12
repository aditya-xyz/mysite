export interface DraftPhoto { id: string; caption: string; alt: string; recipients: string[]; hidden?: boolean; audience?: "shared" | "personal" }
export interface Story { id: string; title: string; body: string }
export interface MugDesign { id:string; caption:string; alt:string; cutoutEditable?:boolean; cutoutVersion?:string }
export interface PublishedMugDesign extends MugDesign { preview_key:string; viewer_key?:string|null; mime?:string }
export const MIN_MUG_DESIGNS=4, MAX_MUG_DESIGNS=12;
export interface Draft {
  title: string; authors: string; intro: string; note: string; sharedTitle: string;
  stories: Story[]; photos: DraftPhoto[]; mugDesigns?:MugDesign[]; printNote?:string; printInvitations?:string[]; printAddressKeys?:Record<string,string>;
}
export interface PublishedPhoto extends DraftPhoto {
  preview_key: string; viewer_key?:string|null; original_key: string | null; filename: string; mime: string; width?:number; height?:number;
}
export interface Published extends Omit<Draft, "photos"> { photos: PublishedPhoto[]; mugDesigns?:PublishedMugDesign[] }
export function publishedMugs(edition:Published){
  const seen=new Set<string>();
  const designs=(edition.mugDesigns||[]).filter(d=>d.preview_key&&!seen.has(d.id)&&!!seen.add(d.id));
  return designs.length>=MIN_MUG_DESIGNS?designs:[];
}
export const visiblePhotos = (edition: Published, recipient: string, personId:string|string[]=recipient) =>
  edition.photos.filter(p => !p.hidden && !(p.audience === "personal" && !p.recipients.length) && (p.recipients.length === 0 || p.recipients.includes(recipient) || (Array.isArray(personId)?personId:[personId]).some(id=>p.recipients.includes(id))));
export function clientEdition(edition: Published, recipient: string, name: string, year: number, personId:string|string[]=recipient) {
  return { year, name, title: edition.title, authors: edition.authors, intro: edition.intro,
    note: edition.note, sharedTitle: edition.sharedTitle, stories: edition.stories, shareSocials:false,
    gift:{enabled:publishedMugs(edition).length>=MIN_MUG_DESIGNS,orderingEnabled:false,designs:publishedMugs(edition).map((d,index)=>({id:d.id,name:`mugshot ${index+1}`,caption:d.caption,alt:d.alt,src:`/api/mugs/${d.id}${d.cutoutVersion?`?version=${d.cutoutVersion}`:''}`}))},
    photos: visiblePhotos(edition, recipient, personId).map(p => ({ id: p.id, caption: p.caption, alt: p.alt,
      width:p.width,height:p.height,personal: p.recipients.length > 0, src: `/api/media/${p.id}`,viewerSrc:`/api/media/${p.id}/viewer`,
      canSave: p.recipients.length > 0 && !!p.original_key })) };
}
export async function publishedEdition(db: D1Database, year: number) {
  const row = await db.prepare("SELECT published_json FROM editions WHERE year=?1").bind(year)
    .first<{ published_json: string | null }>();
  return row?.published_json ? JSON.parse(row.published_json) as Published : null;
}
