// Static adaptation of TheyanzXD/spotify-utils: API and media remain on the requested provider.
const API=new URL('https://alokhamil.my.id/');
const $=id=>document.getElementById(id);
if(new URLSearchParams(location.search).has('embed'))document.documentElement.classList.add('embedded');
let tracks=[],playlist=[],index=-1,searchJob=null,downloadJob=null,downloadURL=null,playId=0;
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
    actions.append(play,download);row.append(image,meta,actions);$('tracks').append(row);
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
async function receiveAudio(response,job){
  const limit=64*1024*1024;
  if(Number(response.headers.get('content-length'))>limit)throw new Error('El archivo supera 64 MB. Prueba una pista más corta.');
  let blob;
  if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];let size=0,lastUpdate=0;
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('El archivo supera 64 MB. Prueba una pista más corta.');}
      chunks.push(value);
      if(downloadJob===job&&Date.now()-lastUpdate>250){message('download-status',`Recibiendo audio del proveedor · ${(size/1024/1024).toFixed(1)} MB…`);lastUpdate=Date.now();}
    }
    blob=new Blob(chunks,{type:response.headers.get('content-type')||'audio/mpeg'});
  }else blob=await response.blob();
  if(!blob.size||blob.size>limit)throw new Error('El archivo está vacío o supera 64 MB.');
  return blob;
}
async function prepareDownload(track){
  downloadJob?.abort();clearDownload();const job=new AbortController();downloadJob=job;const timer=setTimeout(()=>job.abort(),180000);
  $('download-panel').hidden=false;$('download-heading').textContent='Preparando descarga';$('download-track').textContent=`${track.title} · ${track.artist}`;$('cancel-download').hidden=false;
  message('download-status','Solicitando el MP3 al proveedor…');
  try{
    // URL-encoded form is accepted by this Next.js API and avoids its unsupported OPTIONS preflight.
    const response=await checked(await fetch(endpoint('/api/download'),{method:'POST',body:new URLSearchParams({title:track.title,artist:track.artist}),signal:job.signal}));
    const data=await response.json();if(!data.success)throw new Error(data.error||'El proveedor no pudo preparar el MP3.');
    const url=new URL(data.streamUrl||endpoint('/api/file',{title:track.title,artist:track.artist}),API);
    if(url.origin!==API.origin||!/^\/api\/(download|file|stream)$/.test(url.pathname))throw new Error('El proveedor devolvió una ruta de audio no admitida.');
    const media=await checked(await fetch(url.href,{signal:job.signal}));
    const type=media.headers.get('content-type')||'';
    if(!/audio\/|application\/octet-stream/i.test(type))throw new Error('El proveedor no devolvió un archivo de audio.');
    const blob=await receiveAudio(media,job);
    if(downloadJob!==job)return;
    downloadURL=URL.createObjectURL(blob);$('save').href=downloadURL;
    const name=`${data.artist||track.artist} - ${data.title||track.title}`.replace(/[\x00-\x1f/\\:*?"<>|]/g,'_').slice(0,180);
    $('save').download=`${name}.mp3`;$('save').hidden=false;$('download-heading').textContent='MP3 listo';
    message('download-status',`Archivo recibido · ${(blob.size/1024/1024).toFixed(1)} MB. Pulsa Guardar MP3 para descargarlo.`,'success');
  }catch(error){if(downloadJob===job)message('download-status',failure(error),'error');}
  finally{clearTimeout(timer);if(downloadJob===job){downloadJob=null;$('cancel-download').hidden=true;}}
}
$('cancel-download').addEventListener('click',()=>{downloadJob?.abort();downloadJob=null;clearDownload();$('cancel-download').hidden=true;message('download-status','Descarga cancelada.');});
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='spotify-visibility'&&!event.data.visible)$('audio').pause();});
window.addEventListener('pagehide',()=>{searchJob?.abort();downloadJob?.abort();$('audio').pause();clearDownload();});
if(window.parent!==window){const resize=()=>parent.postMessage({type:'spotify-utils-resize',height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)},location.origin);new ResizeObserver(resize).observe(document.body);window.addEventListener('load',resize);}
