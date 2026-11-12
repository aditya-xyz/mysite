import {esc,assetPath} from './pixelbook.js';
// One deterministic print layout for review and receipt. This is an illustration,
// not a provider proof: no mockup request, generated lettering, or external assets.
export function mugPreview(design){
 if(!design||!assetPath(design.src))return '<p>Your chosen mug design is saved.</p>';
 return `<figure class="pb-mug-preview"><div class="pb-mug-stage"><div class="pb-mug-handle" aria-hidden="true"></div><div class="pb-mug-ceramic"><div class="pb-mug-print"><img src="${esc(assetPath(design.src))}" alt="${esc(design.alt||'Pixel on your chosen mug')}"><p class="${String(design.caption||'').length>120?'pb-mug-long-caption':''}">${esc(design.caption||'')}</p></div></div></div><figcaption>Illustrative preview · final placement may vary</figcaption></figure>`;
}
