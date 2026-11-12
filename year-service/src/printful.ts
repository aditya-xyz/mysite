import {PrintProblem,type PrintEnv,type MailingAddress} from './printing.ts';
// @ts-expect-error Shared, deliberately curated style/font identifiers.
import {mugStyles,validMugOptions} from '../web/mug-options.js';

export const MAX_MUG_CENTS=2500;
export const printfulEnabled=(env:PrintEnv)=>env.PRINTFUL_ENABLED==='true';
interface Variant {id:number;size:string;color:string;price:string;in_stock:boolean;availability_regions?:Record<string,string>}
export interface MugVariant {id:number;size:string;color:string;colorCode:string;baseCents:number;printWidth?:number;printHeight?:number}
export interface MugStyle {id:string;label:string;productId:number;sizes:string[];colors:string[];variants:MugVariant[]}
export interface MugQuote {provider:'printful';currency:'USD';variantId:number;productId:number;subtotalCents:number;shippingCents:number;taxCents:number;otherCents:number;totalCents:number;maxCents:number;withinBudget:boolean;estimatedAt:number}
const collection=[{id:'classic',productId:19},{id:'color-inside',productId:403},{id:'latte',productId:837}];
const colors:Record<string,string>={white:'#ffffff',black:'#050505',red:'#e32a2d',blue:'#1e9fcd'};
let cached:{credential:string;until:number;styles:MugStyle[]}|undefined;
function cents(value:unknown){
 if((typeof value!=='number'&&typeof value!=='string')||value==='')throw new PrintProblem(503,'Printful returned an incomplete price. Please try again later.');
 const number=Number(value);if(!Number.isFinite(number)||number<0)throw new PrintProblem(503,'Printful returned an incomplete price. Please try again later.');return Math.round(number*100);
}
// Only these catalog, mockup and estimate endpoints can be called. There is
// deliberately no order creation, confirmation, billing or fulfillment adapter.
export async function printfulApi(env:PrintEnv,path:`/products/${number}`|'/orders/estimate-costs'|`/mockup-generator/printfiles/${number}`|`/mockup-generator/create-task/${number}`|`/mockup-generator/task?task_key=${string}`,body?:unknown){
 if(!printfulEnabled(env)||!env.PRINTFUL_API_TOKEN)throw new PrintProblem(503,'Live mug pricing is temporarily unavailable. Please try again later.');
 try{
  const response=await fetch('https://api.printful.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env.PRINTFUL_API_TOKEN,'Content-Type':'application/json',...(env.PRINTFUL_STORE_ID?{'X-PF-Store-Id':env.PRINTFUL_STORE_ID}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'manual'});
  if(!response.ok)throw new PrintProblem(response.status===429?429:503,'Printful could not check this mug right now. Please try again later.');
  const data=await response.json() as {result:unknown};if(!data.result||typeof data.result!=='object')throw new Error('Incomplete response');return data.result;
 }catch(error){if(error instanceof PrintProblem)throw error;throw new PrintProblem(503,'Printful could not check this mug right now. Please try again later.');}
}
async function style(env:PrintEnv,item:typeof collection[number]):Promise<MugStyle>{
 const data=await printfulApi(env,`/products/${item.productId}`) as {variants?:Variant[]};
 if(!Array.isArray(data.variants))throw new PrintProblem(503,'Printful’s mug catalog is temporarily unavailable.');
 const allowed=mugStyles.find((s:{id:string})=>s.id===item.id);
 const variants=data.variants.filter(v=>v.in_stock===true&&v.availability_regions?.US&&allowed.sizes.includes(v.size.replace(/\s/g,''))&&allowed.colors.includes(v.color.toLowerCase())).map(v=>({id:v.id,size:v.size.replace(/\s/g,''),color:v.color.toLowerCase(),colorCode:colors[v.color.toLowerCase()],baseCents:cents(v.price)})).filter(v=>Number.isInteger(v.id)&&v.baseCents<=MAX_MUG_CENTS);
 return {...item,label:allowed.label,sizes:allowed.sizes.filter((s:string)=>variants.some(v=>v.size===s)),colors:allowed.colors.filter((c:string)=>variants.some(v=>v.color===c)),variants};
}
export async function printfulCatalog(env:PrintEnv){
 if(!printfulEnabled(env)||!env.PRINTFUL_API_TOKEN)throw new PrintProblem(503,'Live mug pricing is temporarily unavailable. Please try again later.');
 if(!cached||cached.credential!==env.PRINTFUL_API_TOKEN||cached.until<Date.now()){
  // Sequential requests avoid a burst against Printful's catalog rate limit.
  const styles:MugStyle[]=[];for(const item of collection){
   const result=await style(env,item);if(!result.variants.length)continue;
   const files=await printfulApi(env,`/mockup-generator/printfiles/${item.productId}`) as {printfiles?:{printfile_id:number;width:number;height:number}[];variant_printfiles?:{variant_id:number;placements:{default:number}}[]};
   for(const variant of result.variants){const mapping=files.variant_printfiles?.find(v=>v.variant_id===variant.id);const file=files.printfiles?.find(f=>f.printfile_id===mapping?.placements.default);if(file&&file.width>0&&file.height>0){variant.printWidth=file.width;variant.printHeight=file.height;}}
   styles.push(result);
  }
  if(!styles.length)throw new PrintProblem(503,'No mugs are currently available. Please try again later.');
  cached={credential:env.PRINTFUL_API_TOKEN,until:Date.now()+300000,styles};
 }
 return {provider:'printful',currency:'USD',maxCents:MAX_MUG_CENTS,styles:cached.styles};
}
export async function estimateMug(env:PrintEnv,configuration:unknown,address:MailingAddress):Promise<MugQuote>{
 const options=validMugOptions(configuration);if(!options)throw new PrintProblem(400,'Choose an available mug style, size, color and font.');
 const item=collection.find(i=>i.id===options.style)!;
 // Recheck availability for the exact combination, bypassing the catalog cache.
 const current=await style(env,item),variant=current.variants.find(v=>v.size===options.size&&v.color===options.color);
 if(!variant)throw new PrintProblem(409,'This mug combination is unavailable. Customize your mug and choose another option.');
 const result=await printfulApi(env,'/orders/estimate-costs',{currency:'USD',shipping:'STANDARD',recipient:{address1:address.line1,address2:address.line2,city:address.city,state_code:address.state,country_code:address.country,zip:address.postalCode},items:[{variant_id:variant.id,quantity:1}]}) as {costs?:Record<string,unknown>};
 const costs=result.costs;if(!costs||costs.currency!=='USD')throw new PrintProblem(503,'Printful returned an incomplete price. Please try again later.');
 const subtotalCents=cents(costs.subtotal),shippingCents=cents(costs.shipping),taxCents=cents(costs.tax)+cents(costs.vat),totalCents=cents(costs.total),discountCents=cents(costs.discount);
 const fees=['digitization','additional_fee','fulfillment_fee','retail_delivery_fee'].reduce((sum,key)=>sum+cents(costs[key]??0),0);
 // Reject omitted charges or inconsistent totals instead of understating cost.
 if(Math.abs(totalCents-(subtotalCents-discountCents+shippingCents+taxCents+fees))>2)throw new PrintProblem(503,'Printful returned an incomplete price. Please try again later.');
 return {provider:'printful',currency:'USD',variantId:variant.id,productId:item.productId,subtotalCents,shippingCents,taxCents,otherCents:fees-discountCents,totalCents,maxCents:MAX_MUG_CENTS,withinBudget:totalCents<=MAX_MUG_CENTS,estimatedAt:Math.floor(Date.now()/1000)};
}
