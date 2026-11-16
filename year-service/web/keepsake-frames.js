// Versioned frame names: historical receipts keep their original artwork/recipe IDs.
export const keepsakeFrames=[
 {id:'starry-night',label:'Starry Night',src:'/frames/starry-night-v1.png'},
 {id:'evergreen',label:'Evergreen',src:'/frames/evergreen-v1.png'},
 {id:'winterlight',label:'Winterlight',src:'/frames/winterlight-v1.png'},
];
export const defaultKeepsakeFrame='starry-night';
export const frameBackground=frame=>keepsakeFrames.find(item=>item.id===frame)?.src||null;
