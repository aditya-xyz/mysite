// Curated identifiers; availability and account prices come from the server.
// These static choices also support receipts and offline design previews.
export const mugStyles=[
 {id:'enamel',label:'Enamel mug',sizes:['12oz'],colors:['white'],careNote:'Not dishwasher safe · hand wash only'},
 {id:'classic',label:'Classic ceramic',sizes:['11oz','15oz','20oz'],colors:['white']},
 {id:'color-inside',label:'Color inside',sizes:['11oz','15oz'],colors:['black','red','blue','dark blue']},
 {id:'black-glossy',label:'Black glossy mug',sizes:['11oz','15oz'],colors:['black']},
 {id:'latte',label:'Latte',sizes:['12oz'],colors:['white']},
];
export const mugFonts=[{id:'clean',label:'Clean',family:'Asap, sans-serif'},{id:'serif',label:'Bookish',family:'Georgia, serif'},{id:'handwritten',label:'Handwritten',family:'Caveat, cursive'}];
export const pixelMugOptions=()=>({style:'enamel',size:'12oz',color:'white',font:'clean'});
export const legacyMugOptions=()=>({style:'classic',size:'11oz',color:'white',font:'clean'});
export function preferredMugOptions(styles=mugStyles){
 const preferred=pixelMugOptions();
 if(styles.some(s=>s.id===preferred.style&&s.sizes.includes(preferred.size)&&s.colors.includes(preferred.color)&&(!s.variants||s.variants.some(v=>v.size===preferred.size&&v.color===preferred.color))))return preferred;
 const s=styles[0],v=s.variants?.[0];return {style:s.id,size:v?.size||s.sizes[0],color:v?.color||s.colors[0],font:'clean'};
}
export function mugConfiguration(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 if(typeof value.style!=='string'||!/^([a-z][a-z0-9-]{0,40})$/.test(value.style)||typeof value.size!=='string'||!value.size||value.size.length>40||typeof value.color!=='string'||!value.color||value.color.length>80||!mugFonts.some(f=>f.id===value.font))return null;
 return {style:value.style,size:value.size,color:value.color,font:value.font};
}
export function validMugOptions(value,styles=mugStyles){
 const o=mugConfiguration(value),style=o&&styles.find(s=>s.id===o.style);
 return style&&style.sizes.includes(o.size)&&style.colors.includes(o.color)&&(!style.variants||style.variants.some(v=>v.size===o.size&&v.color===o.color))?o:null;
}
export function mugOptionsLabel(value,styles=mugStyles){
 const o=mugConfiguration(value)||legacyMugOptions();
 return `${styles.find(s=>s.id===o.style)?.label||'Photo mug'} · ${o.size} · ${o.color} · ${mugFonts.find(f=>f.id===o.font).label}`;
}
