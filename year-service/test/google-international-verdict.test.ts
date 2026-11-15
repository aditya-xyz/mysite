import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleMailingAddress} from '../admin/src/address-verification.ts';
for(const country of ['IN','NL'] as const)test('Google '+country+' accepts complete building-proximity results only with explicit ACCEPT',()=>{
 const response:any={result:{verdict:{addressComplete:true,inputGranularity:'PREMISE',validationGranularity:'PREMISE_PROXIMITY',geocodeGranularity:'PREMISE_PROXIMITY',possibleNextAction:'ACCEPT'},address:{postalAddress:{regionCode:country,addressLines:[country==='NL'?'Museumstraat 1':'National Museum, Janpath'],locality:country==='NL'?'Amsterdam':'New Delhi',administrativeArea:country==='NL'?'':'Delhi',postalCode:country==='NL'?'1071 XX':'110011'}}}};
 assert.equal(googleMailingAddress(response,country).country,country);
 for(const change of [{possibleNextAction:'CONFIRM'},{possibleNextAction:undefined},{possibleNextAction:'FIX'},{addressComplete:false},{hasUnconfirmedComponents:true},{validationGranularity:'ROUTE'}]){
  const copy=structuredClone(response);Object.assign(copy.result.verdict,change);assert.throws(()=>googleMailingAddress(copy,country),/could not confirm/);
 }
 const wrongCountry=structuredClone(response);wrongCountry.result.address.postalAddress.regionCode='US';assert.throws(()=>googleMailingAddress(wrongCountry,country),/supported mailing address/);
});
test('US proximity results still require premise precision as well as USPS DPV',()=>{
 const response={result:{verdict:{addressComplete:true,validationGranularity:'PREMISE_PROXIMITY',possibleNextAction:'ACCEPT'},uspsData:{dpvConfirmation:'Y'},address:{postalAddress:{regionCode:'US',addressLines:['123 Test Ln'],locality:'Portland',administrativeArea:'OR',postalCode:'97201'}}}};
 assert.throws(()=>googleMailingAddress(response,'US'),/could not confirm/);
});
