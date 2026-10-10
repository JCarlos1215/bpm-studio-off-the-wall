// Compact stereo peak envelopes; retain only the drawing data after decoding.
export async function measureWaveform(ffmpeg,path,current=()=>true){
  const temporary='waveform.f32',rate=8000;
  try{
    const code=await ffmpeg.exec(['-hide_banner','-nostdin','-y','-i',path,'-map','0:a:0','-vn','-ac','2','-ar',String(rate),'-c:a','pcm_f32le','-f','f32le',temporary],240000);
    if(code!==0)throw new Error('No se pudo generar la forma de onda.');
    if(!current())throw new Error('Cancelado');
    const bytes=await ffmpeg.readFile(temporary);
    const aligned=bytes.byteOffset%4===0?bytes:bytes.slice();
    const samples=new Float32Array(aligned.buffer,aligned.byteOffset,aligned.byteLength/4);
    const frames=Math.floor(samples.length/2),bins=Math.min(2048,frames);
    if(!frames)throw new Error('Audio vacío');
    const peaks=[new Float32Array(bins*2),new Float32Array(bins*2)];
    for(let i=0;i<frames;i++){
      if((i&131071)===0){await new Promise(resolve=>setTimeout(resolve,0));if(!current())throw new Error('Cancelado');}
      const bin=Math.min(bins-1,Math.floor(i*bins/frames))*2;
      for(let channel=0;channel<2;channel++){
        const value=samples[i*2+channel];
        peaks[channel][bin]=Math.min(peaks[channel][bin],value);
        peaks[channel][bin+1]=Math.max(peaks[channel][bin+1],value);
      }
    }
    return {peaks,duration:frames/rate};
  }finally{if(current())await ffmpeg.deleteFile(temporary).catch(()=>{});}
}
const clock=seconds=>{const s=Math.max(0,Math.floor(seconds||0));return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;};
export class Waveform{
  constructor(root,audio,color){
    this.root=root;this.audio=audio;this.color=color;this.data=null;this.animation=0;
    this.canvas=root.querySelector('canvas');this.time=root.querySelector('.wave-time');this.seek=root.querySelector('.wave-seek');this.progress=root.querySelector('.wave-progress');
    this.seek.addEventListener('pointerdown',event=>{
      if(event.button!==0||!this.data)return;
      const rect=this.seek.getBoundingClientRect();this.jump((event.clientX-rect.left)/rect.width*this.duration);
    });
    this.seek.addEventListener('keydown',event=>{
      const actions={ArrowRight:()=>this.audio.currentTime+5,ArrowLeft:()=>this.audio.currentTime-5,Home:()=>0,End:()=>this.duration};
      if(!actions[event.key]||!this.data)return;event.preventDefault();this.jump(actions[event.key]());
    });
    for(const event of ['timeupdate','seeked','loadedmetadata','durationchange','pause','ended'])audio.addEventListener(event,()=>this.update());
    audio.addEventListener('play',()=>{cancelAnimationFrame(this.animation);this.tick();});
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(this.seek);
  }
  get duration(){return Number.isFinite(this.audio.duration)&&this.audio.duration>0?this.audio.duration:this.data?.duration??0;}
  set(data){this.data=data;this.root.hidden=false;this.draw();this.update();}
  clear(){cancelAnimationFrame(this.animation);this.data=null;this.root.hidden=true;this.seek.setAttribute('aria-valuenow','0');this.progress.style.width='0%';}
  jump(seconds){if(!this.data||this.audio.readyState<1)return;this.audio.currentTime=Math.max(0,Math.min(this.duration-.001,seconds));this.update();}
  update(){
    const duration=this.duration,position=Math.max(0,Math.min(duration,this.audio.currentTime||0));
    this.time.textContent=`${clock(position)} / ${clock(duration)}`;
    this.progress.style.width=`${duration?position/duration*100:0}%`;
    this.seek.setAttribute('aria-valuemax',String(duration));this.seek.setAttribute('aria-valuenow',position.toFixed(2));this.seek.setAttribute('aria-valuetext',this.time.textContent);
    if(this.audio.paused)cancelAnimationFrame(this.animation);
  }
  tick(){this.update();if(!this.audio.paused&&this.data)this.animation=requestAnimationFrame(()=>this.tick());}
  draw(){
    if(!this.data)return;
    const width=this.seek.clientWidth;if(!width)return;
    const height=112,ratio=Math.min(devicePixelRatio||1,2),ctx=this.canvas.getContext('2d');
    this.canvas.width=Math.round(width*ratio);this.canvas.height=Math.round(height*ratio);ctx.scale(ratio,ratio);ctx.clearRect(0,0,width,height);
    for(let channel=0;channel<2;channel++){
      const center=height*(channel+.5)/2,scale=height/4-6;
      ctx.strokeStyle='#293c55';ctx.beginPath();ctx.moveTo(0,center);ctx.lineTo(width,center);ctx.stroke();
      const peaks=this.data.peaks[channel],bins=peaks.length/2;
      ctx.fillStyle=this.color;
      for(let x=0;x<Math.ceil(width);x++){
        const start=Math.floor(x*bins/width),end=Math.min(bins,Math.max(start+1,Math.ceil((x+1)*bins/width)));
        let low=0,high=0;for(let i=start;i<end;i++){low=Math.min(low,peaks[i*2]);high=Math.max(high,peaks[i*2+1]);}
        const top=center-Math.min(1,high)*scale,bottom=center-Math.max(-1,low)*scale;
        ctx.fillRect(x,top,1,Math.max(1,bottom-top));
      }
    }
  }
}
