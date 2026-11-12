import {pixelMugOptions,mugConfiguration} from './mug-options.js';
import {esc,assetPath} from './pixelbook.js';
export function mugLoadingPreview(){return '<figure class="pb-mug-preview pb-live-preview"><div class="pb-mockup-wait"><span class="pb-preview-spinner" aria-hidden="true"></span><span role="status" data-mockup-status>Preparing your mug preview…</span></div><figcaption>Printful mockup · final placement may vary</figcaption></figure>';}
// One deterministic print layout for review and receipt. This is an illustration,
// not a provider proof: no mockup request, generated lettering, or external assets.
export function mugPreview(design,configuration){
 const o=mugConfiguration(configuration)||pixelMugOptions();
 if(!design||!assetPath(design.src))return '<p>Your chosen mug design is saved.</p>';
 if(assetPath(design.mockupSrc))return `<figure class="pb-mug-preview"><img class="pb-printful-mockup" src="${esc(assetPath(design.mockupSrc))}" alt="${esc(design.alt||'Your Printful mug preview')}"><figcaption>Printful mockup · final placement may vary</figcaption></figure>`;
 return `<figure class="pb-mug-preview" data-mug-style="${esc(o.style)}" data-mug-size="${esc(o.size)}" data-mug-color="${esc(o.color)}" data-mug-font="${esc(o.font)}"><div class="pb-mug-stage"><div class="pb-mug-handle" aria-hidden="true"></div><div class="pb-mug-ceramic"><div class="pb-mug-print"><img src="${esc(assetPath(design.src))}" alt="${esc(design.alt||'Pixel on your chosen mug')}"><p class="${String(design.caption||'').length>120?'pb-mug-long-caption':''}">${esc(design.caption||'')}</p></div></div></div><figcaption>Illustrative preview · final placement may vary</figcaption></figure>`;
}
