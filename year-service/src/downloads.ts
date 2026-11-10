export const DOWNLOAD_LIMIT=5,DOWNLOAD_WINDOW=86400;
export async function reserveDownload(db:D1Database,inviteId:string,photoId:string,stamp:number){
  const row=await db.prepare(`INSERT INTO original_downloads(invite_id,photo_id,window_start,requests) VALUES(?1,?2,?3,1)
    ON CONFLICT(invite_id,photo_id) DO UPDATE SET
      requests=CASE WHEN window_start<=?4 THEN 1 ELSE requests+1 END,
      window_start=CASE WHEN window_start<=?4 THEN ?3 ELSE window_start END
    WHERE window_start<=?4 OR requests<5 RETURNING window_start,requests`)
    .bind(inviteId,photoId,stamp,stamp-DOWNLOAD_WINDOW).first<{window_start:number;requests:number}>();
  if(row)return {allowed:true as const,windowStart:row.window_start,remaining:DOWNLOAD_LIMIT-row.requests};
  const limit=await db.prepare('SELECT window_start FROM original_downloads WHERE invite_id=?1 AND photo_id=?2').bind(inviteId,photoId).first<{window_start:number}>();
  return {allowed:false as const,retryAfter:Math.max(1,(limit?.window_start??stamp)+DOWNLOAD_WINDOW-stamp)};
}
export async function releaseDownload(db:D1Database,inviteId:string,photoId:string,windowStart:number){
  await db.prepare('UPDATE original_downloads SET requests=max(0,requests-1) WHERE invite_id=?1 AND photo_id=?2 AND window_start=?3').bind(inviteId,photoId,windowStart).run();
}
