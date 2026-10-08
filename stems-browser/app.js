import {encodeWav as wav} from './audio.mjs';
const $=id=>document.getElementById(id);
let worker=null,busy=false,urls=[],generation=0;
const names=['Batería','Bajo','Otros instrumentos','Voces'],keys=['drums','bass','other','vocals'];
function controls(){ $('run').disabled=busy||!$('file').files.length;$('file').disabled=busy;$('cancel').hidden=!busy; }
function clear(){for(const audio of document.querySelectorAll('audio'))audio.pause();for(const url of urls)URL.revokeObjectURL(url);urls=[];$('tracks').replaceChildren();$('results').hidden=true;}
function error(text){$('error').textContent=text;$('error').hidden=false;}

function wave(stereo){const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=100;canvas.className='wave';canvas.setAttribute('aria-label','Forma de onda real del stem');const peaks=new Float32Array(700);for(const samples of stereo)for(let bin=0;bin<700;bin++)for(let i=Math.floor(bin*samples.length/700);i<Math.floor((bin+1)*samples.length/700);i++)peaks[bin]=Math.max(peaks[bin],Math.abs(samples[i]));const max=Math.max(...peaks)||1,ctx=canvas.getContext('2d');ctx.fillStyle='#65b6ff';peaks.forEach((p,i)=>{const h=Math.max(1,p/max*88);ctx.fillRect(i*2,(100-h)/2,1.5,h);});return canvas;}
function show(stems){stems.forEach((stereo,index)=>{const card=document.createElement('article');card.className='stem';const heading=document.createElement('div');heading.className='stem-head';const title=document.createElement('h3');title.textContent=names[index];const url=URL.createObjectURL(new Blob([wav(stereo)],{type:'audio/wav'}));urls.push(url);const link=document.createElement('a');link.href=url;link.className='download';link.download=`${$('file').files[0].name.replace(/\.[^.]+$/,'')}-${keys[index]}.wav`;link.textContent='↓ Descargar WAV';heading.append(title,link);const audio=document.createElement('audio');audio.src=url;audio.controls=true;audio.preload='metadata';audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();}));card.append(heading,wave(stereo),audio);$('tracks').append(card);});$('results').hidden=false;}
$('file').addEventListener('change',()=>{clear();$('error').hidden=true;controls();});
$('run').addEventListener('click',async()=>{
  const token=++generation;busy=true;controls();clear();$('error').hidden=true;$('progress').value=0;
  try{
    if(location.protocol==='file:')throw new Error('Abre BPM Studio desde su dirección HTTPS o http://127.0.0.1:8080; el navegador bloquea los módulos desde un archivo local.');
    $('status').textContent='Leyendo y preparando tu audio…';
    const context=new AudioContext();let decoded;try{decoded=await context.decodeAudioData(await $('file').files[0].arrayBuffer());}finally{await context.close();}
    const offline=new OfflineAudioContext(2,Math.ceil(decoded.duration*44100),44100),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const buffer=await offline.startRendering();decoded=null;
    if(token!==generation)return;
    const left=buffer.getChannelData(0).slice(),right=buffer.getChannelData(1).slice();
    if(!worker)worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.onmessage=event=>{if(token!==generation)return;const message=event.data;if(message.text)$('status').textContent=message.text;if(message.type==='progress')$('progress').value=message.value;if(message.type==='done'){try{show(message.stems);$('progress').value=1;$('status').textContent='Cuatro stems listos. Separación realizada en tu dispositivo.';}catch(e){error(e.message);}busy=false;controls();}if(message.type==='error'){error(message.text+' Prueba una pista más corta o usa stemd en tu Mac.');busy=false;controls();worker.terminate();worker=null;}};
    worker.onerror=()=>{if(token!==generation)return;error('No se pudo iniciar el motor del navegador. Usa la página HTTPS y comprueba tu conexión.');busy=false;controls();worker?.terminate();worker=null;};
    worker.postMessage({left,right},[left.buffer,right.buffer]);
  }catch(e){if(token===generation){error(e.message);busy=false;controls();}}
});
$('cancel').addEventListener('click',()=>{generation++;worker?.terminate();worker=null;busy=false;controls();$('status').textContent='Separación cancelada.';});
window.addEventListener('pagehide',()=>{worker?.terminate();clear();});
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='stems-studio-visibility'&&!event.data.visible)document.querySelectorAll('audio').forEach(audio=>audio.pause());});
new ResizeObserver(()=>parent.postMessage({type:'stems-studio-resize',height:document.body.scrollHeight+24},location.origin)).observe(document.body);
