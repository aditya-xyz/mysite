// Work only on IDs still present in the supplied view; never include stale selections.
export function selectedItems(items,selection){return items.filter(item=>selection.has(item.id));}
export function setPhotosHidden(photos,selection,hidden){
  let changed=0;
  for(const photo of selectedItems(photos,selection))if(!!photo.hidden!==hidden){photo.hidden=hidden;changed++;}
  return changed;
}
export function removeDraftPhotos(draft,selection){
  const removed=selectedItems(draft.photos,selection).map(photo=>structuredClone(photo));
  draft.photos=draft.photos.filter(photo=>!selection.has(photo.id));
  return removed;
}
// Each request retains the server's existing draft/publication checks. A failure
// stays selected for review/retry while independent eligible deletions can finish.
export async function deleteSelectedMedia(items,remove,onProgress=()=>{}){
  const deleted=[],failed=[];
  for(const item of items){
    try{await remove(item.id);deleted.push(item.id);}
    catch(error){failed.push({id:item.id,filename:item.filename,message:error.message||'Deletion could not finish.'});}
    onProgress({completed:deleted.length+failed.length,total:items.length,deleted:deleted.length,failed:failed.length});
  }
  return {deleted,failed};
}
