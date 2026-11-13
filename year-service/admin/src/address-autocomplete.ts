import {addressMode,autocompleteAvailable,reserveGoogleRequest,type AddressEnv} from './address-verification.ts';
import {PrintProblem} from '../../src/printing.ts';

const GOOGLE='https://places.googleapis.com/v1/';
async function places(env:AddressEnv,path:string,sessionToken:string,body?:unknown){
 await reserveGoogleRequest(env,'google_places');
 let response:Response;
 try{response=await fetch(GOOGLE+path+(body?'':`?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`),{
  method:body?'POST':'GET',headers:{'X-Goog-Api-Key':env.GOOGLE_PLACES_API_KEY||env.GOOGLE_ADDRESS_VALIDATION_API_KEY!,
   'X-Goog-FieldMask':body?'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text':'id,addressComponents',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)
 });}catch{throw new PrintProblem(503,'Address suggestions are unavailable. You can enter the address manually.');}
 if(!response.ok)throw new PrintProblem(response.status===429?429:503,'Address suggestions are unavailable or have reached their limit. You can enter the address manually.');
 try{return await response.json() as any;}catch{throw new PrintProblem(503,'Address suggestions are unavailable. You can enter the address manually.');}
}
export async function addressAutocompleteRoute(request:Request,env:AddressEnv,path:string,readBody:()=>Promise<Record<string,unknown>>){
 const route=/^\/api\/contacts\/([a-z0-9-]{1,100})\/address\/(autocomplete|place)$/.exec(path);
 if(!route||request.method!=='POST')return null;
 const data=await readBody();if(!Number.isInteger(data.version)||typeof data.sessionToken!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(data.sessionToken))throw new PrintProblem(400,'Check the address search session.');
 const person=await env.DB.prepare('SELECT id FROM people WHERE id=?1 AND version=?2').bind(route[1],data.version as number).first();if(!person)throw new PrintProblem(409,'This person changed. Reopen the address editor.');
 if(!autocompleteAvailable(request,env))throw new PrintProblem(503,'Address suggestions are not configured. You can enter the address manually.');
 const country=data.country===undefined?'US':data.country;if(!['US','IN','NL'].includes(String(country)))throw new PrintProblem(400,'Choose a supported country.');
 const simulated=addressMode(request,env)==='local_mock';
 if(route[2]==='autocomplete'){
  if(typeof data.input!=='string'||data.input.length>200)throw new PrintProblem(400,'Enter a shorter address search.');
  if(data.input.trim().length<3)return Response.json({suggestions:[],simulated});
  if(simulated&&country!=='US')return Response.json({suggestions:[{placeId:'mock-place-one',text:country==='IN'?'1 Sample Road, Mumbai, Maharashtra 400001, India':'1 Voorbeeldstraat, Amsterdam 1012 JS, Netherlands'}],simulated:true});
  if(simulated)return Response.json({suggestions:[{placeId:'mock-place-one',text:'123 Example Lane, Portland, OR 97201, USA'},{placeId:'mock-place-two',text:'456 Sample Street, Portland, OR 97202, USA'}],simulated:true});
  const result=await places(env,'places:autocomplete',data.sessionToken,{input:data.input.trim(),sessionToken:data.sessionToken,includedRegionCodes:[String(country).toLowerCase()],includeQueryPredictions:false,languageCode:'en'});
  const suggestions=(Array.isArray(result.suggestions)?result.suggestions:[]).map((s:any)=>({placeId:s.placePrediction?.placeId,text:s.placePrediction?.text?.text})).filter((s:any)=>typeof s.placeId==='string'&&/^[a-zA-Z0-9_-]{1,256}$/.test(s.placeId)&&typeof s.text==='string'&&s.text.length<=300).slice(0,5);
  return Response.json({suggestions,simulated:false});
 }
 if(typeof data.placeId!=='string'||!/^[a-zA-Z0-9_-]{1,256}$/.test(data.placeId))throw new PrintProblem(400,'Choose an address suggestion.');
 if(simulated&&country!=='US'){if(data.placeId!=='mock-place-one')throw new PrintProblem(400,'Choose a sample suggestion.');return Response.json({address:{line1:country==='IN'?'1 Sample Road':'1 Voorbeeldstraat',line2:'',city:country==='IN'?'Mumbai':'Amsterdam',state:country==='IN'?'Maharashtra':'',postalCode:country==='IN'?'400001':'1012 JS',country},simulated:true});}
 if(simulated){if(!['mock-place-one','mock-place-two'].includes(data.placeId))throw new PrintProblem(400,'Choose a sample suggestion.');return Response.json({address:{line1:data.placeId==='mock-place-one'?'123 Example Lane':'456 Sample Street',line2:'',city:'Portland',state:'OR',postalCode:data.placeId==='mock-place-one'?'97201':'97202',country:'US'},simulated:true});}
 const result=await places(env,'places/'+encodeURIComponent(data.placeId),data.sessionToken);
 const components=Array.isArray(result.addressComponents)?result.addressComponents:[];
 const part=(type:string,short=false)=>{const c=components.find((c:any)=>Array.isArray(c.types)&&c.types.includes(type));const text=c?.[short?'shortText':'longText'];return typeof text==='string'?text:'';};
 if(part('country',true)!==country)throw new PrintProblem(422,'Choose an address in the selected country.');
 const zip=part('postal_code'),suffix=part('postal_code_suffix');
 const address={line1:[part('street_number'),part('route')].filter(Boolean).join(' '),line2:part('subpremise')?'Unit '+part('subpremise'):'',city:part('locality')||part('postal_town')||part('sublocality_level_1'),state:part('administrative_area_level_1',true),postalCode:zip+(zip&&suffix?'-'+suffix:''),country:String(country)};
 if(Object.values(address).some(v=>v.length>120||/[\r\n\x00-\x1f]/.test(v)))throw new PrintProblem(422,'Enter this address manually.');
 return Response.json({address,simulated:false});
}
