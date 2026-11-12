const sparkle='<svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M16 2v28M2 16h28M6.1 6.1l19.8 19.8M6.1 25.9 25.9 6.1"/></svg>';
// Presentation only. Private images and gift capabilities arrive with the authorized journal.
export const householdGiftLine = 'one per household. i have dad’s credit card, not generational wealth.';
export const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Keep journal-provided image paths on this origin, including in local previews.
export function assetPath(value){return typeof value==='string'&&/^\/(?!\/)[a-zA-Z0-9/_.,-]+(?:\?version=[a-f0-9]{32})?$/.test(value)?value:'';}
export function hasMugChoices(journal){return !!journal.gift?.enabled&&new Set((journal.gift.designs||[]).filter(d=>d.id&&assetPath(d.src)).map(d=>d.id)).size>=4;}
export function themePhoto(journal,key,alt,className=''){
  const src=assetPath(journal.themeAssets?.[key]);
  return src?`<img class="${esc(className)}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`:'';
}
export function openingMarkup(journal){
  const note=journal.pixelNote || journal.note || 'i made a scrapbook. dad did the clicking and typing and other thumb-related tasks, but the vision was mine.';
  const noteMarkup=note.split(/\n\s*\n/).filter(part=>part.trim()).map(part=>`<p>${esc(part)}</p>`).join('');
  return `<section class="pb-cover" aria-labelledby="pb-title"><div class="pb-cover-copy"><h1 id="pb-title">pixelbook<span class="pb-title-period">.</span></h1><p class="pb-cover-note">a few adventures, some questionable decisions,<br class="pb-desktop-break"> and my favorite people. you made the cut.</p></div><figure class="pb-cover-portrait"><div class="pb-cover-art"><span class="pb-tape" aria-hidden="true"></span><img class="pb-santa" src="/pixel-santa.png" alt="Pixel wearing her Santa hat" width="369" height="400" fetchpriority="high"><span class="pb-cover-seal">made with love.<br>and no thumbs.</span><span class="pb-spark pb-spark-one" aria-hidden="true">${sparkle}</span><span class="pb-spark pb-spark-two" aria-hidden="true">${sparkle}</span></div><figcaption class="pb-cover-credit">photos by dad. creative direction and sass by me.</figcaption></figure></section>
  <section class="pb-letter" id="pb-letter" aria-labelledby="pb-letter-title"><div class="pb-letter-copy"><p class="pb-eyebrow">a note from your editor</p><p class="pb-letter-greeting">oh, it’s you.<span class="pb-tail-line">my <span class="pb-tail-word">tail</span> knew first.</span></p><h2 id="pb-letter-title"><em class="pb-recipient-hello">Hi ${esc(journal.name)}!</em></h2>${noteMarkup}<p class="signoff">love, Pixel</p></div>${themePhoto(journal,'welcome','Pixel tilting her head on a sunny trail','pb-letter-photo')}</section>`;
}
export function sectionHeading(number,title,note,id='',pairedTitle=''){
  const exchange='<svg class="pb-friends-arrow" viewBox="0 0 40 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12c0-5 4-7 9-7h16m-6-4 6 4-6 4"/><path d="M31 20c0 5-4 7-9 7H6m6-4-6 4 6 4"/></svg>';
  const heading=pairedTitle?`<span>${esc(title)}</span><span class="pb-friends-pair">${exchange}<span>${esc(pairedTitle)}</span></span>`:esc(title);
  return `<div class="pb-section-heading">${number?`<span class="pb-section-number">${esc(number)}</span>`:''}<div><h2 ${id?`id="${esc(id)}"`:''} ${pairedTitle?`class="pb-friends-title" aria-label="${esc(title)} are ${esc(pairedTitle)}"`:''}>${heading}</h2><p>${esc(note)}</p></div><span class="pb-section-flower" aria-hidden="true">${sparkle}</span></div>`;
}
export function giftMarkup(journal){
  if(!hasMugChoices(journal))return '';
  const portraits=(journal.gift.designs||[]).filter(d=>d.id&&assetPath(d.src)).slice(0,4);
  return `<section class="pb-gift" id="pb-gift" aria-labelledby="pb-gift-title"><div class="pb-gift-copy"><h2 id="pb-gift-title">i got you<br><em>something.</em></h2><p>a mug. with my face on it.<br>i know. how did i know what you wanted?</p><p class="pb-budget">${householdGiftLine}</p><button type="button" class="button" data-open-gift>${journal.gift.hasOrder?'view your household’s gift':'pick your mugshot'}</button><p class="pb-gift-allowance">one complimentary mug for ${esc(journal.name)}</p></div><div class="pb-gift-photo"><button class="pb-mugshot-stack" data-preview-design="${esc(portraits[0].id)}" type="button" aria-label="Show next mugshot">${portraits.map((d,i)=>`<img src="${esc(assetPath(d.src))}" alt="" loading="lazy" decoding="async" data-mugshot-id="${esc(d.id)}" data-stack-position="${i}">`).join('')}</button><span class="pb-stack-hint" aria-hidden="true">tap for another</span><span class="pb-gift-sticker">dad’s treat.<br>my idea.</span></div></section>`;
}
export function footerMarkup(journal){
  return `${themePhoto(journal,'closing','Pixel sleeping against the couch','pb-closing-photo')}<p class="pb-eyebrow">that’s my year. thanks for being in it.</p><p class="footer-closing">same time next year?</p><p class="signoff">love, Pixel</p><span class="pb-footer-wordmark">pixelbook.</span><span class="pb-footer-credits"></span>`;
}
