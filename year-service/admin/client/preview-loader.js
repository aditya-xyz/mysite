// Only the latest recipient request may update an open preview.
export function createPreviewLoader({load,onLoading,onResult,onError}){
  let generation=0,controller;
  return {
    async show(context){
      const current=++generation;controller?.abort();controller=new AbortController();
      onLoading();
      try{
        const data=await load(context,controller.signal);
        if(current===generation)onResult(data);
      }catch(error){if(current===generation&&error.name!=='AbortError')onError(error);}
    },
    cancel(){generation++;controller?.abort();}
  };
}
