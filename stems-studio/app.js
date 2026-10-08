'use strict';
const $ = id => document.getElementById(id);
const local = location.protocol==='file:' || ['127.0.0.1','localhost'].includes(location.hostname) || location.hostname.endsWith('github.io');
const engine = local ? 'http://127.0.0.1:8421' : location.origin;
const parentOrigin = new URL(document.referrer || location.href).origin;
let accessToken = sessionStorage.getItem('stems-access') || '';
$('server-access').hidden=local;
$('access').value=accessToken;
$('access-form').addEventListener('submit',event=>{event.preventDefault();accessToken=$('access').value.trim();sessionStorage.setItem('stems-access',accessToken);connect();});
if(!local){$('processing-note').textContent='Tu archivo se procesa en el servidor dedicado. Puedes usar tu teléfono, tablet o computadora.';$('help-title').textContent='Cómo acceder al servidor';$('help-text').textContent='Introduce tu clave de acceso y selecciona un archivo. Mantén esta pestaña abierta mientras se procesa. No necesitas encender tu Mac.';}
let selected = null, online = false, busy = false, generation = 0, jobId = null, upload = null, mediaURLs = [];
const stages = {queued:'En cola',analysing:'Analizando la pista',separating:'Separando voces e instrumentos',reconstructing:'Reconstruyendo stems',writing:'Preparando archivos',done:'Separación completada'};
function controls(){ $('separate').disabled = busy || !online || !selected; $('file').disabled = busy; $('cancel').hidden = !busy; }
function message(text){ $('status').textContent=text; $('progress-area').hidden=false; }
function fail(error){ $('error').textContent=error.message || String(error); $('error').hidden=false; }
async function api(path, options={}){
  let response;
  try { response=await fetch(engine+path,{...(local?{targetAddressSpace:'loopback'}:{}),...options,headers:{'X-Requested-With':'StemsStudio',...(!local?{Authorization:`Bearer ${accessToken}`} : {}),...options.headers}}); }
  catch(error){ if(error.name==='AbortError')throw error; throw new Error(local?'No se pudo conectar con el motor local. Activa Stems Studio y permite la conexión local. También puedes abrir BPM Studio en http://127.0.0.1:8080.':'No se pudo conectar con el servidor dedicado. Comprueba tu conexión y reintenta.'); }
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error || `El motor respondió ${response.status}.`);}
  return response;
}
async function connect(){
  $('connection').textContent='Conectando con el motor…';
  try{
    const health=await (await api('/api/health',{signal:AbortSignal.timeout(10000)})).json();
    online=true; $('connection').textContent=health.device==='gpu'?'Motor conectado · GPU':'Motor conectado · CPU';
    $('model').textContent=`${health.preset || 'Modelo personalizado'} · ${health.model} · 44.1 kHz`;
    $('error').hidden=true;
  }catch(error){online=false;$('connection').textContent='Motor desconectado';$('model').textContent=local?'Activa el motor local para separar audio':'Conecta con tu clave de acceso';fail(error);}
  controls();
}
function clearResults(){for(const audio of document.querySelectorAll('audio'))audio.pause();for(const url of mediaURLs)URL.revokeObjectURL(url);mediaURLs=[];$('tracks').replaceChildren();$('results').hidden=true;}
function choose(file){if(busy)return;selected=file;$('filename').textContent=file?file.name:'Selecciona o arrastra un archivo de audio';$('error').hidden=true;clearResults();controls();}
async function pcm(file,token){
  if(file.size>200*1024*1024)throw new Error('Selecciona un archivo inferior a 200 MB.');
  message('Leyendo tu pista…');
  const context=new AudioContext();let decoded;
  try{decoded=await context.decodeAudioData(await file.arrayBuffer());}finally{await context.close();}
  if(token!==generation)throw new DOMException('Cancelado','AbortError');
  if(decoded.duration>600)throw new Error('Selecciona una pista de hasta diez minutos.');
  const offline=new OfflineAudioContext(2,Math.ceil(decoded.duration*44100),44100);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const stereo=await offline.startRendering();const left=stereo.getChannelData(0),right=stereo.getChannelData(1);
  const bytes=new ArrayBuffer(stereo.length*8),view=new DataView(bytes);
  for(let i=0;i<stereo.length;i++){view.setFloat32(i*8,left[i],true);view.setFloat32(i*8+4,right[i],true);}
  return bytes;
}
function waveform(buffer,values){
  const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=100;canvas.className='wave';
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Forma de onda del stem');
  const peaks=values?Float32Array.from(values):new Float32Array(700);
  for(let channel=0;buffer && channel<buffer.numberOfChannels;channel++){
    const samples=buffer.getChannelData(channel);
    for(let bin=0;bin<700;bin++)for(let i=Math.floor(bin*samples.length/700);i<Math.floor((bin+1)*samples.length/700);i++)peaks[bin]=Math.max(peaks[bin],Math.abs(samples[i]));
  }
  const maximum=Math.max(...peaks)||1,ctx=canvas.getContext('2d');ctx.fillStyle='#65b6ff';
  peaks.forEach((value,i)=>{const h=Math.max(1,value/maximum*88);ctx.fillRect(i*2,(100-h)/2,1.5,h);});return canvas;
}
async function results(job,token){
  if(!local)job=await (await api(`/api/jobs/${encodeURIComponent(job.id)}`)).json();
  const names={vocals:['Voces','Voz principal y coros'],drums:['Batería','Percusión y ritmo'],harmonics:['Armónicos','Bajo, teclados, guitarras y otros instrumentos']};
  const result=job.result;
  if(!result || !['vocals','drums','harmonics'].every(name=>result.stems.some(stem=>stem.name===name)))throw new Error('El motor no entregó los tres stems.');
  message('Descargando stems sin pérdida…');
  for(const name of ['vocals','drums','harmonics']){
    if(token!==generation)return;
    let url, decoded, peaks;
    if(local){
      const response=await api(`/api/jobs/${encodeURIComponent(job.id)}/stems/${name}`);
      const bytes=await response.arrayBuffer();if(token!==generation)return;
      const context=new AudioContext();try{decoded=await context.decodeAudioData(bytes.slice(0));}finally{await context.close();}
      url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));mediaURLs.push(url);
    }else{
      peaks=(await (await api(`/api/jobs/${encodeURIComponent(job.id)}/peaks/${name}`)).json()).peaks;
      url=new URL(result.stems.find(stem=>stem.name===name).download_url,engine).href;
    }
    if(token!==generation)return;
    const card=document.createElement('article');card.className='stem';
    const heading=document.createElement('div');heading.className='stem-head';const title=document.createElement('div');
    const h=document.createElement('h3');h.textContent=names[name][0];const small=document.createElement('small');small.textContent=names[name][1];title.append(h,small);
    const download=document.createElement('a');download.className='download';download.href=url;download.download=`${selected.name.replace(/\.[^.]+$/,'')}-${name}.wav`;download.textContent='↓ Descargar WAV';heading.append(title,download);
    const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=url;audio.setAttribute('aria-label',`Escuchar ${names[name][0]}`);
    audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();}));
    card.append(heading,waveform(decoded,peaks),audio);$('tracks').append(card);$('results').hidden=false;
  }
  message('Stems listos para escuchar y descargar.');$('progress').value=1;
}
async function separate(){
  if(busy||!selected)return;
  const token=++generation;busy=true;jobId=null;$('error').hidden=true;clearResults();controls();$('progress').value=0;
  try{
    if(!local && selected.size>99*1024*1024)throw new Error('Selecciona un archivo inferior a 99 MB.');
    const bytes=local?await pcm(selected,token):selected;if(token!==generation)return;
    message(local?'Enviando audio al motor local…':'Enviando audio al servidor…');upload=new AbortController();
    let job=await (await api(local?'/api/jobs':'/api/files',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes,signal:upload.signal})).json();
    upload=null;jobId=job.id;
    while(token===generation){
      const progress=job.progress || {};message(stages[progress.stage] || 'Procesando audio…');$('progress').value=Number(progress.fraction)||0;
      if(progress.stage==='done'){await results(job,token);break;}
      if(progress.stage==='failed'||progress.stage==='cancelled')throw new Error(job.error || 'Separación cancelada.');
      await new Promise(resolve=>setTimeout(resolve,1200));if(token!==generation)return;
      job=await (await api(`/api/jobs/${encodeURIComponent(jobId)}`)).json();
    }
  }catch(error){if(token===generation&&error.name!=='AbortError')fail(error);}
  finally{if(token===generation){busy=false;controls();}}
}
async function cancel(){generation++;upload?.abort();const id=jobId;jobId=null;busy=false;controls();message('Separación cancelada.');if(id)try{await api(`/api/jobs/${encodeURIComponent(id)}`,{method:'DELETE'});}catch(error){fail(error);}}
$('file').addEventListener('change',event=>choose(event.target.files[0]));$('separate').addEventListener('click',separate);$('cancel').addEventListener('click',cancel);$('reconnect').addEventListener('click',connect);
for(const type of ['dragenter','dragover'])$('drop').addEventListener(type,event=>{event.preventDefault();if(!busy)$('drop').classList.add('dragging');});
for(const type of ['dragleave','drop'])$('drop').addEventListener(type,event=>{event.preventDefault();$('drop').classList.remove('dragging');});
$('drop').addEventListener('drop',event=>{if(event.dataTransfer.files.length===1)choose(event.dataTransfer.files[0]);});
window.addEventListener('pagehide',()=>{upload?.abort();clearResults();});connect();
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===parentOrigin&&event.data?.type==='stems-studio-visibility'&&!event.data.visible)document.querySelectorAll('audio').forEach(audio=>audio.pause());});
let resizeTimer;
new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>parent.postMessage({type:'stems-studio-resize',height:document.body.scrollHeight+24},parentOrigin),80);}).observe(document.body);
