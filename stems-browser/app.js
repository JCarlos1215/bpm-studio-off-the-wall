import {wavHeader} from './audio.mjs?v=memory-2';
import {prepareModel} from './model.mjs?v=bundled-1';
const $=id=>document.getElementById(id);
let worker=null,busy=false,urls=[],generation=0,parts=[],outputFrames=0;
const names=['Batería','Bajo','Otros instrumentos','Voces'],keys=['drums','bass','other','vocals'];
function controls(){ $('run').disabled=busy||!$('file').files.length;$('file').disabled=busy;$('cancel').hidden=!busy; }
function clear(){for(const audio of document.querySelectorAll('audio'))audio.pause();for(const url of urls)URL.revokeObjectURL(url);urls=[];$('tracks').replaceChildren();$('results').hidden=true;parts=[];outputFrames=0;}
function stop(text){worker?.terminate();worker=null;parts=[];busy=false;sessionStorage.removeItem('stems-in-progress');error(text);controls();}
function error(text){$('error').textContent=text;$('error').hidden=false;}

function wave(values){const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=100;canvas.className='wave';canvas.setAttribute('aria-label','Forma de onda real del stem');const peaks=values;const max=Math.max(...peaks)||1,ctx=canvas.getContext('2d');ctx.fillStyle='#65b6ff';peaks.forEach((p,i)=>{const h=Math.max(1,p/max*88);ctx.fillRect(i*2,(100-h)/2,1.5,h);});return canvas;}
function show(peaks,frames){peaks.forEach((values,index)=>{const card=document.createElement('article');card.className='stem';const heading=document.createElement('div');heading.className='stem-head';const title=document.createElement('h3');title.textContent=names[index];const url=URL.createObjectURL(new Blob([wavHeader(frames),...parts[index]],{type:'audio/wav'}));urls.push(url);const link=document.createElement('a');link.href=url;link.className='download';link.download=`${$('file').files[0].name.replace(/\.[^.]+$/,'')}-${keys[index]}.wav`;link.textContent='↓ Descargar WAV';heading.append(title,link);const audio=document.createElement('audio');audio.src=url;audio.controls=true;audio.preload='none';audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();}));card.append(heading,wave(values),audio);$('tracks').append(card);});$('results').hidden=false;}
const preparation=prepareModel(text=>{if(!busy)$('status').textContent=text;}).then(()=>{if(!busy)$('status').textContent='Selecciona tu canción: la separación comenzará automáticamente.';},()=>{});
$('file').addEventListener('change',()=>{clear();$('error').hidden=true;controls();if($('file').files.length)run();});
$('run').addEventListener('click',run);
async function run(){
  if(busy||!$('file').files.length)return;
  const token=++generation;busy=true;controls();clear();$('error').hidden=true;$('progress').value=0;
  try{
    if(location.protocol==='file:')throw new Error('Abre BPM Studio desde su dirección HTTPS o http://127.0.0.1:8080; el navegador bloquea los módulos desde un archivo local.');
    parts=Array.from({length:4},()=>[]);outputFrames=0;
    sessionStorage.setItem('stems-in-progress','1');
    await preparation;if(token!==generation)return;
    worker=new Worker(new URL('./worker.js?v=bundled-1',import.meta.url),{type:'module'});
    worker.onmessage=async event=>{
      if(token!==generation)return;
      const message=event.data;if(message.text)$('status').textContent=message.text;
      if(message.type==='ready'){
        try{
          $('status').textContent='Leyendo y preparando tu audio…';
          const context=new AudioContext({sampleRate:44100});let decoded;
          try{decoded=await context.decodeAudioData(await $('file').files[0].arrayBuffer());}finally{await context.close();}
          if(token!==generation)return;
          if(decoded.sampleRate!==44100)throw new Error('Este navegador no admite la frecuencia de audio requerida.');
          const left=decoded.getChannelData(0).slice(),right=(decoded.numberOfChannels>1?decoded.getChannelData(1):decoded.getChannelData(0)).slice();decoded=null;
          worker.postMessage({left,right},[left.buffer,right.buffer]);
        }catch(e){if(token===generation)stop(e.message);}
      }
      if(message.type==='progress')$('progress').value=message.value;
      if(message.type==='block'){message.blocks.forEach((bytes,index)=>parts[index].push(new Blob([bytes])));outputFrames+=message.frames;}
      if(message.type==='done'){
        worker.terminate();worker=null;sessionStorage.removeItem('stems-in-progress');
        try{if(outputFrames!==message.frames)throw new Error('El audio llegó incompleto.');show(message.peaks,message.frames);parts=[];$('progress').value=1;$('status').textContent='Cuatro stems listos. Separación realizada en tu dispositivo.';}catch(e){error(e.message);}
        busy=false;controls();
      }
      if(message.type==='error')stop(message.text+' Prueba una pista más corta o usa stemd en tu Mac.');
    };
    worker.onerror=()=>{if(token===generation)stop('El motor se cerró inesperadamente. Prueba una pista más corta o usa stemd en tu Mac.');};
    worker.postMessage({type:'init'});
  }catch(e){if(token===generation){stop(e.message);}}
}
$('cancel').addEventListener('click',()=>{generation++;parts=[];sessionStorage.removeItem('stems-in-progress');worker?.terminate();worker=null;busy=false;controls();$('status').textContent='Separación cancelada.';});
window.addEventListener('pagehide',()=>{worker?.terminate();clear();});
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='stems-studio-visibility'&&!event.data.visible)document.querySelectorAll('audio').forEach(audio=>audio.pause());});
new ResizeObserver(()=>parent.postMessage({type:'stems-studio-resize',height:document.body.scrollHeight+24},location.origin)).observe(document.body);

if(sessionStorage.getItem('stems-in-progress')){sessionStorage.removeItem('stems-in-progress');error('La separación anterior se interrumpió al cerrarse o recargarse la página. No se reintentará automáticamente. Prueba una pista más corta o usa stemd en tu Mac.');}
