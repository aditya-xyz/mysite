import {imageDimensions} from './image-dimensions.ts';
import {PrintProblem} from './printing.ts';
export interface HandwryttenEnv {HANDWRYTTEN_API_KEY?:string}
// Deliberately excludes order submission, basket changes, payments and test-mode toggles.
const allowed=new Set(['/checkauth/auth','/design/dimensions','/basket/count','/cards/uploadCustomLogo','/cards/createCustomCard']);
async function api(env:HandwryttenEnv,path:string,body?:Record<string,unknown>|FormData){
 if(!env.HANDWRYTTEN_API_KEY)throw new PrintProblem(503,'Handwrytten is not connected.');
 if(!allowed.has(path))throw new PrintProblem(400,'Only Handwrytten diagnostics and card preparation are enabled.');
 const form=body instanceof FormData;
 let response:Response;try{response=await fetch('https://api.handwrytten.com/v2'+path,{method:body?'POST':'GET',headers:{Authorization:env.HANDWRYTTEN_API_KEY,...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new PrintProblem(503,'Handwrytten is temporarily unavailable.');}
 const result=await response.json() as Record<string,any>;
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
