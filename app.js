import {TempoTracker} from './tempo.js?v=tempo-20261007-2';
const $=id=>document.getElementById(id);
const tracker=new TempoTracker();
let context,stream,source,analyser,processor,frame=0,running=false,busy=false,view='spectrum',sessionPeak=0,seconds=0,lastRms=0,beat=0,previousRms=0,lastBeat=0,generation=0;
let spectrum,wave,trackMuted=false;
const db=v=>v>1e-8?20*Math.log10(v):-Infinity;
const dbText=v=>Number.isFinite(v)?v.toFixed(1):'−∞';
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function status(text,state=''){$('statusText').textContent=text;$('status').className='status '+state;}
function controls(){ $('toggle').disabled=busy;$('device').disabled=running||busy;$('toggleText').textContent=busy?'Conectando…':running?'Detener micrófono':'Iniciar micrófono';$('toggleIcon').textContent=running?'■':'▶';$('timeState').textContent=running?'en vivo':seconds?'detenido':'listo'; }
async function devices(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  try{const list=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='audioinput');const selected=$('device').value;$('device').replaceChildren(new Option('Micrófono predeterminado',''));list.forEach((d,i)=>{if(d.deviceId)$('device').add(new Option(d.label||`Entrada ${i+1}`,d.deviceId));});if([...$('device').options].some(x=>x.value===selected))$('device').value=selected;}
  catch{/* Device enumeration may be restricted until permission is granted. */}
}
function showTempo(result){
  $('bpm').textContent=result?result.bpm.toFixed(1):'—';$('confidence').textContent=result?`${result.confidence}%`:'—';$('confidenceFill').style.width=`${result?.confidence||0}%`;
  $('stability').textContent=result?(result.stable?'Pulso estable':'Estabilizando…'):'Sin tempo fiable';
  $('tempoHint').textContent=result?'Tempo estimado · escucha el pulso':seconds<6?'Escuchando… necesitamos al menos 6 segundos.':lastRms<.001?'Señal muy baja. Acerca el sonido o sube la sensibilidad.':'Buscando un ritmo repetido…';
}
function clearReadings(){tracker.reset();sessionPeak=0;seconds=0;lastRms=0;previousRms=0;beat=0;lastBeat=0;$('peak').textContent='−∞';$('rms').textContent='0.000';$('inputDb').textContent='−∞';$('frequency').textContent='—';$('duration').textContent='00:00';$('levelFill').style.width='0%';$('clipLabel').textContent='Máximo desde el inicio';$('clipLabel').style.color='';showTempo(null);document.querySelectorAll('.beat-row span').forEach(x=>x.classList.remove('on'));if(!running){$('stability').textContent='Sin análisis';$('tempoHint').textContent='Activa el micrófono para encontrar el tempo.';}controls();}
function receive(batch){
  if(!running||trackMuted)return;
  for(const sample of batch){seconds+=Math.round(context.sampleRate/100)/context.sampleRate;sessionPeak=Math.max(sessionPeak,sample.peak);const result=tracker.push(sample.beatRms ?? sample.rms,Number($('sensitivity').value),sample.rms>10**((-45-Number($('sensitivity').value)*.3)/20)?sample.spectralFlux:0);if(result!==undefined)showTempo(result);}
  lastRms=Math.sqrt(batch.reduce((sum,s)=>sum+s.rms*s.rms,0)/batch.length);
  $('rms').textContent=lastRms.toFixed(3);$('inputDb').textContent=dbText(db(lastRms));$('peak').textContent=dbText(db(sessionPeak));$('clipLabel').textContent=sessionPeak>=.99?'Saturación detectada · baja la entrada':'Máximo desde el inicio';$('clipLabel').style.color=sessionPeak>=.99?'#ffad96':'';
  $('levelFill').style.width=`${Math.min(100,Math.max(0,(db(lastRms)+60)/60*100))}%`;
  const t=Math.floor(seconds);$('duration').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  if(lastRms>Math.max(.002,previousRms*1.5)&&seconds-lastBeat>.23){beat=(beat+1)%4;lastBeat=seconds;document.querySelectorAll('.beat-row span').forEach((x,i)=>x.classList.toggle('on',i===beat));}
  if(seconds-lastBeat>.2)document.querySelectorAll('.beat-row span').forEach(x=>x.classList.remove('on'));
  previousRms=lastRms;
}
async function start(){
  if(busy||running)return;
  if(!isSecureContext){status('Conexión no segura','error');message('Para usar el micrófono, abre la app en localhost o en una dirección HTTPS.',true);return;}
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!navigator.mediaDevices?.getUserMedia||!AC){status('Navegador no compatible','error');message('Este navegador no permite capturar audio. Abre la app en una versión actual de Chrome, Edge, Firefox o Safari.',true);return;}
  busy=true;controls();status('Solicitando permiso');message('Permite el uso del micrófono en el aviso del navegador.');const id=++generation;
  try{
    context=new AC();const resume=context.resume();
    const deviceId=$('device').value;
    stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(id!==generation){stream.getTracks().forEach(t=>t.stop());return;}
    await resume;
    if(!context.audioWorklet)throw new Error('WORKLET');
    await context.audioWorklet.addModule('./audio-processor.js?v=tempo-20261007-2');
    source=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=8192;analyser.smoothingTimeConstant=.65;analyser.minDecibels=-100;analyser.maxDecibels=-10;
    processor=new AudioWorkletNode(context,'signal-processor',{channelCount:1,channelCountMode:'explicit',numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    source.connect(analyser);source.connect(processor);processor.connect(context.destination);processor.port.onmessage=e=>receive(e.data);
    spectrum=new Float32Array(analyser.frequencyBinCount);wave=new Float32Array(analyser.fftSize);
    running=true;trackMuted=false;clearReadings();$('scopeEmpty').hidden=true;$('sampleRate').textContent=`${(context.sampleRate/1000).toFixed(1)} kHz · MONO`;$('liveLabel').textContent='EN VIVO';status('Micrófono activo','active');
    message('Escuchando. Deja sonar un ritmo durante 8–15 segundos. El audio permanece en tu dispositivo.');
    const track=stream.getAudioTracks()[0];track.onended=()=>{stop();status('Micrófono desconectado','error');message('Se desconectó el dispositivo. Selecciona una entrada disponible y vuelve a iniciar.',true);devices();};
    track.onmute=()=>{trackMuted=true;status('Entrada interrumpida','error');message('El dispositivo ha interrumpido el audio. Espera a que se recupere o detén y vuelve a iniciar.',true);};
    track.onunmute=()=>{trackMuted=false;tracker.reset();status('Micrófono activo','active');message('Entrada recuperada. Calculando nuevamente el tempo.');};
    context.onstatechange=()=>{if(running&&context.state!=='running'){stop();status('Análisis interrumpido');message('El navegador pausó el audio. Pulsa Iniciar micrófono para continuar.');}};
    draw();await devices();
  }catch(error){await stop();const errors={NotAllowedError:'Permiso denegado. Habilita el micrófono para esta página en los ajustes del navegador y vuelve a iniciar.',NotFoundError:'No se encontró un micrófono. Conecta un dispositivo de entrada y vuelve a iniciar.',NotReadableError:'No se pudo abrir el micrófono. Comprueba la conexión o cierra otras apps que lo estén usando.',OverconstrainedError:'El dispositivo seleccionado ya no está disponible. Elige otra entrada.',SecurityError:'El navegador bloqueó el micrófono. Revisa los permisos de esta página.'};status('No se pudo iniciar','error');message(errors[error.name]||(error.message==='WORKLET'?'Este navegador no admite el procesamiento de audio necesario. Actualízalo y abre la app en localhost o HTTPS.':'No se pudo iniciar el audio. Abre la app desde localhost o HTTPS y vuelve a intentarlo.'),true);
  }finally{busy=false;controls();}
}
async function stop(){
  running=false;cancelAnimationFrame(frame);const old=context;context=null;
  if(stream){stream.getTracks().forEach(t=>{t.onended=t.onmute=t.onunmute=null;t.stop();});stream=null;}
  if(processor){processor.port.onmessage=null;processor.disconnect();processor=null;}source?.disconnect();source=null;analyser=null;
  if(old){old.onstatechange=null;if(old.state!=='closed')await old.close().catch(()=>{});}
  $('liveLabel').textContent='DETENIDO';$('scopeEmpty').hidden=false;$('scopeEmpty').querySelector('p').textContent='Micrófono apagado';status('Micrófono apagado');document.querySelectorAll('.beat-row span').forEach(x=>x.classList.remove('on'));controls();draw();
}
function draw(){
  const canvas=$('scope'),rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.strokeStyle='#263b55';c.lineWidth=1;c.beginPath();for(let i=1;i<5;i++){c.moveTo(0,h*i/5);c.lineTo(w,h*i/5);}for(let i=0;i<9;i++){c.moveTo(w*i/8,0);c.lineTo(w*i/8,h);}c.stroke();
  if(running&&analyser&&!trackMuted){analyser.getFloatFrequencyData(spectrum);analyser.getFloatTimeDomainData(wave);
    const bin=context.sampleRate/analyser.fftSize;let best=Math.ceil(20/bin);for(let i=best;i<spectrum.length;i++)if(spectrum[i]>spectrum[best])best=i;
    if(lastRms>.0005&&spectrum[best]>-85){let offset=0;if(best>0&&best<spectrum.length-1){const a=spectrum[best-1],b=spectrum[best],d=spectrum[best+1];if(Number.isFinite(a+d))offset=Math.max(-.5,Math.min(.5,.5*(a-d)/(a-2*b+d)||0));}$('frequency').textContent=Math.round((best+offset)*bin).toLocaleString('es-MX');}else $('frequency').textContent='—';
    if(view==='spectrum'){const count=72,maxHz=Math.min(20000,context.sampleRate/2);for(let i=0;i<count;i++){const lo=Math.max(1,Math.floor(20*(maxHz/20)**(i/count)/bin)),hi=Math.max(lo+1,Math.ceil(20*(maxHz/20)**((i+1)/count)/bin));let max=-100;for(let k=lo;k<Math.min(hi,spectrum.length);k++)max=Math.max(max,spectrum[k]);const height=Math.max(1,Math.min(h,(max+100)/90*h));c.fillStyle=`hsl(${205+i*.25} 95% ${68-i*.18}%)`;c.fillRect(i*w/count,h-height,Math.max(1,w/count-2),height);}}
    else{c.strokeStyle='#65b6ff';c.lineWidth=1.5;c.beginPath();const samples=Math.min(wave.length,Math.round(context.sampleRate*.04));for(let i=0;i<samples;i++){const x=i/(samples-1)*w,y=h/2-wave[i]*h*.47;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
  }
  if(running)frame=requestAnimationFrame(draw);
}
$('toggle').addEventListener('click',()=>running?stop().then(()=>message('Análisis detenido. Las últimas lecturas se conservan; Reiniciar las borra.')):start());
$('reset').addEventListener('click',()=>{processor?.port.postMessage('reset');clearReadings();if(!running)draw();message(running?'Mediciones reiniciadas. Escuchando un nuevo intervalo…':'Mediciones borradas. Pulsa Iniciar micrófono para comenzar.');});
$('sensitivity').addEventListener('input',()=>{$('sensitivityValue').textContent=`${$('sensitivity').value}%`;tracker.reset();if(running)showTempo(null);});
for(const [id,mode]of[['spectrumBtn','spectrum'],['waveBtn','wave']])$(id).addEventListener('click',()=>{view=mode;$('spectrumBtn').classList.toggle('selected',mode==='spectrum');$('waveBtn').classList.toggle('selected',mode==='wave');$('spectrumBtn').setAttribute('aria-pressed',mode==='spectrum');$('waveBtn').setAttribute('aria-pressed',mode==='wave');$('axis').innerHTML=mode==='spectrum'?'<span>20 Hz</span><span>100 Hz</span><span>1 kHz</span><span>10 kHz</span><span>20 kHz</span>':'<span>0 ms</span><span>10 ms</span><span>20 ms</span><span>30 ms</span><span>40 ms</span>';if(!running)draw();});
navigator.mediaDevices?.addEventListener('devicechange',devices);
window.addEventListener('pagehide',()=>{generation++;stop();});
window.addEventListener('resize',()=>{if(!running)draw();});
draw();devices();
// Switching tools releases the microphone before any file conversion.
window.addEventListener('studio:converter',()=>{if(running||busy){generation++;stop();}});
