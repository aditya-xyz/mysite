// Read only preview headers. Originals and EXIF are never decoded or rewritten.
export function imageDimensions(bytes:Uint8Array):{width:number;height:number}|null {
  if(bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  let offset=2;
  while(offset+3<bytes.length){
    if(bytes[offset++]!==0xff)return null;
    while(bytes[offset]===0xff)offset++;
    const marker=bytes[offset++];
    if(marker===0xd9||marker===0xda)return null;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    const length=(bytes[offset]<<8)|bytes[offset+1];
    if(length<2||offset+length>bytes.length)return null;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      if(length<8)return null;
      const height=(bytes[offset+3]<<8)|bytes[offset+4],width=(bytes[offset+5]<<8)|bytes[offset+6];
      return width&&height?{width,height}:null;
    }
    offset+=length;
  }
  return null;
}
export async function previewDimensions(bucket:R2Bucket,key:string){
  const object=await bucket.get(key,{range:{offset:0,length:65536}});
  return object?imageDimensions(new Uint8Array(await object.arrayBuffer()))||{}:{};
}
