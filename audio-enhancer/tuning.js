import {fft} from '../fft.js';
export const TUNING_RATE=11025;
const SIZE=32768;
const wrap=x=>((x+50)%100+100)%100-50;
const distance=(a,b)=>Math.abs(wrap(a-b));

// Estimate the common offset of spectral peaks from equal temperament (A=440).
// This is global tuning, not a key detector or a note-by-note vocal correction.
export async function estimateTuning(samples,{current=()=>true}={}) {
  if(samples.length<SIZE)return {reliable:false,reason:'Audio demasiado corto para estimar la afinación.'};
  const histogram=new Float64Array(100),observations=[],frameOffsets=[];
  const real=new Float64Array(SIZE),imag=new Float64Array(SIZE),power=new Float64Array(SIZE/2);
  const window=Float64Array.from({length:SIZE},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(SIZE-1)));
  const count=Math.min(32,Math.floor(samples.length/(SIZE/2)));
  let usedFrames=0;
  for(let f=0;f<count;f++){
    if(!current())throw new Error('Procesamiento cancelado.');
    const start=Math.round(f*(samples.length-SIZE)/Math.max(1,count-1));
    let rms=0;
    for(let i=0;i<SIZE;i++){const x=samples[start+i];rms+=x*x;real[i]=x*window[i];imag[i]=0;}
    if(rms/SIZE<1e-8)continue;
    fft(real,imag);
    for(let k=0;k<power.length;k++)power[k]=real[k]*real[k]+imag[k]*imag[k];
    const peaks=[];let max=0;
    const first=Math.ceil(110*SIZE/TUNING_RATE),last=Math.floor(2000*SIZE/TUNING_RATE);
    for(let k=first;k<=last;k++)max=Math.max(max,power[k]);
    for(let k=first;k<=last;k++){
      if(power[k]<max*.01||power[k]<=power[k-1]||power[k]<power[k+1])continue;
      let floor=0;
      for(const d of [-5,-4,-3,3,4,5])floor+=power[k+d];
      if(power[k]<8*floor/6)continue; // Reject broad percussion/noise peaks.
      const l=Math.log(Math.max(1e-30,power[k-1])),c=Math.log(Math.max(1e-30,power[k])),r=Math.log(Math.max(1e-30,power[k+1]));
      const delta=Math.max(-.5,Math.min(.5,.5*(l-r)/(l-2*c+r)));
      const hz=(k+delta)*TUNING_RATE/SIZE;
      const cents=wrap(1200*Math.log2(hz/440));
      peaks.push({cents,weight:power[k]});
    }
    peaks.sort((a,b)=>b.weight-a.weight);
    const selected=peaks.slice(0,12),total=selected.reduce((sum,p)=>sum+p.weight,0);
    if(!total)continue;
    usedFrames++;
    frameOffsets.push(selected[0].cents);
    for(const peak of selected){
      const weight=peak.weight/total; // A loud passage cannot dominate the whole file.
      observations.push({cents:peak.cents,weight});
      for(let i=0;i<100;i++)histogram[i]+=weight*Math.exp(-.5*(distance(i-50,peak.cents)/3)**2);
    }
    // Keep Cancel responsive while analysing the sampled windows.
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(usedFrames<4)return {reliable:false,reason:'No hay suficientes segmentos con notas estables.'};
  let best=0;for(let i=1;i<100;i++)if(histogram[i]>histogram[best])best=i;
  const center=best-50;
  const supporting=observations.filter(p=>distance(p.cents,center)<=6);
  const support=supporting.reduce((s,p)=>s+p.weight,0);
  const confidence=support/usedFrames;
  const cents=wrap(center+supporting.reduce((s,p)=>s+wrap(p.cents-center)*p.weight,0)/support);
  const consistent=frameOffsets.filter(x=>distance(x,cents)<=8).length/usedFrames;
  if(!Number.isFinite(cents)||confidence<.65||consistent<.7)return {reliable:false,confidence,reason:'Afinación ambigua o variable entre segmentos.'};
  if(Math.abs(cents)>45)return {reliable:false,confidence,reason:'Desviación cercana a medio semitono: usa una referencia y el ajuste manual.'};
  return {reliable:true,cents:Math.round(cents*10)/10,confidence,frames:usedFrames};
}

export async function measureTuning(ffmpeg,path,current=()=>true){
  const temp='tuning.f32';
  try{
    const code=await ffmpeg.exec(['-hide_banner','-nostdin','-y','-i',path,'-map','0:a:0','-vn','-ac','1','-ar',String(TUNING_RATE),'-c:a','pcm_f32le','-f','f32le',temp],240000);
    if(code!==0)throw new Error('No se pudo analizar la afinación.');
    if(!current())throw new Error('Procesamiento cancelado.');
    const bytes=await ffmpeg.readFile(temp);
    const aligned=bytes.byteOffset%4===0?bytes:bytes.slice();
    return await estimateTuning(new Float32Array(aligned.buffer,aligned.byteOffset,aligned.byteLength/4),{current});
  }finally{if(current())await ffmpeg.deleteFile(temp).catch(()=>{});}
}

export function pitchFilters(cents,behavior='preserve'){
  if(!Number.isFinite(cents)||Math.abs(cents)>100||!['preserve','speed'].includes(behavior))throw new Error('Corrección de tono no válida. Usa entre −100 y +100 cents.');
  if(Math.abs(cents)<.05)return [];
  const shifted=Math.round(48000*2**(cents/1200)),ratio=shifted/48000;
  return ['aresample=48000',`asetrate=${shifted}`,'aresample=48000',...(behavior==='preserve'?[`atempo=${1/ratio}`]:[])];
}
