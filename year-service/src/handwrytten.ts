import {imageDimensions} from './image-dimensions.ts';
import {PrintProblem} from './printing.ts';
export interface HandwryttenEnv {HANDWRYTTEN_API_KEY?:string;PRINT_ORDER_MODE?:string}
// Submission and basket mutations are reachable only through the Test Mode gate below.
// Test-mode toggles and live payment adapters are never enabled.
// /outbound/process is the documented pricing preview, not /outbound/addToBasket.
const allowed=new Set(['/checkauth/auth','/design/dimensions','/basket/count','/cards/uploadCustomLogo','/cards/createCustomCard','/cards/view','/fonts/list','/profile/listAddresses','/outbound/process','/countries/list','/basket/allNew','/orders/placeBasket','/basket/send','/basket/remove','/orders/details']);
async function api(env:HandwryttenEnv,path:string,body?:Record<string,unknown>|FormData){
 if(!env.HANDWRYTTEN_API_KEY)throw new PrintProblem(503,'Handwrytten is not connected.');
 if(!allowed.has(path.split('?')[0]))throw new PrintProblem(400,'Only Handwrytten diagnostics and card preparation are enabled.');
 const form=body instanceof FormData;
 let response:Response;try{response=await fetch('https://api.handwrytten.com/v2'+path,{method:body?'POST':'GET',headers:{Authorization:env.HANDWRYTTEN_API_KEY,...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw new PrintProblem(503,'Handwrytten is temporarily unavailable.');}
 if(!response.ok)throw new PrintProblem(502,'Handwrytten could not complete the preview request.');
 let result:Record<string,any>;try{result=await response.json() as Record<string,any>;}catch{throw new PrintProblem(502,'Handwrytten returned an invalid preview response.');}
 if(!response.ok||String(result.status).toLowerCase()!=='ok')throw new PrintProblem(502,'Handwrytten could not complete the preview request.');
 return result;
}
export async function handwryttenStatus(env:HandwryttenEnv){
 if(!env.HANDWRYTTEN_API_KEY)return {connected:false,testMode:false,ordering:'simulation',submissionEnabled:false};
 const auth=await api(env,'/checkauth/auth'),formats=await api(env,'/design/dimensions');
 return {connected:true,testMode:Number(auth.test_mode)===1,ordering:env.PRINT_ORDER_MODE==='handwrytten_test'?'handwrytten_test':'simulation',submissionEnabled:env.PRINT_ORDER_MODE==='handwrytten_test'&&Number(auth.test_mode)===1,formats:(formats.dimensions||[]).map((d:any)=>({id:d.id,orientation:d.orientation,width:d.open_width,height:d.open_height,format:d.format}))};
}
// This creates a reusable card design only. Call only with explicitly approved artwork.
export async function prepareHandwryttenCard(env:HandwryttenEnv,artwork:File,name:string){
 const status=await handwryttenStatus(env);if(!status.testMode)throw new PrintProblem(409,'Enable Handwrytten Test Mode before preparing test cards.');
 const format=status.formats?.find((d:any)=>d.id===2&&d.orientation==='portrait'&&d.format==='flat');if(!format)throw new PrintProblem(409,'The portrait card format is unavailable.');
 if(!['image/jpeg','image/png'].includes(artwork.type)||artwork.size>6*1024*1024)throw new PrintProblem(400,'Use a card preview image under 6 MB.');
 const dimensions=imageDimensions(new Uint8Array(await artwork.arrayBuffer()));
 if(!dimensions||dimensions.width<1500||dimensions.height<2100)throw new PrintProblem(400,'Use a portrait print image at least 1500 by 2100 pixels.');
 const form=new FormData();form.set('type','cover');form.set('file',artwork);
 const image=await api(env,'/cards/uploadCustomLogo',form);if(!Number.isInteger(image.id))throw new PrintProblem(502,'The preview artwork could not be saved.');
 const card=await api(env,'/cards/createCustomCard',{name:name.slice(0,100),dimension_id:format.id,cover_id:image.id,cover_size_percent:100,footer_type:'text',footer_text:'',footer_font_id:1,footer_font_size:12,footer_font_color:'#20392f',footer_align:'center'});
 return {prepared:true,cardId:card.card_id??card.id,dimensionId:format.id,testMode:true,submitted:false};
}


export const handwryttenPrintFont={font:'hwMadeline',font_size:13,auto_font_size:true} as const;
// Only prepares an immutable design. No message, address, basket or payment is sent.
export async function prepareHandwryttenFoldedCard(env:HandwryttenEnv,input:{front:File;inside?:File;back:File;backId?:number;cardId?:number;name:string;onBack:(id:number)=>Promise<void>;onCard:(id:number)=>Promise<void>}){
 const status=await handwryttenStatus(env);
 if(!status.testMode)throw new PrintProblem(409,'Enable Handwrytten Test Mode before preparing previews.');
 if(!status.formats?.some((d:any)=>Number(d.id)===4&&d.orientation==='portrait'&&d.format==='folded'))throw new PrintProblem(503,'The folded card format is unavailable.');
 const fonts=await api(env,'/fonts/list');
 if(!fonts.fonts?.some((f:any)=>f.id===handwryttenPrintFont.font))throw new PrintProblem(503,'The print handwriting font is unavailable.');
 async function upload(file:File,type:string){
  const form=new FormData();form.set('type',type);form.set('file',file);
  const result=await api(env,'/cards/uploadCustomLogo',form);
  if(!Number.isInteger(result.id)||result.id<=0)throw new PrintProblem(502,'The preview image could not be saved.');return result.id as number;
 }
 let cardId=input.cardId;
 if(!cardId){
  let backId=input.backId;if(!backId){backId=await upload(input.back,'logo');await input.onBack(backId);}
  const frontId=await upload(input.front,'cover'),insideId=input.inside?await upload(input.inside,'logo'):null;
  const card=await api(env,'/cards/createCustomCard',{
   name:input.name.slice(0,100),dimension_id:4,cover_id:frontId,cover_size_percent:90,
   ...(insideId?{main_type:'logo',main_logo_id:insideId,main_logo_size_percent:100}:{main_type:'text',main_text:'',main_font_id:1,main_font_size:12,main_font_color:'#244637',main_align:'center'}),
   header_type:'text',header_text:'',header_font_id:1,header_font_size:12,header_font_color:'#244637',header_align:'center',
   footer_type:'text',footer_text:'',footer_font_id:1,footer_font_size:12,footer_font_color:'#244637',footer_align:'center',
   back_type:'logo',back_logo_id:backId,back_size_percent:40,back_text:'',back_font_id:1,back_font_size:14,back_font_color:'#244637',back_align:'center',back_vertical_align:'bottom'
  });
  cardId=card.card_id??card.id;
  if(!Number.isInteger(cardId)||Number(cardId)<=0)throw new PrintProblem(502,'The folded design could not be saved.');await input.onCard(cardId!);
 }
 const detail=await api(env,'/cards/view?card_id='+cardId),images=detail.card?.images;
 const proofs={} as Record<'front'|'inside'|'back',string>;
 for(const side of ['front','inside','back'] as const){
  const value=images?.[side]?.[0]?.image;let url:URL;try{url=new URL(value);}catch{throw new PrintProblem(502,'The card proof is not ready. Try again.');}
  if(url.protocol!=='https:'||url.hostname!=='d3e924qpzqov0g.cloudfront.net'||url.port||!url.pathname.startsWith('/cardimages/customCards/')||url.username||url.password)throw new PrintProblem(502,'The card proof source is not supported.');
  proofs[side]=url.href;
 }
 return {cardId:cardId!,proofs};
}

// Official pricing preview: one domestic folded card, standard mail, no inserts.
// No recipient address, credit card, basket or payment endpoint is involved.
export async function handwryttenCheckoutQuote(env:HandwryttenEnv,input:{cardId:number;message:string}){
 if(!Number.isSafeInteger(input.cardId)||input.cardId<=0||!input.message.trim())throw new PrintProblem(409,'Prepare the saved card proof and note first.');
 const auth=await api(env,'/checkauth/auth');
 if(Number(auth.test_mode)!==1)throw new PrintProblem(409,'Enable Handwrytten Test Mode before requesting a test quote.');
 const senders=await api(env,'/profile/listAddresses'),addresses=Array.isArray(senders.addresses)?senders.addresses:[];
 const enforced=Number(senders.enforced_return_address_id);
 const sender=enforced>0?addresses.find((a:any)=>Number(a.id)===enforced):(addresses.find((a:any)=>a.default===true||a.default===1||a.default==='1')||(addresses.length===1?addresses[0]:null));
 if(!sender||!Number.isSafeInteger(Number(sender.id))||Number(sender.id)<=0)throw new PrintProblem(409,'Choose a default return address in Handwrytten, or save one sender address, before requesting a quote.');
 if(Number(sender.country_id)!==1)throw new PrintProblem(409,'Use a US return address for this domestic quote.');
 const response=await api(env,'/outbound/process',{card_id:input.cardId,country:'United States',message:input.message,records:1,return_address_id:Number(sender.id),shipping_method_id:1});
 const money=(key:string)=>{
  const value=response.prices?.[key];
  if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0)throw new PrintProblem(502,'Handwrytten returned an incomplete pricing preview. No order was submitted.');
  const cents=Math.round(Number(value)*100);
  if(!Number.isSafeInteger(cents)||Math.abs(Number(value)*100-cents)>.001)throw new PrintProblem(502,'Handwrytten returned an invalid price.');return cents;
 };
 if(Number(response.quantity)!==1)throw new PrintProblem(502,'Handwrytten quoted a different card quantity.');
 const amounts={card:money('card_price'),postage:money('postage_price'),tax:money('tax'),shipping:money('shipping_price'),inserts:money('insert_price'),bundles:response.prices?.bundle_price===undefined?0:money('bundle_price'),subtotal:money('without_tax'),total:money('total')};
 if(amounts.card+amounts.postage+amounts.shipping+amounts.inserts+amounts.bundles!==amounts.subtotal||amounts.subtotal+amounts.tax!==amounts.total)throw new PrintProblem(502,'Handwrytten returned inconsistent totals. Refresh the quote before proceeding.');
 return {currency:'USD',quantity:1,amounts,quotedAt:Math.floor(Date.now()/1000),sender:{id:Number(sender.id),name:String(sender.name||[sender.first_name,sender.last_name].filter(Boolean).join(' ')),line1:String(sender.address1||''),city:String(sender.city||''),state:String(sender.state||''),postalCode:String(sender.zip||'')},source:'handwrytten-pricing-preview',submitted:false};
}

export async function requireHandwryttenTestMode(env:HandwryttenEnv){
 if(env.PRINT_ORDER_MODE!=='handwrytten_test')throw new PrintProblem(503,'Automatic Handwrytten test ordering is disabled.');
 if(Number((await api(env,'/checkauth/auth')).test_mode)!==1)throw new PrintProblem(409,'Handwrytten Test Mode must be enabled. Nothing was submitted.');
}
export async function handwryttenBasket(env:HandwryttenEnv){return api(env,'/basket/allNew');}
export async function handwryttenTestMutation(env:HandwryttenEnv,path:'/orders/placeBasket'|'/basket/send'|'/basket/remove',body:Record<string,unknown>){
 await requireHandwryttenTestMode(env);
 return api(env,path,body);
}
export async function handwryttenSender(env:HandwryttenEnv){
 const response=await api(env,'/profile/listAddresses'),list=Array.isArray(response.addresses)?response.addresses:[];
 const enforced=Number(response.enforced_return_address_id),sender=enforced>0?list.find((a:any)=>Number(a.id)===enforced):(list.find((a:any)=>[true,1,'1'].includes(a.default))||(list.length===1?list[0]:null));
 if(!sender||!Number.isSafeInteger(Number(sender.id))||Number(sender.id)<=0||Number(sender.country_id)!==1)throw new PrintProblem(409,'Choose a US return address in Handwrytten.');
 return {id:Number(sender.id),name:String(sender.name||''),line1:String(sender.address1||''),line2:String(sender.address2||''),city:String(sender.city||''),state:String(sender.state||''),postalCode:String(sender.zip||'')};
}
export async function handwryttenCountry(env:HandwryttenEnv,code:string){
 const response=await api(env,'/countries/list'),country=response.countries?.find((c:any)=>c.ups_code===code);
 if(!country||!Number.isSafeInteger(Number(country.id))||!country.name)throw new PrintProblem(409,'Handwrytten does not support this destination.');
 return {id:Number(country.id),name:String(country.name)};
}

export async function handwryttenTestOrder(env:HandwryttenEnv,id:number){return (await api(env,'/orders/details?id='+id)).order;}
