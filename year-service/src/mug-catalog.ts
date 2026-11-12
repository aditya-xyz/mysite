import type {MugDesign} from './edition.ts';
// Pixel's six approved photos. Artwork stays fixed; captions and display order remain editable.
export const curatedMugIds=["photo-43c6cd3158a64b469626b0df", "photo-2138236ac432446999697cf9", "photo-ad031a761afc4d1388a4e83f", "photo-e335f018d46f43db9c4e0790", "photo-71b8d35415fc42fe9bfa225c", "photo-db0461ce5fca42fea9974cf4"];
export function curatedMugChange(current:MugDesign[],next:MugDesign[]){
 if(!current.some(d=>curatedMugIds.includes(d.id)))return false;
 const byId=new Map(next.map(d=>[d.id,d]));
 return current.length!==next.length||byId.size!==next.length||current.some(d=>{const n=byId.get(d.id);return !n||d.alt!==n.alt||d.cutoutVersion!==n.cutoutVersion||!!d.cutoutEditable!==!!n.cutoutEditable;});
}
