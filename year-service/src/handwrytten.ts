import {imageDimensions} from './image-dimensions.ts';
import {PrintProblem} from './printing.ts';
export interface HandwryttenEnv {HANDWRYTTEN_API_KEY?:string}
// Deliberately excludes order submission, basket changes, payments and test-mode toggles.
const allowed=new Set(['/checkauth/auth','/design/dimensions','/basket/count','/cards/uploadCustomLogo','/cards/createCustomCard','/cards/view','/fonts/list']);
async function api(env:HandwryttenEnv,path:string,body?:Record<string,unknown>|FormData){
 if(!env.HANDWRYTTEN_API_KEY)throw new PrintProblem(503,'Handwrytten is not connected.');
 if(!allowed.has(path.split('?')[0]))throw new PrintProblem(400,'Only Handwrytten diagnostics and card preparation are enabled.');
 const form=body instanceof FormData;
 let response:Response;try{response=await fetch('https://api.handwrytten.com/v2'+path,{method:body?'POST':'GET',headers:{Authorization:env.HANDWRYTTEN_API_KEY,...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw new PrintProblem(503,'Handwrytten is temporarily unavailable.');}
 if(!response.ok)throw new PrintProblem(502,'Handwrytten could not complete the preview request.');
 let result:Record<string,any>;try{result=await response.json() as Record<string,any>;}catch{throw new PrintProblem(502,'Handwrytten returned an invalid preview response.');}
 if(!response.ok||result.status!=='ok')throw new PrintProblem(502,'Handwrytten could not complete the preview request.');
 return result;
}
export async function handwryttenStatus(env:HandwryttenEnv){
 if(!env.HANDWRYTTEN_API_KEY)return {connected:false,testMode:false,ordering:'simulation',submissionEnabled:false};
 const auth=await api(env,'/checkauth/auth'),formats=await api(env,'/design/dimensions');
 return {connected:true,testMode:Number(auth.test_mode)===1,ordering:'simulation',submissionEnabled:false,formats:(formats.dimensions||[]).map((d:any)=>({id:d.id,orientation:d.orientation,width:d.open_width,height:d.open_height,format:d.format}))};
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


export const handwryttenPrintFont={font:'hwDavid',font_size:13,auto_font_size:true} as const;
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
