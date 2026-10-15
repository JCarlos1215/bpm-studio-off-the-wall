// ZIP STORE writer: MP3 is already compressed. Blob parts avoid copying the whole archive.
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
async function crc(blob,signal){
  let value=0xffffffff,processed=0;
  const reader=blob.stream().getReader();
  try{for(;;){if(signal?.aborted)throw new DOMException('Cancelado','AbortError');const {done,value:bytes}=await reader.read();if(done)break;
    for(const byte of bytes)value=table[(value^byte)&255]^(value>>>8);
    processed+=bytes.length;if(processed>1024*1024){processed=0;await new Promise(resolve=>setTimeout(resolve,0));}
  }}finally{reader.releaseLock();}
  return (value^0xffffffff)>>>0;
}
export async function createZip(files,{signal}={}){
  if(files.length>65535)throw new Error('Demasiados archivos para el ZIP.');
  const parts=[],directory=[];let offset=0,directorySize=0;
  const now=new Date(),year=Math.max(1980,Math.min(2107,now.getFullYear()));
  const date=((year-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
  for(const file of files){
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    const name=new TextEncoder().encode(file.name),size=file.blob.size;
    if(name.length>65535||size>0xffffffff||offset+size>0xffffffff)throw new Error('El archivo supera el límite del ZIP.');
    const checksum=await crc(file.blob,signal);
    const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(10,time,true);lv.setUint16(12,date,true);
    lv.setUint32(14,checksum,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,name.length,true);local.set(name,30);
    const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(12,time,true);cv.setUint16(14,date,true);
    cv.setUint32(16,checksum,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);
    parts.push(local,file.blob);directory.push(central);directorySize+=central.length;offset+=local.length+size;
  }
  const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,directorySize,true);ev.setUint32(16,offset,true);
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
  return new Blob([...parts,...directory,end],{type:'application/zip'});
}
