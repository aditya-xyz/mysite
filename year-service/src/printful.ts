import {PrintProblem,type PrintEnv,type MailingAddress} from './printing.ts';
// @ts-expect-error Shared, deliberately curated style/font identifiers.
import {mugStyles,validMugOptions,mugConfiguration,activeMugCatalog} from '../web/mug-options.js';

export const MAX_MUG_CENTS=2500;
// Planning reserves, not a tax quote. Nov12 API audit: highest STANDARD mug
// shipping across NC/AK/HI was $9.89, plus the $0.40 holiday surcharge.
export const MUG_SHIPPING_RESERVE_CENTS=1100,MUG_TAX_RESERVE_CENTS=400;
// Highest measured STANDARD rates for each style/size across mainland US, AK
// and HI; add holiday surcharge + $0.50 buffer and round up to whole dollars.
const auditedShipping:Record<number,Record<string,number>>={19:{'11oz':669,'15oz':729,'20oz':879},300:{'11oz':669,'15oz':729},403:{'11oz':669,'15oz':729},407:{'12oz':469},837:{'12oz':669},663:{'25oz':989,'40oz':989}};
function shippingReserve(productId:number,size:string){const rate=auditedShipping[productId]?.[size];return rate===undefined?MUG_SHIPPING_RESERVE_CENTS:Math.ceil((rate+40+50)/100)*100;}
export const printfulEnabled=(env:PrintEnv)=>env.PRINTFUL_ENABLED==='true';
interface Variant {id:number;size:string;color:string;price:string;in_stock:boolean;availability_regions?:Record<string,string>;color_code?:string|null}
export interface MugVariant {id:number;size:string;color:string;colorCode:string;baseCents:number;shippingReserveCents:number;productCeilingCents:number;printWidth?:number;printHeight?:number}
export interface MugStyle {id:string;label:string;productId:number;sizes:string[];colors:string[];variants:MugVariant[];mockupGroup?:string;mockupOptions?:string[];careNote?:string}
export interface MugCatalog {provider:string;currency:string;maxCents:number;shippingReserveCents:number;taxReserveCents:number;styles:MugStyle[];destination:MailingAddress['country'];requiresDestinationEstimate:boolean}
export interface MugQuote {provider:'printful';currency:'USD';variantId:number;productId:number;subtotalCents:number;shippingCents:number;taxCents:number;otherCents:number;totalCents:number;maxCents:number;withinBudget:boolean;estimatedAt:number;destination?:string;shippingMethod?:string}
const aliases:Record<number,string>={19:'classic',403:'color-inside',837:'latte',300:'black-glossy',407:'enamel'};
interface Product {id:number;type:string;title:string}
interface Collection {id:string;productId:number;label:string}
const loading=new Map<string,Promise<MugStyle[]>>();
const colors:Record<string,string>={white:'#ffffff',black:'#050505',red:'#e32a2d',blue:'#1e9fcd'};
const catalogs=new Map<string,{until:number;styles:MugStyle[]}>();
function cents(value:unknown){
 if((typeof value!=='number'&&typeof value!=='string')||value==='')throw new PrintProblem(503,'Printful returned an incomplete price. Please try again later.');
 const number=Number(value);if(!Number.isFinite(number)||number<0)throw new PrintProblem(503,'Printful returned an incomplete price. Please try again later.');return Math.round(number*100);
}
// Only these access-check, catalog, mockup and estimate endpoints can be called. There is
// deliberately no order creation, confirmation, billing or fulfillment adapter.
export async function printfulApi(env:PrintEnv,path:'/oauth/scopes'|'/products'|`/products/${number}`|'/orders/estimate-costs'|'/shipping/rates'|`/mockup-generator/printfiles/${number}`|`/mockup-generator/create-task/${number}`|`/mockup-generator/task?task_key=${string}`,body?:unknown){
 if(!printfulEnabled(env)||!env.PRINTFUL_API_TOKEN)throw new PrintProblem(503,'Live mug pricing is temporarily unavailable. Please try again later.');
 try{
  const response=await fetch('https://api.printful.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env.PRINTFUL_API_TOKEN,'Content-Type':'application/json',...(env.PRINTFUL_STORE_ID?{'X-PF-Store-Id':env.PRINTFUL_STORE_ID}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'manual'});
  if(!response.ok)throw new PrintProblem(response.status===429?429:503,'Printful could not check this mug right now. Please try again later.',response.status===429?Math.max(1,Math.min(120,Number(response.headers.get('Retry-After'))||60)):undefined);
  const data=await response.json() as {result:unknown};if(!data.result||typeof data.result!=='object')throw new Error('Incomplete response');return data.result;
 }catch(error){if(error instanceof PrintProblem)throw error;throw new PrintProblem(503,'Printful could not check this mug right now. Please try again later.');}
}
async function style(env:PrintEnv,item:Collection,country:MailingAddress['country']='US'):Promise<MugStyle>{
 const data=await printfulApi(env,`/products/${item.productId}`) as {variants?:Variant[];product?:{description?:string}};
 if(!Array.isArray(data.variants))throw new PrintProblem(503,'Printful’s mug catalog is temporarily unavailable.');
 const variants=data.variants.filter(v=>v.in_stock===true&&(country!=='US'||v.availability_regions?.US)&&typeof v.size==='string'&&typeof v.color==='string').map(v=>({id:v.id,size:v.size.replace(/\s/g,''),color:v.color.toLowerCase(),colorCode:v.color_code||colors[v.color.toLowerCase()]||'#ffffff',baseCents:cents(v.price),shippingReserveCents:country==='US'?shippingReserve(item.productId,v.size.replace(/\s/g,'')):0,productCeilingCents:country==='US'?MAX_MUG_CENTS-MUG_TAX_RESERVE_CENTS-shippingReserve(item.productId,v.size.replace(/\s/g,'')):MAX_MUG_CENTS})).filter(v=>Number.isInteger(v.id)&&v.baseCents<=v.productCeilingCents);
 return {...item,...(/hand.wash only|not dishwasher/i.test(data.product?.description||'')||item.productId===407?{careNote:'Not dishwasher safe · hand wash only'}:{}),sizes:[...new Set(variants.map(v=>v.size))],colors:[...new Set(variants.map(v=>v.color))],variants};
}
export async function printfulCatalog(env:PrintEnv,refresh=false,country:MailingAddress['country']='US'):Promise<MugCatalog>{
 if(!printfulEnabled(env)||!env.PRINTFUL_API_TOKEN)throw new PrintProblem(503,'Live mug pricing is temporarily unavailable. Please try again later.');
 const key=env.PRINTFUL_API_TOKEN+':'+(env.PRINTFUL_STORE_ID||'store')+':'+country;
 if(refresh)catalogs.delete(key);
 let cached=catalogs.get(key);
 if(!cached||cached.until<Date.now()){
  if(!loading.has(key))loading.set(key,(async()=>{
   // Private persistent cache avoids refetching every product on cold isolates.
   const cacheKey=`providers/printful/${env.PRINTFUL_STORE_ID||'store'}/catalog-v8-${country}.json`;
   const stored=await env.MEDIA?.get(cacheKey);
   if(stored&&!refresh){const value=await stored.json<{until:number;styles:MugStyle[]}>();if(value.until>Date.now())return value.styles;}
   const products=await printfulApi(env,'/products') as Product[];
   if(!Array.isArray(products))throw new PrintProblem(503,'Printful’s mug catalog is temporarily unavailable.');
   const collection=products.filter(p=>p.type==='MUG'&&![407,837].includes(p.id)).map(p=>({id:aliases[p.id]||`mug-${p.id}`,productId:p.id,label:mugStyles.find((s:{id:string})=>s.id===aliases[p.id])?.label||p.title}));
   const styles:MugStyle[]=[];
   for(const item of collection){
    const result=await style(env,item,country);if(!result.variants.length)continue;
    const files=await printfulApi(env,`/mockup-generator/printfiles/${item.productId}`) as {printfiles?:{printfile_id:number;width:number;height:number}[];variant_printfiles?:{variant_id:number;placements:{default:number}}[];option_groups?:string[];options?:string[]};
    result.mockupGroup=['Default','Flat'].find(g=>files.option_groups?.includes(g));
    result.mockupOptions=files.options?.filter(option=>/^(front|left|right|handle on left|handle on right)$/i.test(option))||['Front'];
    for(const variant of result.variants){const mapping=files.variant_printfiles?.find(v=>v.variant_id===variant.id);const file=files.printfiles?.find(f=>f.printfile_id===mapping?.placements.default);if(file&&file.width>0&&file.height>0){variant.printWidth=file.width;variant.printHeight=file.height;}}
    styles.push(result);
   }
   styles.sort((a,b)=>a.id==='classic'?-1:b.id==='classic'?1:a.label.localeCompare(b.label));
   if(!styles.length)throw new PrintProblem(503,'No mugs currently fit the gift budget. Please try again later.');
   await env.MEDIA?.put(cacheKey,JSON.stringify({until:Date.now()+600000,styles}),{httpMetadata:{contentType:'application/json'}});
   return styles;
  })());
  try{cached={until:Date.now()+300000,styles:await loading.get(key)!};catalogs.set(key,cached);}finally{loading.delete(key);}
 }
 return activeMugCatalog({provider:'printful',currency:'USD',maxCents:MAX_MUG_CENTS,shippingReserveCents:country==='US'?MUG_SHIPPING_RESERVE_CENTS:0,taxReserveCents:country==='US'?MUG_TAX_RESERVE_CENTS:0,styles:cached.styles,destination:country,requiresDestinationEstimate:country!=='US'});
}

export async function reserveMugEstimate(env:PrintEnv,invitationId:string){
 const at=Math.floor(Date.now()/1000);
 for(const [key,max,seconds] of [[`mug-estimate:${invitationId}`,20,600],['mug-estimate:global',12,60]] as const){
  const row=await env.DB.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?1,1,?2)
   ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=?3 THEN 1 ELSE count+1 END,
   expires_at=CASE WHEN expires_at<=?3 THEN ?2 ELSE expires_at END RETURNING count,expires_at`).bind(key,at+seconds,at).first<{count:number;expires_at:number}>();
  if(!row||row.count>max)throw new PrintProblem(429,'Shipping estimates have reached their limit. Please try again later.',Math.max(1,(row?.expires_at||at+seconds)-at));
 }
}

export async function estimateMug(env:PrintEnv,configuration:unknown,address:MailingAddress):Promise<MugQuote>{
 const catalog=await printfulCatalog(env,false,address.country),options=validMugOptions(configuration,catalog.styles);if(!options)throw new PrintProblem(400,'Choose an available mug style, size, color and font.');
 const item=catalog.styles.find(i=>i.id===options.style)!;
 // Recheck availability for the exact combination, bypassing the catalog cache.
 const current=await style(env,item,address.country),variant=current.variants.find(v=>v.size===options.size&&v.color===options.color);
 if(!variant)throw new PrintProblem(409,'This mug combination is unavailable. Customize your mug and choose another option.');
 const recipient={address1:address.line1,address2:address.line2,city:address.city,country_code:address.country,zip:address.postalCode,...(address.country==='US'?{state_code:address.state}:address.country==='IN'?{state_name:address.state}:{})};
 const items=[{variant_id:variant.id,quantity:1}];
 let shipping='STANDARD';
 if(address.country!=='US'){
  const rates=await printfulApi(env,'/shipping/rates',{recipient,items,currency:'USD'}) as {id:string;rate:string;currency:string}[];
  if(!Array.isArray(rates))throw new PrintProblem(503,'Printful returned incomplete shipping options. Please try again later.');
  const options=rates.filter(rate=>typeof rate.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(rate.id)&&rate.currency==='USD').map(rate=>({...rate,cents:cents(rate.rate)})).sort((a,b)=>a.cents-b.cents);
  if(!options.length)throw new PrintProblem(409,'This mug cannot currently ship to your address. Customize your mug and choose another option.');
  shipping=options.find(rate=>rate.id==='STANDARD')?.id||options[0].id;
 }
 const result=await printfulApi(env,'/orders/estimate-costs',{currency:'USD',shipping,recipient,items}) as {costs?:Record<string,unknown>};
 const costs=result.costs;if(!costs||costs.currency!=='USD')throw new PrintProblem(503,'Printful returned an incomplete price. Please try again later.');
 const subtotalCents=cents(costs.subtotal),shippingCents=cents(costs.shipping),taxCents=cents(costs.tax)+cents(costs.vat),totalCents=cents(costs.total),discountCents=cents(costs.discount);
 const fees=['digitization','additional_fee','fulfillment_fee','retail_delivery_fee'].reduce((sum,key)=>sum+cents(costs[key]??0),0);
 // Reject omitted charges or inconsistent totals instead of understating cost.
 if(Math.abs(totalCents-(subtotalCents-discountCents+shippingCents+taxCents+fees))>2)throw new PrintProblem(503,'Printful returned an incomplete price. Please try again later.');
 return {provider:'printful',currency:'USD',variantId:variant.id,productId:item.productId,subtotalCents,shippingCents,taxCents,otherCents:fees-discountCents,totalCents,maxCents:MAX_MUG_CENTS,withinBudget:totalCents<=MAX_MUG_CENTS,destination:address.country,shippingMethod:shipping,estimatedAt:Math.floor(Date.now()/1000)};
}
