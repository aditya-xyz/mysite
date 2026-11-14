// Versioned once for artwork, cached proofs, and future fulfillment payloads.
export const MUG_LAYOUT_VERSION=2;
export const MUG_RENDER_WIDTH=2400;
export function mugPrintLayout(width,height){
 // Quarter points face the viewer with the handle left / right. Leave breathing
 // room vertically, and never let the two panels overlap on narrower wraps.
 const panelSize=Math.min(height,width/2.4);
 return {selectedCenter:width*.25,santaCenter:width*.75,panelSize,top:(height-panelSize)/2};
}
