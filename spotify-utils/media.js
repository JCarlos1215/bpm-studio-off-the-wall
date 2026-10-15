const DEFAULT_API=['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:8093/':'https://jcarlos1215-bpm-studio-off-the-wall-mp3.onrender.com/';
const $=id=>document.getElementById(id);
function validAPI(value){const url=new URL(value);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Usa la URL HTTPS del servidor, sin rutas ni credenciales.');return url;}
let backend=new URL(DEFAULT_API);try{backend=validAPI(localStorage.getItem('bpm-download-api')||DEFAULT_API);}catch{}
const terminal=new Set(['completed','partial','failed','cancelled']);
const labels={queued:'En cola',resolving:'Leyendo enlace',processing:'Procesando',searching:'Buscando audio',downloading:'Descargando',converting:'Convirtiendo a MP3',tagging:'Añadiendo etiquetas',completed:'Lista',partial:'Parcial',failed:'Con error',cancelled:'Cancelada'};
export function initMedia(onStates){
 const runs=new Set(),urls=new Set();let configured=false,sequence=0,buffered=0;
 const status=(text,error=false)=>{$('media-status').textContent=text;$('media-status').className='status'+(error?' error':'');};
 function controls(){$('media-submit').disabled=!configured||runs.size>=100;$('media-api-connect').disabled=runs.size>0;$('media-api-url').disabled=runs.size>0;}
 async function api(path,options={},base=backend){
  const response=await fetch(new URL(path,base),{...options,headers:{'Content-Type':'application/json','X-Requested-With':'AllToMP3'}});
  let data;try{data=await response.json();}catch{throw new Error('El servidor no pudo responder. Si está iniciándose, reintenta en un minuto.');}
  if(!response.ok)throw new Error(data.error||`El servidor respondió HTTP ${response.status}.`);return data;
 }
 async function connect(base,save=false){
  configured=false;controls();status('Conectando con la API…');
  try{
   const config=await api('/api/media/config',{signal:AbortSignal.timeout(90000)},base);
   configured=config.configured===true&&['native','apify'].includes(config.provider);
   backend=base;$('media-api-url').value=base.href;
   if(save){try{localStorage.setItem('bpm-download-api',base.href);}catch{}}
   status((config.message||'API pendiente de configurar.')+(config.provider==='native'?` ${config.concurrency} trabajos activos como máximo; capacidad de cola: ${config.queue_limit}.`:''),!configured);
  }catch(error){status(error.message,true);}finally{controls();}
 }
 $('media-api-connect').addEventListener('click',()=>{if(runs.size)return;try{connect(validAPI($('media-api-url').value.trim()),true);}catch(error){status(error.message,true);}});
 function states(run,job){
  const map={completed:'ready',failed:'error',cancelled:'canceled',queued:'queued'};
  run.states=job.tracks?.length?job.tracks.map(t=>map[t.status]||'processing'):[map[job.status]||'processing'];onStates(run.key,run.states);
  run.list.replaceChildren();for(const t of job.tracks||[]){const li=document.createElement('li');li.textContent=`${t.title||'Audio'} · ${labels[t.status]||t.status}${t.error?' · '+t.error:''}`;run.list.append(li);}
  const progress=(job.tracks||[]).reduce((sum,t)=>sum+(t.progress||0),0)/Math.max(1,job.tracks?.length||0);
  if(job.tracks?.length)run.progress.value=progress;
 }
 async function cancel(run){
  if(run.cancelRequested)return;run.cancelRequested=true;run.cancel.disabled=true;run.text.textContent='Cancelando…';
  if(!run.id)return;
  try{const {job}=await api(`/api/media/jobs/${run.id}/cancel`,{method:'POST'},run.base);states(run,job);run.cancelled=true;run.abort.abort();run.text.textContent='Descarga cancelada.';}
  catch(error){run.cancelRequested=false;run.cancel.disabled=false;run.text.textContent='No se pudo confirmar la cancelación. '+error.message;}
 }
 $('media-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!configured||runs.size>=100)return;
  let url;try{url=new URL($('media-url').value.trim());if(url.protocol!=='https:'||url.username||url.password||url.port||!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','soundcloud.com','www.soundcloud.com','m.soundcloud.com'].includes(url.hostname))throw new Error();}catch{status('Pega un enlace HTTPS de YouTube o SoundCloud.',true);return;}
  const run={key:`media-${++sequence}`,base:new URL(backend),id:null,abort:new AbortController(),states:['processing'],cancelRequested:false,cancelled:false};
  const card=document.createElement('article');card.className='media-job';const heading=document.createElement('h3');heading.textContent=`Descarga ${sequence}`;
  const source=document.createElement('p');source.className='muted small';source.textContent=url.href;
  run.text=document.createElement('p');run.text.className='status';run.text.setAttribute('role','status');run.text.textContent='Enviando enlace…';
  run.progress=document.createElement('progress');run.progress.max=100;run.list=document.createElement('ol');
  run.cancel=document.createElement('button');run.cancel.type='button';run.cancel.textContent='Cancelar';run.cancel.addEventListener('click',()=>cancel(run));
  const save=document.createElement('a');save.className='button primary';save.hidden=true;save.download='';
  const actions=document.createElement('div');actions.className='download-actions';actions.append(run.cancel,save);card.append(heading,source,run.text,run.progress,run.list,actions);$('media-jobs').prepend(card);
  const zip=$('media-playlist').checked,bitrate=Number($('media-bitrate').value);runs.add(run);onStates(run.key,run.states);controls();status(`${runs.size} solicitud(es) en seguimiento. Puedes añadir otro enlace.`);
  let bytes=0,retained=false;
  const timer=setTimeout(()=>cancel(run),20*60*1000);
  try{
   const {job:created}=await api('/api/media/jobs',{method:'POST',signal:AbortSignal.timeout(90000),body:JSON.stringify({url:url.href,bitrate,playlist:zip})},run.base);
   if(!/^[a-f0-9]{32}$/.test(created.id))throw new Error('Identificador de conversión no válido.');run.id=created.id;
   if(run.cancelRequested){run.cancelRequested=false;await cancel(run);if(run.cancelled)return;}
   let job=created;
   while(!terminal.has(job.status)){
    states(run,job);run.text.textContent=labels[job.status]||'Procesando…';
    await new Promise(resolve=>setTimeout(resolve,2000));if(run.cancelled)return;
    job=(await api(`/api/media/jobs/${run.id}`,{signal:run.abort.signal},run.base)).job;
   }
   states(run,job);if(job.status==='cancelled'){run.text.textContent='Descarga cancelada.';return;}
   const ready=(job.tracks||[]).filter(t=>t.status==='completed');
   if(!ready.length)throw new Error(job.error||job.tracks?.find(t=>t.error)?.error||'No se pudo descargar este enlace.');
   const archive=zip||ready.length>1,index=job.tracks.findIndex(t=>t.status==='completed');
   const path=archive?`/api/media/jobs/${run.id}/archive`:`/api/media/jobs/${run.id}/tracks/${index}/download`;
   run.text.textContent='Recibiendo el archivo…';const response=await fetch(new URL(path,run.base),{signal:run.abort.signal});
   const type=response.headers.get('content-type')||'';if(!response.ok||!(archive?/application\/zip/:/audio\/mpeg/).test(type))throw new Error('El servidor no pudo entregar el archivo esperado.');
   const reader=response.body.getReader(),chunks=[];
   for(;;){const {value,done}=await reader.read();if(done)break;if(buffered+value.length>150*1024*1024){await reader.cancel();throw new Error('Se alcanzó el límite de 150 MB en esta página. Guarda tus archivos y recarga.');}bytes+=value.length;buffered+=value.length;chunks.push(value);}
   if(run.cancelled)return;
   const blobURL=URL.createObjectURL(new Blob(chunks,{type}));urls.add(blobURL);retained=true;save.href=blobURL;save.download=(String(archive?job.title:ready[0].title).replace(/[\x00-\x1f/\\:*?"<>|]/g,'_').slice(0,180)||'descarga')+(archive?'.zip':'.mp3');save.textContent=archive?'Guardar ZIP':'Guardar MP3';save.hidden=false;
   run.text.textContent=`${ready.length} audio(s) listo(s) · ${(bytes/1024/1024).toFixed(1)} MB.${job.status==='partial'?' Revisa las pistas con error.':''}`;run.progress.value=100;
  }catch(error){if(!run.cancelled){onStates(run.key,run.states.map(s=>s==='ready'?'ready':'error'));run.text.textContent=error.name==='AbortError'?'La conexión se interrumpió. Revisa el estado antes de reintentar.':error.message;run.text.classList.add('error');}}
  finally{clearTimeout(timer);if(!retained)buffered-=bytes;run.cancel.hidden=true;runs.delete(run);controls();}
 });
 $('media-api-url').value=backend.href;controls();connect(backend);
 window.addEventListener('pagehide',()=>{for(const run of runs){if(run.id)fetch(new URL(`/api/media/jobs/${run.id}/cancel`,run.base),{method:'POST',headers:{'X-Requested-With':'AllToMP3'},keepalive:true}).catch(()=>{});run.abort.abort();}for(const url of urls)URL.revokeObjectURL(url);});
}
