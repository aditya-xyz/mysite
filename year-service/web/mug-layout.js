import {mugPlacementGuides} from './mug-placement-guides.js';
// Bump whenever guide calibration, artwork, or composition changes.
export const MUG_LAYOUT_VERSION=3;
export const MUG_RENDER_WIDTH=2400;
export const mugPlacementGuide=(productId,width,height)=>mugPlacementGuides[`${productId}:${width}x${height}`]||null;
export function mugPrintLayout(width,height,variant){
 const guide=mugPlacementGuide(variant.productId,variant.printWidth,variant.printHeight);
 if(!guide)throw new Error('This mug size needs a verified placement guide.');
 const selectedCenter=width*guide.left,santaCenter=width*guide.right;
 // Keep the widest caption inside the print boundary for narrow black mugs too.
 const room=Math.min(selectedCenter,width-santaCenter,(santaCenter-selectedCenter)/2);
 const panelSize=Math.min(height,room/.6);
 return {selectedCenter,santaCenter,panelSize,top:(height-panelSize)/2};
}
