import type {MugDesign} from './edition.ts';
// Pixel's six approved photos. Artwork and order are fixed; captions remain editable.
export const curatedMugIds=["photo-43c6cd3158a64b469626b0df", "photo-2138236ac432446999697cf9", "photo-ad031a761afc4d1388a4e83f", "photo-e335f018d46f43db9c4e0790", "photo-71b8d35415fc42fe9bfa225c", "photo-db0461ce5fca42fea9974cf4"];
export function curatedMugChange(current:MugDesign[],next:MugDesign[]){
 if(!current.some(d=>curatedMugIds.includes(d.id)))return false;
 return current.length!==next.length||current.some((d,index)=>{const n=next[index];return !n||d.id!==n.id||d.alt!==n.alt||d.cutoutVersion!==n.cutoutVersion||!!d.cutoutEditable!==!!n.cutoutEditable;});
}
