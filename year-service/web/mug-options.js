// Curated identifiers; availability and account prices come from the server.
// These static choices also support receipts and offline design previews.
export const mugStyles=[
 {id:'classic',label:'Classic ceramic',sizes:['11oz','15oz'],colors:['white']},
 {id:'color-inside',label:'Color inside',sizes:['11oz','15oz'],colors:['black','red','blue']},
 {id:'latte',label:'Latte',sizes:['12oz'],colors:['white']},
];
export const mugFonts=[{id:'clean',label:'Clean',family:'Asap, sans-serif'},{id:'serif',label:'Bookish',family:'Georgia, serif'},{id:'handwritten',label:'Handwritten',family:'Caveat, cursive'}];
export const pixelMugOptions=()=>({style:'classic',size:'11oz',color:'white',font:'clean'});
export function preferredMugOptions(styles=mugStyles){
 const preferred=pixelMugOptions();
 if(styles.some(s=>s.id===preferred.style&&s.sizes.includes(preferred.size)&&s.colors.includes(preferred.color)&&(!s.variants||s.variants.some(v=>v.size===preferred.size&&v.color===preferred.color))))return preferred;
 const s=styles[0],v=s.variants?.[0];return {style:s.id,size:v?.size||s.sizes[0],color:v?.color||s.colors[0],font:'clean'};
}
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
