import {mugPlacementGuides} from './mug-placement-guides.js';
// Bump whenever guide calibration, artwork, or composition changes.
export const MUG_LAYOUT_VERSION=4;
export const MUG_RENDER_WIDTH=2400;
// Frozen orders may use a previous verified layout. Include current per-area
// versions so a calibrated renderer and live fulfillment cannot drift apart.
// Version 5 was the verified black 15oz centering layout, superseded by 6.
const verifiedLayoutVersions=new Set([MUG_LAYOUT_VERSION,5,...Object.values(mugPlacementGuides).map(guide=>guide.layoutVersion||MUG_LAYOUT_VERSION)]);
export const verifiedMugLayoutVersion=version=>verifiedLayoutVersions.has(version);
export const mugPlacementGuide=(productId,width,height)=>mugPlacementGuides[`${productId}:${width}x${height}`]||null;
// Scope artwork invalidation to a recalibrated print area; keep other proofs.
export const mugLayoutVersion=(variant)=>mugPlacementGuide(variant.productId,variant.printWidth,variant.printHeight)?.layoutVersion||MUG_LAYOUT_VERSION;
export function mugPrintLayout(width,height,variant){
 const guide=mugPlacementGuide(variant.productId,variant.printWidth,variant.printHeight);
 if(!guide)throw new Error('This mug size needs a verified placement guide.');
 const selectedCenter=width*guide.left,santaCenter=width*guide.right;
 // Keep the widest caption inside the print boundary for narrow black mugs too.
 const room=Math.min(selectedCenter,width-santaCenter,(santaCenter-selectedCenter)/2);
 const panelSize=Math.min(height,room/.6);
 return {selectedCenter,santaCenter,panelSize,top:(height-panelSize)/2};
}
