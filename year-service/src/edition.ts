export interface DraftPhoto { id: string; caption: string; alt: string; recipients: string[] }
export interface Story { id: string; title: string; body: string }
export interface Draft {
  title: string; authors: string; intro: string; note: string; sharedTitle: string;
  stories: Story[]; photos: DraftPhoto[];
}
export interface PublishedPhoto extends DraftPhoto {
  preview_key: string; original_key: string | null; filename: string; mime: string; width?:number; height?:number;
}
export interface Published extends Omit<Draft, "photos"> { photos: PublishedPhoto[] }
export const visiblePhotos = (edition: Published, recipient: string, personId:string|string[]=recipient) =>
  edition.photos.filter(p => p.recipients.length === 0 || (p.recipients.includes(recipient) || (Array.isArray(personId)?personId:[personId]).some(id=>p.recipients.includes(id))));
export function clientEdition(edition: Published, recipient: string, name: string, year: number, personId:string|string[]=recipient) {
  return { year, name, title: edition.title, authors: edition.authors, intro: edition.intro,
    note: edition.note, sharedTitle: edition.sharedTitle, stories: edition.stories,
    photos: visiblePhotos(edition, recipient, personId).map(p => ({ id: p.id, caption: p.caption, alt: p.alt,
      width:p.width,height:p.height,personal: p.recipients.length > 0, src: `/api/media/${p.id}`,
      canSave: p.recipients.length > 0 && !!p.original_key })) };
}
export async function publishedEdition(db: D1Database, year: number) {
  const row = await db.prepare("SELECT published_json FROM editions WHERE year=?1").bind(year)
    .first<{ published_json: string | null }>();
  return row?.published_json ? JSON.parse(row.published_json) as Published : null;
}
