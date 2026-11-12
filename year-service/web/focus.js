// Safari can retain keyboard-style focus after touch. Keep pointer interaction
// quiet while preserving visible focus as soon as a keyboard is used.
export function installFocusModality(){
 const root=document.documentElement;
 root.dataset.inputModality='pointer';
 document.addEventListener('pointerdown',()=>{root.dataset.inputModality='pointer';},{capture:true,passive:true});
 document.addEventListener('keydown',event=>{if(!event.metaKey&&!event.ctrlKey&&!event.altKey)root.dataset.inputModality='keyboard';},{capture:true});
}
