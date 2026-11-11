export function createPrintFlow({getData,onChange,onOrdered=()=>{}}){
 let status=null,dialog=null,controller=null,closed=false,opening=false;
 async function refresh(){
  controller?.abort();controller=new AbortController();
  try{const response=await fetch('/api/print/status',{signal:controller.signal});if(!response.ok)throw new Error();const data=await response.json();if(closed)return;status=data;onChange();}catch{if(!closed){status=null;onChange();}}
 }
 function buttonMarkup(){return status?.eligible?`<button class="ks-print ks-gift" aria-label="Order complimentary print" data-print ${getData().file?'':'disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13M12 8C5 8 4 2 8 3c3 0 4 5 4 5Zm0 0c7 0 8-6 4-5-3 0-4 5-4 5Z"/></svg><span>Print, on us<small>A Christmas gift</small></span></button>`:'';}
 async function open(){
  if(dialog||opening)return;opening=true;await refresh();opening=false;if(closed||!status?.eligible)return;
  const data=getData();if(!data.file)return;
  const snapshot=structuredClone(status);let requestKey=crypto.randomUUID(),submitting=false;
  dialog=document.createElement('dialog');dialog.className='ks-print-dialog';dialog.setAttribute('aria-labelledby','print-title');
  dialog.innerHTML=`<div class="ks-top"><h2 id="print-title">Mail this keepsake?</h2><button class="ks-icon" data-close-print aria-label="Close order confirmation"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="ks-print-body">${snapshot.mode==='local_mock'?'<p class="ks-simulation">Local simulation · No physical mail or charges</p>':''}<p class="ks-description">We’ll send you a complimentary postcard of this keepsake. One little memento, on us.</p><p class="ks-status" role="status" aria-live="polite"></p></div><div class="ks-bottom"><button class="ks-secondary" data-cancel-print>Not yet</button><button class="ks-primary" data-submit-print>${snapshot.mode==='local_mock'?'Confirm local test order':'Yes, mail it'}</button></div>`;
  const sheet=dialog;document.body.append(dialog);
  const message=text=>{sheet.querySelector('.ks-status').textContent=text;};
  const submit=dialog.querySelector('[data-submit-print]');
  function release(){sheet.remove();if(dialog===sheet)dialog=null;}
  dialog.addEventListener('close',release,{once:true});
  dialog.querySelector('[data-close-print]').onclick=()=>sheet.close();
  dialog.querySelector('[data-cancel-print]').onclick=()=>sheet.close();
  function finish(order){
   status={...status,eligible:false,order,remaining:0};onChange();sheet.close();
   onOrdered(['simulated','submitted'].includes(order.status)?'Keep an eye on your mailbox—a little postcard is headed your way 💌':'Your print request is recorded.',order.status==='simulated');
  }
  submit.onclick=async()=>{
   if(submitting)return;submitting=true;submit.disabled=true;message('Saving your order…');
   const form=new FormData();form.set('artwork',data.file);form.set('recipe',JSON.stringify({...data.recipe,requestKey,confirmationKey:snapshot.confirmationKey}));
   try{
    const response=await fetch('/api/print/orders',{method:'POST',body:form,signal:AbortSignal.timeout(30000)}),result=await response.json();
    if(!response.ok)throw new Error(result.error||'The order could not be confirmed.');
    if(dialog!==sheet){await refresh();return;}
    finish(result.order);
   }catch(error){await refresh();if(dialog!==sheet)return;if(status?.order){finish(status.order);}else{requestKey=crypto.randomUUID();submitting=false;submit.disabled=false;message(error.message+' No additional order will be created if one is already recorded.');}}

  };
  dialog.showModal();
 }
 return {buttonMarkup,bind:container=>{const b=container.querySelector('[data-print]');if(b)b.onclick=open;},refresh:()=>{closed=false;refresh();},close:()=>{closed=true;controller?.abort();if(dialog?.open)dialog.close();}};
}
