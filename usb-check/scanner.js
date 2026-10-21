export const MAX_FILES=20000;
export const FAT32_MAX=4294967295;
export const AUDIO=new Set(['mp3','aac','m4a','wav','wave','aif','aiff','flac','ogg','opus','wma','alac']);
export function extension(path){return path.split('/').at(-1).split('.').length>1?path.split('.').at(-1).toLowerCase():'';}
export function libraryType(path){const p=path.replaceAll('\\','/').toLowerCase();if(/(^|\/)pioneer\/rekordbox\/export\.pdb$/.test(p))return 'legacy';if(/(^|\/)pioneer\/rekordbox\/exportlibrary\.db$/.test(p))return 'plus';if(/(^|\/)pioneer\/usbanlz\/.+\.(dat|ext|2ex)$/.test(p))return 'analysis';return null;}
function tag(view,start,count){return Array.from({length:count},(_,i)=>String.fromCharCode(view.getUint8(start+i))).join('');}
export function parseWav(buffer){
 const v=new DataView(buffer);if(v.byteLength<12||!['RIFF','RF64'].includes(tag(v,0,4))||tag(v,8,4)!=='WAVE')return {problem:'La extensión WAV no coincide con una cabecera RIFF/WAVE válida.'};
 let offset=12;
 while(offset+8<=v.byteLength){const name=tag(v,offset,4),size=v.getUint32(offset+4,true),at=offset+8;
  if(name==='fmt '){if(size<16||at+16>v.byteLength)return {problem:'Cabecera WAV incompleta.'};let format=v.getUint16(at,true);const channels=v.getUint16(at+2,true),rate=v.getUint32(at+4,true),bits=v.getUint16(at+14,true);if(format===65534&&size>=40&&at+40<=v.byteLength)format=v.getUint16(at+24,true);return {format,channels,rate,bits};}
  if(size>v.byteLength||at+size>v.byteLength)break;offset=at+size+(size%2);
 }
 return {problem:'No se pudo comprobar la sección fmt del WAV en los primeros 64 KiB.'};
}
export function issuesFor(file,filesystem){
 const result=[];const add=(level,text)=>result.push({level,text});
 if(file.size===0&&!file.readError)add('error','Archivo vacío.');
 if(file.readError)add('error','No se pudo leer la cabecera. Revisa la conexión y los permisos.');
 if(file.size>FAT32_MAX)add(filesystem==='FAT32'?'error':'warning','Supera el límite de 4 GiB menos 1 byte por archivo de FAT32.');
 if(['ogg','opus','wma'].includes(file.ext))add('warning','Formato no cubierto por esta matriz de equipos. Revisa el manual o convierte una copia.');
 if(file.wav){const w=file.wav;if(w.problem)add('warning',w.problem);else{if(w.format!==1)add('warning','WAV no identificado como PCM entero: revisa compatibilidad o convierte una copia a PCM 16/24 bits.');if(![16,24].includes(w.bits))add('warning',`WAV de ${w.bits} bits: revisa el manual del equipo.`);if(![1,2].includes(w.channels))add('warning',`WAV con ${w.channels} canales: revisa o convierte a estéreo.`);if(![44100,48000].includes(w.rate))add('warning',`WAV de ${w.rate} Hz: la compatibilidad varía según el modelo.`);}}
 return result;
}
export async function scan(entries,{signal,onProgress=()=>{},total=null}={}){
 const result={files:[],bytes:0,audio:0,extensions:{},libraries:{legacy:0,plus:0,analysis:0},partial:false,cancelled:false};
 try{
  for await(const item of entries){
   if(signal?.aborted){result.partial=true;result.cancelled=true;break;}
   if(result.files.length>=MAX_FILES){result.partial=true;break;}
   const f={path:item.path,size:0,ext:extension(item.path),lastModified:0};
   try{const file=item.file||await item.handle.getFile();f.size=file.size;f.lastModified=file.lastModified;
    if(['wav','wave'].includes(f.ext)&&f.size)f.wav=parseWav(await file.slice(0,65536).arrayBuffer());
   }catch{f.readError=true;}
   if(signal?.aborted){result.partial=true;result.cancelled=true;break;}
   result.files.push(f);result.bytes+=f.size;if(AUDIO.has(f.ext))result.audio++;
   result.extensions[f.ext||'(sin extensión)']=(result.extensions[f.ext||'(sin extensión)']||0)+1;
   const library=libraryType(f.path);if(library)result.libraries[library]++;
   if(result.files.length%25===0){onProgress(result,total);await new Promise(resolve=>setTimeout(resolve,0));}
  }
 }catch(error){if(signal?.aborted){result.cancelled=true;result.partial=true;}else{result.partial=true;result.error='No se pudo recorrer toda la carpeta. Comprueba permisos y vuelve a seleccionarla.';}}
 if(signal?.aborted){result.cancelled=true;result.partial=true;}
 onProgress(result,total);return result;
}
export async function* filesFromDirectory(root,signal){
 const pending=[{handle:root,path:root.name}],visited=new Set();
 while(pending.length){if(signal?.aborted)return;const item=pending.pop();if(visited.size>=10000)throw new Error('Directory limit');visited.add(item.path);for await(const [name,handle] of item.handle.entries()){if(signal?.aborted)return;const path=item.path+'/'+name;if(handle.kind==='directory')pending.push({handle,path});else if(handle.kind==='file')yield {path,handle};}}
}
export function* filesFromList(files){for(const file of files)yield {path:file.webkitRelativePath||file.name,file};}
