const BACKEND=new URL(['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:8093/':'https://jcarlos1215-bpm-studio-off-the-wall-mp3.onrender.com/');
const $=id=>document.getElementById(id);
const terminal=new Set(['completed','partial','failed','cancelled']);
const labels={queued:'En cola',resolving:'Leyendo enlace',processing:'Procesando',searching:'Buscando audio',downloading:'Descargando',converting:'Convirtiendo a MP3',tagging:'Añadiendo etiquetas',completed:'Lista',partial:'Parcial',failed:'Con error',cancelled:'Cancelada'};
export function initMedia(onStates){
 let active=null,sequence=0,objectURL=null;
 const status=(text,state='')=>{$('media-status').textContent=text;$('media-status').className=`status ${state}`;};
 const clear=()=>{if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;$('media-save').hidden=true;$('media-save').removeAttribute('href');};
 const controls=busy=>{for(const id of ['media-url','media-bitrate','media-playlist','media-submit'])$(id).disabled=busy;$('media-cancel').hidden=!busy;};
 async function api(path,options={}){
  const response=await fetch(new URL(path,BACKEND),{...options,headers:{'Content-Type':'application/json','X-Requested-With':'AllToMP3',...options.headers}});
  let data;try{data=await response.json();}catch{throw new Error('El servidor se está iniciando o no pudo responder. Intenta de nuevo en un minuto.');}
  if(!response.ok)throw new Error(data.error||`El servidor respondió HTTP ${response.status}.`);return data;
 }
 function states(run,job){
  const map={completed:'ready',failed:'error',cancelled:'canceled',queued:'queued'};
  run.lastStates=job.tracks?.length?job.tracks.map(t=>map[t.status]||'processing'):[map[job.status]||'processing'];onStates(run.key,run.lastStates);
  $('media-tracks').replaceChildren();
  for(const track of job.tracks||[]){const row=document.createElement('li');row.textContent=`${track.title||'Audio'} · ${labels[track.status]||track.status}${Number.isFinite(track.progress)?' · '+Math.round(track.progress)+'%':''}${track.error?' · '+track.error:''}`;$('media-tracks').append(row);}
 }
 async function cancel(run){
  if(!run||run.cancelled)return;run.cancelled=true;$('media-cancel').disabled=true;status('Cancelando en el servidor…');
  if(run.id){try{const {job}=await api(`/api/media/jobs/${run.id}/cancel`,{method:'POST'});states(run,job);run.abort.abort();status('Descarga cancelada.');}catch(error){run.cancelled=false;status('No se pudo confirmar la cancelación. '+error.message,'error');}finally{$('media-cancel').disabled=false;}}
 }
 $('media-cancel').addEventListener('click',()=>cancel(active));
 $('media-form').addEventListener('submit',async event=>{
  event.preventDefault();if(active)return;
  let url;try{url=new URL($('media-url').value.trim());if(url.protocol!=='https:'||url.username||url.password||url.port||!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','soundcloud.com','www.soundcloud.com','m.soundcloud.com'].includes(url.hostname))throw new Error();}catch{status('Pega un enlace HTTPS de YouTube o SoundCloud.','error');return;}
  clear();$('media-tracks').replaceChildren();const run={key:`media-${++sequence}`,abort:new AbortController(),id:null,cancelled:false};active=run;controls(true);onStates(run.key,['processing']);$('media-progress').hidden=false;$('media-progress').removeAttribute('value');status('Conectando con yt-dlp…');
  const timer=setTimeout(()=>{run.timedOut=true;cancel(run);},20*60*1000);
  try{
   const creation=new AbortController(),creationTimer=setTimeout(()=>creation.abort(),90000);let created;
   try{created=(await api('/api/media/jobs',{method:'POST',signal:creation.signal,body:JSON.stringify({url:url.href,bitrate:Number($('media-bitrate').value),playlist:$('media-playlist').checked})})).job;}finally{clearTimeout(creationTimer);}
   if(!/^[a-f0-9]{32}$/.test(created.id))throw new Error('Identificador de conversión no válido.');run.id=created.id;
   if(run.cancelled){run.cancelled=false;await cancel(run);if(run.cancelled)return;}
   let job=created;
   while(!terminal.has(job.status)){
    if(run.abort.signal.aborted)return;
    states(run,job);status(labels[job.status]||'Procesando…');
    const progress=(job.tracks||[]).reduce((sum,t)=>sum+(t.progress||0),0)/Math.max(1,job.tracks?.length||0);if(job.tracks?.length)$('media-progress').value=progress;
    await new Promise(resolve=>setTimeout(resolve,2000));if(run.abort.signal.aborted)return;
    job=(await api(`/api/media/jobs/${run.id}`,{signal:run.abort.signal})).job;
   }
   states(run,job);
   const ready=(job.tracks||[]).filter(t=>t.status==='completed');
   if(job.status==='cancelled'){status('Descarga cancelada.');return;}
   if(!ready.length)throw new Error(job.error||job.tracks?.find(t=>t.error)?.error||'No se pudo descargar este enlace.');
   const zip=$('media-playlist').checked||ready.length>1;
   const index=job.tracks.findIndex(t=>t.status==='completed');
   const path=zip?`/api/media/jobs/${run.id}/archive`:`/api/media/jobs/${run.id}/tracks/${index}/download`;
   status('Recibiendo el archivo del servidor…');
   const response=await fetch(new URL(path,BACKEND),{signal:run.abort.signal});
   if(!response.ok)throw new Error('El servidor no pudo entregar el archivo.');
   const type=response.headers.get('content-type')||'';if(!(zip?/application\/zip/:/audio\/mpeg/).test(type))throw new Error('El servidor no devolvió el archivo esperado.');
   const limit=150*1024*1024;const reader=response.body.getReader(),chunks=[];let size=0;
   for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('El archivo supera 150 MB. Descarga menos pistas por tanda.');}chunks.push(value);}
   if(run.cancelled||active!==run)return;
   objectURL=URL.createObjectURL(new Blob(chunks,{type}));$('media-save').href=objectURL;
   const title=String(zip?job.title:ready[0].title).replace(/[\x00-\x1f/\\:*?"<>|]/g,'_').slice(0,180)||'descarga';$('media-save').download=title+(zip?'.zip':'.mp3');$('media-save').textContent=zip?'Guardar ZIP':'Guardar MP3';$('media-save').hidden=false;$('media-progress').value=100;
   status(`${ready.length} audio(s) listo(s) · ${(size/1024/1024).toFixed(1)} MB.${job.status==='partial'?' La descarga es parcial; revisa las pistas con error.':''}`,job.status==='partial'?'error':'success');
  }catch(error){if(run.cancelled&&!run.id){onStates(run.key,['error']);status('No se pudo confirmar la creación o cancelación en el servidor. Intenta de nuevo.','error');}else if(!run.cancelled){onStates(run.key,(run.lastStates||['processing']).map(s=>s==='ready'?'ready':'error'));status(error.name==='AbortError'?'La conexión se interrumpió. Puedes reintentar.':error.message,'error');}}
  finally{clearTimeout(timer);if(run.id&&run.cancelled)onStates(run.key,(run.lastStates||['processing']).map(s=>['ready','error'].includes(s)?s:'canceled'));if(active===run){active=null;controls(false);$('media-cancel').disabled=false;$('media-progress').hidden=$('media-save').hidden;}}
 });
 window.addEventListener('pagehide',()=>{if(active?.id)fetch(new URL(`/api/media/jobs/${active.id}/cancel`,BACKEND),{method:'POST',headers:{'X-Requested-With':'AllToMP3'},keepalive:true}).catch(()=>{});active?.abort.abort();clear();});
}
