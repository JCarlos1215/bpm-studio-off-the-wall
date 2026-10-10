import {inspectMedia} from '../media-inspect.js';
import {PRESETS,validateOptions,prepareFilters,measure,render,enforcePeak} from './engine.js?v=pitch-20261010-1';
import {measureTuning} from './tuning.js?v=pitch-20261010-1';
const $=id=>document.getElementById(id);
if(new URLSearchParams(location.search).has('embed'))document.documentElement.classList.add('embedded');
let selected=null,busy=false,engine=null,runId=0,originalURL=null,resultURL=null,before=null,after=null,phase=[0,0];
function status(message,state=''){$('status').textContent=message;$('status').className=`status ${state}`;}
function controls(){
  $('file').disabled=busy;
  for(const field of document.querySelectorAll('.settings input,.settings select'))field.disabled=busy;
  $('process').disabled=busy||!selected;
  $('process').textContent=busy?'Procesando…':'Analizar y preparar audio';
  $('cancel').hidden=!busy;
  pitchControls();
}
function clearResult(){
  $('processed').pause();$('processed').removeAttribute('src');$('processed').load();
  if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;
  $('download').removeAttribute('href');$('results').hidden=true;$('pitch-result').hidden=true;
  before=after=null;$('original').volume=1;
}
function setPhase(message,start,end){status(message);phase=[start,end];$('progress').hidden=false;if(start===null)$('progress').removeAttribute('value');else $('progress').value=start;}
function options(){const pitchMode=$('pitch-mode').value;return validateOptions({preset:document.querySelector('input[name=preset]:checked').value,peak:$('peak').value,format:$('format').value,sampleRate:$('sample-rate').value,repair:$('repair').checked,removeDC:$('remove-dc').checked,pitchMode,pitchBehavior:$('pitch-behavior').value,manualCents:pitchMode==='manual'?($('pitch-cents').value.trim()===''?NaN:$('pitch-cents').value):0});}
function pitchControls(){$('manual-pitch').hidden=$('pitch-mode').value!=='manual';$('pitch-behavior').disabled=busy||$('pitch-mode').value==='off';}
$('pitch-mode').addEventListener('change',pitchControls);
$('file').addEventListener('change',()=>{
  if(busy)return;
  clearResult();$('original').pause();if(originalURL)URL.revokeObjectURL(originalURL);originalURL=null;
  $('original').removeAttribute('src');$('original').load();$('original-preview').hidden=true;
  selected=$('file').files?.[0]??null;$('progress').hidden=true;
  if(selected&&(selected.size===0||selected.size>60*1024*1024)){
    status(selected.size===0?'El archivo está vacío.':'El archivo supera 60 MB. Elige una pista más pequeña.','error');selected=null;$('file').value='';
  }else status(selected?'Archivo listo. Elige un perfil y pulsa Analizar y preparar audio.':'Carga una pista para empezar.');
  $('filename').textContent=selected?.name??'Selecciona un archivo de audio';
  if(selected){originalURL=URL.createObjectURL(selected);$('original').src=originalURL;$('original-preview').hidden=false;}
  controls();
});
function cancel(message='Procesamiento cancelado. El original no se ha modificado.'){
  if(!busy)return;
  runId++;engine?.terminate();engine=null;busy=false;$('progress').hidden=true;status(message);controls();
}
$('cancel').addEventListener('click',()=>cancel());
for(const field of document.querySelectorAll('.settings input,.settings select'))field.addEventListener('change',()=>{
  if(!busy&&resultURL){clearResult();$('progress').hidden=true;status('Ajustes actualizados. Pulsa Analizar y preparar audio para generar una nueva copia.');}
});
function matchVolume(){
  if(!before||!after)return;
  const target=Math.min(before.loudness,after.loudness);
  $('original').volume=$('match-volume').checked?Math.min(1,10**((target-before.loudness)/20)):1;
  $('processed').volume=$('match-volume').checked?Math.min(1,10**((target-after.loudness)/20)):1;
}
$('match-volume').addEventListener('change',matchVolume);
for(const [dest,other] of [['original','processed'],['processed','original']])$(dest).addEventListener('play',()=>$(other).pause());
async function listen(dest,other){
  const position=$(other).currentTime;$(other).pause();
  const ratio=Number.isFinite($(dest).duration)&&Number.isFinite($(other).duration)&&$(other).duration>0?$(dest).duration/$(other).duration:1;
  try{if(Number.isFinite($(dest).duration))$(dest).currentTime=Math.min(position*ratio,Math.max(0,$(dest).duration-.01));await $(dest).play();}
  catch{status('El navegador no pudo reproducir ese formato. Puedes descargar la copia o elegir salida WAV.','error');}
}
$('listen-original').addEventListener('click',()=>listen('original','processed'));
$('listen-processed').addEventListener('click',()=>listen('processed','original'));
$('process').addEventListener('click',async()=>{
  if(!selected||busy)return;
  const id=++runId,source=selected;
  const current=()=>id===runId;
  busy=true;clearResult();$('original').pause();controls();
  let ffmpeg,timer;
  try{
    const settings=options();
    timer=setTimeout(()=>{if(current())cancel('Se superaron 15 minutos. Prueba una pista más corta o desactiva la reparación de clipping.');},15*60*1000);
    setPhase('Cargando motor de audio local…',null,null);
    const {FFmpeg}=await import('../vendor/ffmpeg/index.js');if(!current())return;
    ffmpeg=new FFmpeg();engine=ffmpeg;
    ffmpeg.on('progress',({progress})=>{if(current()&&phase[0]!==null&&Number.isFinite(progress))$('progress').value=phase[0]+Math.max(0,Math.min(.99,progress))*(phase[1]-phase[0]);});
    await ffmpeg.load({coreURL:new URL('../vendor/core/ffmpeg-core.js',import.meta.url).href,wasmURL:new URL('../vendor/core/ffmpeg-core.wasm',import.meta.url).href});if(!current())return;
    setPhase('Leyendo el archivo y comprobando su duración…',8,14);
    await ffmpeg.writeFile('source',new Uint8Array(await source.arrayBuffer()));if(!current())return;
    const info=await inspectMedia(ffmpeg,'source');if(!current())return;
    if(!info.streams.some(s=>s.codec_type==='audio'))throw new Error('Este archivo no contiene una pista de audio.');
    if(!Number.isFinite(info.duration)||info.duration<=0)throw new Error('No se pudo comprobar la duración del archivo. Prueba con WAV, FLAC o MP3.');
    if(info.duration>600)throw new Error('La pista supera 10 minutos. Usa un fragmento más corto.');
    setPhase('Midiendo la sonoridad y los picos del original…',14,24);
    const original=await measure(ffmpeg,'source',settings);if(!current())return;
    let originalTuning=null;
    if(settings.pitchMode!=='off'){
      setPhase('Estimando afinación global respecto a A=440 Hz…',24,32);
      originalTuning=await measureTuning(ffmpeg,'source',current);if(!current())return;
      settings.pitchCents=settings.pitchMode==='manual'?settings.manualCents:originalTuning.reliable?-originalTuning.cents:0;
    }
    let prepared=original;
    const filters=prepareFilters(settings);
    if(filters.length){setPhase('Analizando la señal tras el tratamiento previo y el ajuste de tono…',32,45);prepared=await measure(ffmpeg,'source',settings,filters);if(!current())return;}
    setPhase('Normalizando la sonoridad y controlando los picos…',45,78);
    const output=`prepared.${settings.format}`;
    await render(ffmpeg,'source',output,settings,prepared);if(!current())return;
    setPhase('Verificando el archivo exportado…',78,94);
    const exported=await measure(ffmpeg,output,settings);if(!current())return;
    setPhase('Comprobando el límite final de picos…',94,99);
    const final=await enforcePeak(ffmpeg,output,exported,settings);if(!current())return;
    if(originalTuning){
      setPhase('Comprobando la afinación de la copia exportada…',96,99);
      const finalTuning=await measureTuning(ffmpeg,final.path,current);if(!current())return;
      const signed=value=>`${value>0?'+':''}${value.toFixed(1)} cents`;
      $('pitch-before').textContent=originalTuning.reliable?`Original: ${signed(originalTuning.cents)} respecto a A=440 Hz.`:`Original: no concluyente. ${originalTuning.reason}`;
      $('pitch-applied').textContent=`Corrección aplicada: ${signed(settings.pitchCents)} · ${settings.pitchBehavior==='speed'?'velocidad y tono juntos (cambia el BPM)':'manteniendo el tempo'}.${settings.pitchMode==='auto'&&!originalTuning.reliable?' El modo automático conservó la afinación.':''}`;
      $('pitch-after').textContent=finalTuning.reliable?`Copia: ${signed(finalTuning.cents)} respecto a A=440 Hz.${Math.abs(finalTuning.cents)>6?' Queda una desviación estimada; revisa el resultado con una referencia.':''}`:`Copia: afinación no concluyente. ${finalTuning.reason}`;
      $('pitch-result').hidden=false;
    }
    const bytes=await ffmpeg.readFile(final.path);if(!current())return;
    if(!bytes.length)throw new Error('No se generó un archivo de salida.');
    resultURL=URL.createObjectURL(new Blob([bytes],{type:settings.format==='wav'?'audio/wav':'audio/flac'}));
    before=original;after=final.measurement;
    const base=(source.name.replace(/\.[^.]+$/,'')||'audio').replace(/[\x00-\x1f/\\]/g,'_');
    $('download').href=resultURL;$('download').download=`${base}-preparado-${settings.preset}.${settings.format}`;
    $('download').textContent=`Descargar ${settings.format.toUpperCase()} · ${(bytes.length/1024/1024).toFixed(1)} MB`;
    for(const [name,measurement] of [['before',before],['after',after]]){
      $(`${name}-loudness`).textContent=`${measurement.loudness.toFixed(1)} LUFS`;
      $(`${name}-peak`).textContent=`${measurement.peak.toFixed(1)} dBTP`;
      $(`${name}-range`).textContent=`${measurement.range.toFixed(1)} LU`;
    }
    const preset=PRESETS[settings.preset];
    $('result-note').textContent=`Perfil ${preset.label} · objetivo ${preset.loudness} LUFS · pico máximo ${settings.peak} dBTP · ${settings.sampleRate/1000} kHz.${final.adjusted?' Se redujo el nivel para respetar el límite de picos.':''}${Math.abs(after.loudness-preset.loudness)>1?' El nivel final difiere del objetivo; consulta la medición de la copia.':''}`;
    $('processed').src=resultURL;$('results').hidden=false;matchVolume();
    $('progress').value=100;
    status('Copia preparada y verificada. Escucha la comparación y descárgala para guardarla.','success');
  }catch(error){
    if(current()){$('progress').hidden=true;status(error instanceof Error&&error.message&&!/terminated|memory access|abort|worker|UNSUPPORTED/i.test(error.message)?error.message:'No se pudo procesar la pista. Puede exceder la memoria o usar un formato no compatible; prueba un archivo más corto.','error');}
  }finally{
    clearTimeout(timer);ffmpeg?.terminate();
    if(current()){engine=null;busy=false;controls();}
  }
});
window.addEventListener('pagehide',()=>{cancel();if(originalURL)URL.revokeObjectURL(originalURL);if(resultURL)URL.revokeObjectURL(resultURL);});
if(new URLSearchParams(location.search).has('embed')&&window.parent!==window){
  const resize=()=>window.parent.postMessage({type:'enhancer-resize',height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)},location.origin);
  new ResizeObserver(resize).observe(document.body);window.addEventListener('load',resize);
}
