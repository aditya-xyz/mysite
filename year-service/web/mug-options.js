// Provisional simulation choices, not a live Printful catalog or price quote.
export const mugStyles=[
 {id:'classic',label:'Classic ceramic',sizes:['11oz','15oz'],colors:['white']},
 {id:'color-inside',label:'Color inside',sizes:['11oz','15oz'],colors:['black','red','blue']},
 {id:'latte',label:'Latte',sizes:['12oz'],colors:['white']},
];
export const mugFonts=[{id:'clean',label:'Clean',family:'Asap, sans-serif'},{id:'serif',label:'Bookish',family:'Georgia, serif'},{id:'handwritten',label:'Handwritten',family:'Caveat, cursive'}];
export const pixelMugOptions=()=>({style:'classic',size:'11oz',color:'white',font:'clean'});
export function validMugOptions(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const style=mugStyles.find(s=>s.id===value.style);
 if(!style||!style.sizes.includes(value.size)||!style.colors.includes(value.color)||!mugFonts.some(f=>f.id===value.font))return null;
 return {style:style.id,size:value.size,color:value.color,font:value.font};
}
export function mugOptionsLabel(value){
 const o=validMugOptions(value)||pixelMugOptions();
 return `${mugStyles.find(s=>s.id===o.style).label} · ${o.size} · ${o.color} · ${mugFonts.find(f=>f.id===o.font).label}`;
}
