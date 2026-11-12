import {pixelMugOptions,validMugOptions} from './mug-options.js';
import {esc,assetPath} from './pixelbook.js';
// One deterministic print layout for review and receipt. This is an illustration,
// not a provider proof: no mockup request, generated lettering, or external assets.
export function mugPreview(design,configuration){
 const o=validMugOptions(configuration)||pixelMugOptions();
 if(!design||!assetPath(design.src))return '<p>Your chosen mug design is saved.</p>';
 return `<figure class="pb-mug-preview" data-mug-style="${esc(o.style)}" data-mug-size="${esc(o.size)}" data-mug-color="${esc(o.color)}" data-mug-font="${esc(o.font)}"><div class="pb-mug-stage"><div class="pb-mug-handle" aria-hidden="true"></div><div class="pb-mug-ceramic"><div class="pb-mug-print"><img src="${esc(assetPath(design.src))}" alt="${esc(design.alt||'Pixel on your chosen mug')}"><p class="${String(design.caption||'').length>120?'pb-mug-long-caption':''}">${esc(design.caption||'')}</p></div></div></div><figcaption>Illustrative preview · final placement may vary</figcaption></figure>`;
}
