const base=new URL('./models/',import.meta.url),cacheName='bpm-htdemucs-v1';
async function diskCache(){try{return await caches.open(cacheName);}catch{return null;}}
async function manifest(){const r=await fetch(new URL('manifest.json',base));if(!r.ok)throw new Error('No se pudo cargar el motor integrado.');return r.json();}
export async function prepareModel(report=()=>{}){
 const data=await manifest(),cache=await diskCache();
 if(!cache)return; // Separation can still stream directly when browser storage is unavailable.
 for(let i=0;i<data.parts.length;i++){
  const url=new URL(data.parts[i].file,base).href;
  if(!await cache.match(url)){
   report(`Preparando motor integrado: ${i+1}/${data.parts.length}…`);
   const r=await fetch(url);if(!r.ok)throw new Error(`No se pudo cargar el modelo (${r.status}).`);
   try{await cache.put(url,r);}catch{return;} // Storage quota does not block separation.
  }
 }
}
export async function loadModelBytes(){
 const data=await manifest(),cache=await diskCache(),bytes=new Uint8Array(data.bytes);let offset=0;
 for(const part of data.parts){
  const url=new URL(part.file,base).href,r=await cache?.match(url)||await fetch(url);
  if(!r.ok)throw new Error(`No se pudo cargar el modelo (${r.status}).`);
  const reader=r.body.getReader();let count=0;
  while(true){const {done,value}=await reader.read();if(done)break;if(count+value.length>part.bytes)throw new Error('Archivo del modelo inválido.');bytes.set(value,offset);offset+=value.length;count+=value.length;}
  if(count!==part.bytes)throw new Error('El modelo llegó incompleto. Vuelve a abrir el panel.');
 }
 return bytes.buffer;
}
