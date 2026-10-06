import {formats,LIMIT,buildArgs} from './conversion-profiles.js';
import {inspectMedia} from './media-inspect.js';
const $=id=>document.getElementById(id);
let file=null,busy=false,engine=null,job=0,resultURL=null;
const size=n=>`${(n/1024/1024).toLocaleString('es-MX',{maximumFractionDigits:2})} MB`;
function say(text,error=false){$('conversionStatus').textContent=text;$('conversionStatus').classList.toggle('error',error);}
function clearResult(){if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;$('downloadResult').hidden=true;$('downloadResult').removeAttribute('href');}
function updateControls(){for(const id of ['mediaFile','outputFormat','removeFile','showBpm','showMp3','showRekordbox','showKeyAnalyzer'])$(id).disabled=busy;$('conversionQuality').disabled=busy||['wav','flac'].includes($('outputFormat').value);$('convertButton').disabled=busy||!file;$('convertButton').textContent=busy?'Convirtiendo…':'Convertir archivo';$('cancelConversion').hidden=!busy;}
function hint(){ $('formatHint').textContent=formats[$('outputFormat').value].hint;updateControls(); }
function selectFile(candidate){
 if(busy)return;clearResult();$('conversionProgress').hidden=true;
 if(!candidate){file=null;$('mediaFile').value='';$('chosenFile').hidden=true;say('Selecciona un archivo para comenzar. No se sube a ningún servidor.');updateControls();return;}
 if(candidate.size===0||candidate.size>LIMIT){selectFile(null);say(candidate.size===0?'Este archivo está vacío. Selecciona otro.':'El archivo supera el límite de 200 MB. Selecciona uno más pequeño.',true);return;}
 file=candidate;$('chosenFile').hidden=false;$('chosenName').textContent=file.name;$('chosenSize').textContent=size(file.size);say('Archivo listo. Elige el formato de salida y pulsa Convertir archivo.');updateControls();
}
function progress(text,value){$('conversionProgress').hidden=false;$('progressLabel').textContent=text;if(value===undefined)$('convertProgress').removeAttribute('value');else $('convertProgress').value=value;}
function cancel(reason='Conversión cancelada. Puedes volver a intentarlo o elegir otro archivo.'){
 if(!busy)return;job++;engine?.terminate();engine=null;busy=false;clearResult();$('conversionProgress').hidden=true;say(reason);updateControls();
}
async function convert(){
 if(!file||busy)return;
 if(!window.Worker||!window.WebAssembly){say('Este navegador no admite el motor de conversión. Prueba un navegador actualizado.',true);return;}
 const id=++job,selected=file,format=$('outputFormat').value,quality=$('conversionQuality').value;
 busy=true;clearResult();updateControls();progress('Cargando motor de conversión…');say('La primera carga descarga unos 32 MB. El archivo permanece en tu dispositivo.');
 let ffmpeg,phase='load',timer;
 const current=()=>id===job;
 try{
  timer=setTimeout(()=>{if(current())cancel('La conversión excedió 15 minutos. Prueba un archivo más corto o una calidad menor.');},15*60*1000);
  const {FFmpeg}=await import('./vendor/ffmpeg/index.js');if(!current())return;
  ffmpeg=new FFmpeg();engine=ffmpeg;
  ffmpeg.on('progress',({progress:p})=>{if(current()&&phase==='convert'&&Number.isFinite(p))progress(`Convirtiendo · ${Math.min(99,Math.max(0,Math.round(p*100)))}% aproximado`,Math.min(99,Math.max(0,p*100)));});
  await ffmpeg.load({coreURL:new URL('./vendor/core/ffmpeg-core.js',import.meta.url).href,wasmURL:new URL('./vendor/core/ffmpeg-core.wasm',import.meta.url).href});if(!current())return;
  phase='read';progress('Leyendo el archivo…');
  const bytes=new Uint8Array(await selected.arrayBuffer());if(!current())return;
  await ffmpeg.writeFile('source',bytes);if(!current())return;
  phase='probe';progress('Comprobando pistas de audio y video…');
  const info=await inspectMedia(ffmpeg,'source');if(!current())return;
  const output=`converted.${format}`;
  phase='validate';const args=buildArgs('source',output,format,quality,info.streams||[]);
  phase='convert';progress('Convirtiendo…',0);say('Procesando en tu dispositivo. Mantén esta pestaña abierta; los videos pueden tardar varios minutos.');
  const code=await ffmpeg.exec(args,14*60*1000);if(!current())return;
  if(code!==0)throw new Error('CONVERSION');
  phase='result';progress('Preparando la descarga…');const data=await ffmpeg.readFile(output);if(!current())return;
  if(!data.length)throw new Error('EMPTY');
  resultURL=URL.createObjectURL(new Blob([data],{type:formats[format].mime}));
  const base=(selected.name.replace(/\.[^.]+$/,'')||'archivo').replace(/[\x00-\x1f/\\]/g,'_');
  $('downloadResult').href=resultURL;$('downloadResult').download=`${base}-convertido.${format}`;$('downloadResult').textContent=`Descargar ${formats[format].label} · ${size(data.length)}`;$('downloadResult').hidden=false;
  progress('Conversión completada',100);say('Archivo convertido. Pulsa Descargar para guardarlo. No se ha subido a ningún servidor.');
 }catch(error){
  if(!current())return;
  $('conversionProgress').hidden=true;
  const explanation=phase==='load'?'No se pudo cargar el motor. Comprueba tu conexión y vuelve a intentar; usa localhost o HTTPS.':phase==='validate'?error.message:phase==='probe'?'No se reconoce el archivo. Puede estar dañado, protegido o usar un formato no compatible.':'No se pudo convertir este archivo. Puede usar un códec no compatible o exceder la memoria del dispositivo. Prueba un archivo más pequeño u otro formato.';
  say(explanation,true);
 }finally{
  clearTimeout(timer);ffmpeg?.terminate();if(current()){engine=null;busy=false;updateControls();}
 }
}
$('mediaFile').addEventListener('change',()=>selectFile($('mediaFile').files[0]));
$('removeFile').addEventListener('click',()=>selectFile(null));
$('outputFormat').addEventListener('change',()=>{clearResult();$('conversionProgress').hidden=true;hint();if(file)say('Formato actualizado. Pulsa Convertir archivo.');});
$('conversionQuality').addEventListener('change',()=>{clearResult();$('conversionProgress').hidden=true;if(file)say('Calidad actualizada. Pulsa Convertir archivo.');});
$('convertButton').addEventListener('click',convert);$('cancelConversion').addEventListener('click',()=>cancel());
for(const event of ['dragenter','dragover'])$('fileDrop').addEventListener(event,e=>{e.preventDefault();if(!busy)$('fileDrop').classList.add('dragging');});
for(const event of ['dragleave','drop'])$('fileDrop').addEventListener(event,e=>{e.preventDefault();$('fileDrop').classList.remove('dragging');});
$('fileDrop').addEventListener('drop',e=>{if(busy)return;if(e.dataTransfer.files.length!==1){say('Selecciona un solo archivo por conversión.',true);return;}selectFile(e.dataTransfer.files[0]);});
function switchView(view){if(busy&&view!=='converter')return;if(view!=='bpm')window.dispatchEvent(new Event('studio:converter'));for(const [name,button] of [['bpm','showBpm'],['converter','showConverter'],['mp3','showMp3'],['rekordbox','showRekordbox'],['keyAnalyzer','showKeyAnalyzer']]){const active=view===name;$(name+'View').hidden=!active;$(button).classList.toggle('selected',active);$(button).setAttribute('aria-pressed',String(active));}document.body.classList.toggle('converter-open',view!=='bpm');if(view==='bpm')window.dispatchEvent(new Event('resize'));}
$('showBpm').addEventListener('click',()=>switchView('bpm'));$('showConverter').addEventListener('click',()=>switchView('converter'));$('showMp3').addEventListener('click',()=>switchView('mp3'));$('showRekordbox').addEventListener('click',()=>switchView('rekordbox'));$('showKeyAnalyzer').addEventListener('click',()=>switchView('keyAnalyzer'));
const mp3Frame=$('mp3Frame');
const isLocalStudio=['localhost','127.0.0.1'].includes(location.hostname)&&location.port==='8080';
mp3Frame.src=isLocalStudio?mp3Frame.dataset.localSrc:mp3Frame.dataset.hostedSrc;
window.addEventListener('message',event=>{if(event.source!==mp3Frame.contentWindow||event.origin!=='http://127.0.0.1:8093'||event.data?.type!=='mp3-studio-resize')return;const height=Number(event.data.height);if(Number.isFinite(height))mp3Frame.style.height=`${Math.max(720,Math.min(height,12000))}px`;});
const keyAnalyzerFrame=$('keyAnalyzerFrame');
window.addEventListener('message',event=>{if(event.source!==keyAnalyzerFrame.contentWindow||event.origin!==location.origin||event.data?.type!=='key-analyzer-resize')return;const height=Number(event.data.height);if(Number.isFinite(height))keyAnalyzerFrame.style.height=`${Math.max(720,Math.min(height,6000))}px`;});
window.addEventListener('pagehide',()=>{cancel();clearResult();});hint();
