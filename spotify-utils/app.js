import {initMedia} from './media.js?v=native-api-20261015-1';
import {createZip} from './zip.js?v=playlist-20261014-1';
// Static adaptation of TheyanzXD/spotify-utils: API and media remain on the requested provider.
const API=new URL('https://alokhamil.my.id/');
const $=id=>document.getElementById(id);
if(new URLSearchParams(location.search).has('embed'))document.documentElement.classList.add('embedded');
let tracks=[],playlist=[],index=-1,searchJob=null,downloadJob=null,downloadURL=null,playId=0;
let downloadRecord=null,queue=[],zipRunning=false,zipController=null,zipURL=null,importJob=null;
const conversions=[];
function stats(){for(const [id,value] of [['total',conversions.length],['processing',conversions.filter(x=>x.state==='processing').length],['ready',conversions.filter(x=>x.state==='ready').length],['error',conversions.filter(x=>x.state==='error').length]])$('stat-'+id).textContent=value;}
function conversion(){const record={state:'processing'};conversions.push(record);stats();return record;}
function mark(record,state){if(record){record.state=state;stats();}}
const filename=track=>`${track.artist} - ${track.title}`.replace(/[\x00-\x1f/\\:*?"<>|]/g,'_').slice(0,180);
function message(id,text,state=''){$(id).textContent=text;$(id).className=`status ${state}`;}
function endpoint(path,params={}){const url=new URL(path,API);url.search=new URLSearchParams(params).toString();return url.href;}
function safeImage(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}}
function cover(image,url){const valid=safeImage(url);image.hidden=!valid;if(valid)image.src=valid;else image.removeAttribute('src');image.onerror=()=>{image.hidden=true;};}
async function checked(response){
  if(!response.ok){let detail='';try{detail=(await response.json()).error||'';}catch{}throw new Error(`El proveedor respondió HTTP ${response.status}.${detail?' '+detail:''}`);}
  return response;
}
function failure(error){return error.name==='AbortError'?'La solicitud se canceló o el servicio tardó demasiado. Intenta de nuevo.':error.message||'No se pudo conectar con el proveedor.';}
function render(){
  $('tracks').replaceChildren();
  tracks.forEach((track,i)=>{
    const row=document.createElement('article');row.className='track';
    const image=document.createElement('img');image.className='cover';image.alt='';image.loading='lazy';cover(image,track.thumbnail);
    const meta=document.createElement('div');meta.className='track-meta';
    const title=document.createElement('p');title.className='track-title';title.textContent=track.title;
    const artist=document.createElement('p');artist.className='track-artist';artist.textContent=track.artist;
    const album=document.createElement('p');album.className='track-album';album.textContent=[track.album,track.duration].filter(Boolean).join(' · ');
    meta.append(title,artist,album);
    const actions=document.createElement('div');actions.className='track-actions';
    const play=document.createElement('button');play.type='button';play.textContent='Escuchar';play.setAttribute('aria-label',`Escuchar ${track.title} de ${track.artist}`);play.addEventListener('click',()=>{playlist=tracks.slice();playTrack(i);});
    const download=document.createElement('button');download.type='button';download.textContent='Preparar MP3';download.setAttribute('aria-label',`Preparar MP3 de ${track.title} de ${track.artist}`);download.addEventListener('click',()=>prepareDownload(track));
    download.disabled=zipRunning;const add=document.createElement('button');add.type='button';add.textContent='Añadir a playlist';add.disabled=zipRunning||Boolean(importJob);add.addEventListener('click',()=>addTracks([track]));actions.append(play,download,add);row.append(image,meta,actions);$('tracks').append(row);
  });
  $('results').hidden=!tracks.length;
}
$('search-form').addEventListener('submit',async event=>{
  event.preventDefault();const query=$('query').value.trim();if(!query){message('search-status','Escribe un título o artista.');return;}
  searchJob?.abort();const job=new AbortController();searchJob=job;const timer=setTimeout(()=>job.abort(),60000);
  $('search').disabled=true;tracks=[];render();message('search-status','Buscando en el proveedor…');
  try{
    const response=await checked(await fetch(endpoint('/api/search',{q:query}),{signal:job.signal}));
    const data=await response.json();if(!data.success||!Array.isArray(data.items))throw new Error(data.error||'El proveedor no devolvió resultados válidos.');
    if(searchJob!==job)return;
    tracks=data.items.filter(item=>typeof item?.title==='string'&&typeof item?.artist==='string').slice(0,10);render();
    message('search-status',tracks.length?`${tracks.length} resultados. Elige Escuchar o Preparar MP3.`:'No se encontraron canciones. Prueba otro título o artista.');
  }catch(error){if(searchJob===job)message('search-status',failure(error),'error');}
  finally{clearTimeout(timer);if(searchJob===job){searchJob=null;$('search').disabled=false;}}
});
function navigation(){$('previous').disabled=index<=0;$('next').disabled=index<0||index>=playlist.length-1;}
async function playTrack(nextIndex){
  const track=playlist[nextIndex];if(!track)return;index=nextIndex;const id=++playId;
  const audio=$('audio');audio.pause();audio.src=endpoint('/api/stream',{title:track.title,artist:track.artist});
  $('player-title').textContent=track.title;$('player-artist').textContent=track.artist;cover($('player-cover'),track.thumbnail);$('player').hidden=false;navigation();
  message('player-status','Preparando reproducción con el proxy del proveedor…');
  try{await audio.play();if(id===playId)message('player-status','Reproduciendo.');}
  catch(error){if(id===playId&&error.name!=='AbortError')message('player-status',error.name==='NotAllowedError'?'Pulsa reproducir en el control de audio para empezar.':'No se pudo reproducir el audio. El proveedor puede estar ocupado o haber fallado.','error');}
}
$('audio').addEventListener('playing',()=>message('player-status','Reproduciendo.'));
$('audio').addEventListener('pause',()=>{if($('audio').getAttribute('src'))message('player-status','En pausa.');});
$('previous').addEventListener('click',()=>playTrack(index-1));$('next').addEventListener('click',()=>playTrack(index+1));
$('close-player').addEventListener('click',()=>{playId++;$('audio').pause();$('audio').removeAttribute('src');$('audio').load();$('player').hidden=true;index=-1;});
$('audio').addEventListener('ended',()=>{if(index<playlist.length-1)playTrack(index+1);});
$('audio').addEventListener('error',()=>{if($('audio').getAttribute('src'))message('player-status','El proxy no pudo entregar este audio. Prueba otra canción o inténtalo más tarde.','error');});
function clearDownload(){if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;$('save').removeAttribute('href');$('save').hidden=true;}
async function receiveAudio(response,job,onProgress=null,limit=64*1024*1024){
  if(Number(response.headers.get('content-length'))>limit)throw new Error(`El archivo supera el límite de esta descarga (${(limit/1024/1024).toFixed(1)} MB).`);
  let blob;
  if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];let size=0,lastUpdate=0;
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error(`El archivo supera el límite de esta descarga (${(limit/1024/1024).toFixed(1)} MB).`);}
      chunks.push(value);
      if(Date.now()-lastUpdate>250){onProgress?.(size);lastUpdate=Date.now();}
    }
    blob=new Blob(chunks,{type:response.headers.get('content-type')||'audio/mpeg'});
  }else blob=await response.blob();
  if(!blob.size||blob.size>limit)throw new Error('El archivo está vacío o supera el espacio disponible de esta descarga.');
  return blob;
}
async function fetchTrack(track,job,onProgress,limit){
    // URL-encoded form is accepted by this Next.js API and avoids its unsupported OPTIONS preflight.
    const response=await checked(await fetch(endpoint('/api/download'),{method:'POST',body:new URLSearchParams({title:track.title,artist:track.artist}),signal:job.signal}));
    const data=await response.json();if(!data.success)throw new Error(data.error||'El proveedor no pudo preparar el MP3.');
    const url=new URL(data.streamUrl||endpoint('/api/file',{title:track.title,artist:track.artist}),API);
    if(url.origin!==API.origin||!/^\/api\/(download|file|stream)$/.test(url.pathname))throw new Error('El proveedor devolvió una ruta de audio no admitida.');
    const media=await checked(await fetch(url.href,{signal:job.signal}));
    const type=media.headers.get('content-type')||'';
    if(!/audio\/|application\/octet-stream/i.test(type))throw new Error('El proveedor no devolvió un archivo de audio.');
    const blob=await receiveAudio(media,job,onProgress,limit);
    return {blob,data};
}
async function prepareDownload(track){
  if(zipRunning)return;mark(downloadRecord,downloadJob?'canceled':downloadRecord?.state);

  downloadJob?.abort();clearDownload();const job=new AbortController();downloadJob=job;downloadRecord=conversion();const record=downloadRecord;queueControls();const timer=setTimeout(()=>job.abort(),180000);
  $('download-panel').hidden=false;$('download-heading').textContent='Preparando descarga';$('download-track').textContent=`${track.title} · ${track.artist}`;$('cancel-download').hidden=false;
  message('download-status','Solicitando el MP3 al proveedor…');
  try{
    const {blob,data}=await fetchTrack(track,job,size=>{if(downloadJob===job)message('download-status',`Recibiendo audio del proveedor · ${(size/1024/1024).toFixed(1)} MB…`);});
    if(downloadJob!==job)return;
    mark(record,'ready');downloadURL=URL.createObjectURL(blob);$('save').href=downloadURL;
    const name=`${data.artist||track.artist} - ${data.title||track.title}`.replace(/[\x00-\x1f/\\:*?"<>|]/g,'_').slice(0,180);
    $('save').download=`${name}.mp3`;$('save').hidden=false;$('download-heading').textContent='MP3 listo';
    message('download-status',`Archivo recibido · ${(blob.size/1024/1024).toFixed(1)} MB. Pulsa Guardar MP3 para descargarlo.`,'success');
  }catch(error){if(downloadJob===job){mark(record,'error');message('download-status',failure(error),'error');}}
  finally{clearTimeout(timer);if(downloadJob===job){downloadJob=null;$('cancel-download').hidden=true;queueControls();}}
}
$('cancel-download').addEventListener('click',()=>{downloadJob?.abort();if(downloadJob)mark(downloadRecord,'canceled');downloadJob=null;queueControls();clearDownload();$('cancel-download').hidden=true;message('download-status','Descarga cancelada.');});
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='spotify-visibility'&&!event.data.visible)$('audio').pause();});
window.addEventListener('pagehide',()=>{searchJob?.abort();downloadJob?.abort();zipController?.abort();importJob?.abort();$('audio').pause();clearDownload();clearZip();});
if(window.parent!==window){const resize=()=>parent.postMessage({type:'spotify-utils-resize',height:document.body.scrollHeight},location.origin);new ResizeObserver(resize).observe(document.body);window.addEventListener('load',resize);}

function clearZip(){if(zipURL)URL.revokeObjectURL(zipURL);zipURL=null;$('save-zip').hidden=true;$('save-zip').removeAttribute('href');$('partial-zip').hidden=true;}
function queueControls(){
  $('prepare-zip').disabled=zipRunning||Boolean(downloadJob)||Boolean(importJob)||!queue.length;
  $('clear-queue').disabled=zipRunning||Boolean(importJob)||!queue.length;
  for(const id of ['playlist-name','playlist-input','playlist-link','import-list','import-spotify'])$(id).disabled=zipRunning||Boolean(importJob);
  $('cancel-zip').hidden=!zipRunning;
}
function drawQueue(){
  $('queue').replaceChildren();
  const labels={pending:'Pendiente',processing:'Procesando',ready:'Lista',error:'Con error',canceled:'Cancelada'};
  queue.forEach((track,i)=>{
    const row=document.createElement('li'),text=document.createElement('span');text.textContent=`${track.title} · ${track.artist}`;
    const state=document.createElement('small');state.textContent=labels[track.state]+(track.error?` · ${track.error}`:'');text.append(document.createElement('br'),state);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Quitar';remove.disabled=zipRunning||Boolean(importJob);remove.setAttribute('aria-label',`Quitar ${track.title}`);
    remove.addEventListener('click',()=>{queue.splice(i,1);clearZip();drawQueue();message('queue-status',`${queue.length} canciones en la playlist.`);});row.append(text,remove);$('queue').append(row);
  });queueControls();
}
function addTracks(items){
  if(zipRunning||importJob)return;
  const available=50-queue.length,accepted=items.slice(0,available);
  clearZip();queue.push(...accepted.map(track=>({title:track.title,artist:track.artist,state:'pending'})));drawQueue();
  message('queue-status',`${queue.length} canciones en la playlist.${accepted.length<items.length?' Se alcanzó el límite de 50; las restantes no se añadieron.':''}`);
}
$('import-list').addEventListener('click',()=>{
  const lines=$('playlist-input').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),items=[];
  for(const line of lines){const split=line.lastIndexOf(' - ');if(split<1||split+3>=line.length||/^https?:/i.test(line)){message('queue-status','Usa una canción por línea: Título - Artista. Los enlaces de Spotify se importan en el campo de enlace.','error');return;}items.push({title:line.slice(0,split).trim(),artist:line.slice(split+3).trim()});}
  if(!items.length){message('queue-status','Pega al menos una canción.','error');return;}addTracks(items);$('playlist-input').value='';
});
$('spotify-import').addEventListener('submit',async event=>{
  event.preventDefault();if(zipRunning||importJob)return;
  let link;try{link=new URL($('playlist-link').value);if(link.protocol!=='https:'||link.hostname!=='open.spotify.com'||link.port||link.username||link.password||!/^\/(?:intl-[a-z]{2}\/)?playlist\/[A-Za-z0-9]{22}\/?$/.test(link.pathname))throw new Error();}catch{message('queue-status','Introduce el enlace completo de una playlist pública de Spotify.','error');return;}
  const job=new AbortController();importJob=job;queueControls();render();message('queue-status','Importando metadatos públicos de Spotify…');const timer=setTimeout(()=>job.abort(),90000);
  try{
    const metadata=new URL('https://jcarlos1215-bpm-studio-off-the-wall-mp3.onrender.com/api/spotify/playlist');metadata.searchParams.set('url',link.href);
    const data=await (await checked(await fetch(metadata.href,{signal:job.signal}))).json();
    if(!Array.isArray(data.tracks)||!data.tracks.length)throw new Error('Esta playlist no publica canciones accesibles.');
    if(importJob!==job)return;
    importJob=null;$('playlist-name').value=String(data.name||'Playlist de Spotify').slice(0,100);
    const overflow=data.tracks.length>50-queue.length;
    addTracks(data.tracks.filter(t=>typeof t?.title==='string'&&typeof t?.artist==='string'));
    message('queue-status',`${queue.length} canciones en la playlist. Se importaron metadatos públicos de Spotify.${data.truncated||overflow?' Se alcanzó el límite de 50; no se añadieron todas las canciones.':''}`);
  }catch(error){if(importJob===job)message('queue-status',failure(error),'error');}
  finally{clearTimeout(timer);if(importJob===job)importJob=null;queueControls();render();}
});
$('clear-queue').addEventListener('click',()=>{if(zipRunning)return;queue=[];clearZip();drawQueue();message('queue-status','La playlist está vacía.');});
$('playlist-name').addEventListener('input',()=>{clearZip();});
async function packageQueue(signal){
  const ready=queue.filter(t=>t.state==='ready'&&t.blob);if(!ready.length)throw new Error('No hay canciones listas para crear el ZIP.');
  const files=ready.map(t=>({name:t.filename,blob:t.blob}));
  const m3u='#EXTM3U\n'+ready.map(t=>`#EXTINF:-1,${t.artist} - ${t.title}`.replace(/[\r\n]/g,' ')+'\n'+t.filename).join('\n')+'\n';
  const report=queue.map((t,i)=>`${i+1}. ${t.title} - ${t.artist}: ${t.state}${t.error?' ('+t.error+')':''}`).join('\n');
  files.push({name:'playlist.m3u8',blob:new Blob([m3u],{type:'text/plain;charset=utf-8'})},{name:'reporte.txt',blob:new Blob([report],{type:'text/plain;charset=utf-8'})});
  const zip=await createZip(files,{signal});if(signal.aborted)return;
  clearZip();zipURL=URL.createObjectURL(zip);$('save-zip').href=zipURL;$('save-zip').download=filename({artist:'',title:$('playlist-name').value.trim()||'Mi playlist'}).replace(/^ - /,'')+'.zip';$('save-zip').hidden=false;
  message('queue-status',`ZIP listo: ${ready.length} de ${queue.length} canciones · ${(zip.size/1024/1024).toFixed(1)} MB. Incluye playlist M3U8 y reporte.${ready.length<queue.length?' Es una descarga parcial: revisa las canciones pendientes o con error.':''}`,ready.length===queue.length?'success':'error');
}
$('prepare-zip').addEventListener('click',async()=>{
  if(zipRunning||downloadJob||!queue.length)return;
  clearZip();zipRunning=true;const controller=new AbortController();zipController=controller;
  let total=0;
  for(const track of queue){track.blob=null;track.error='';track.state='pending';track.record={state:'queued'};conversions.push(track.record);}
  stats();drawQueue();render();
  try{
    for(let i=0;i<queue.length;i++){
      if(controller.signal.aborted)break;
      const track=queue[i];track.state='processing';mark(track.record,'processing');drawQueue();message('queue-status',`Procesando ${i+1}/${queue.length}: ${track.title}`);
      const job=new AbortController(),abort=()=>job.abort();controller.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>job.abort(),180000);
      try{
        const remaining=150*1024*1024-total;if(remaining<=0)throw new Error('Se alcanzó el límite de 150 MB del ZIP.');
        const {blob}=await fetchTrack(track,job,null,Math.min(64*1024*1024,remaining));
        if(controller.signal.aborted)break;
        track.blob=blob;total+=blob.size;track.filename=`${String(i+1).padStart(3,'0')} - ${filename(track)}.mp3`;track.state='ready';mark(track.record,'ready');
      }catch(error){if(controller.signal.aborted)break;track.state='error';track.error=failure(error);mark(track.record,'error');}
      finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);}
      drawQueue();
    }
    if(!controller.signal.aborted){message('queue-status','Creando ZIP…');await packageQueue(controller.signal);}
  }catch(error){if(!controller.signal.aborted)message('queue-status',failure(error),'error');}
  finally{
    if(controller.signal.aborted){for(const track of queue)if(['pending','processing'].includes(track.state)){track.state='canceled';mark(track.record,'canceled');}message('queue-status','ZIP cancelado. Puedes guardar las canciones que ya estaban listas.');}
    zipRunning=false;zipController=null;drawQueue();render();$('partial-zip').hidden=Boolean(zipURL)||!queue.some(t=>t.blob);
  }
});
$('cancel-zip').addEventListener('click',()=>{zipController?.abort();message('queue-status','Cancelando ZIP…');});
$('partial-zip').addEventListener('click',async()=>{
  if(zipRunning)return;zipRunning=true;const controller=new AbortController();zipController=controller;queueControls();drawQueue();render();
  try{await packageQueue(controller.signal);}catch(error){message('queue-status',failure(error),'error');}
  finally{zipRunning=false;zipController=null;drawQueue();render();$('partial-zip').hidden=Boolean(zipURL)||!queue.some(t=>t.blob);}
});
drawQueue();stats();

const mediaRecords=new Map();
initMedia((key,states)=>{let records=mediaRecords.get(key);if(!records){records=[];mediaRecords.set(key,records);}while(records.length<states.length){const record={state:'queued'};records.push(record);conversions.push(record);}records.forEach((record,i)=>{record.state=states[i]||'canceled';});stats();});

$('search').disabled=false;
