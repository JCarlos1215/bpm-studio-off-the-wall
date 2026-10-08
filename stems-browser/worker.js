// CPU inference and bounded output blocks bound inference output memory; input and stored WAVs still scale with duration.
let processor;
const N=343980,OVERLAP=44100,STEP=N-OVERLAP;
const names=['drums','bass','other','vocals'];
self.onmessage=async event=>{
 try{
  if(event.data.type==='init'){
   self.postMessage({type:'status',text:'Iniciando el motor integrado…'});
   const ort=await import('./vendor/ort/ort.wasm.bundle.min.mjs');
   const {DemucsProcessor}=await import('./vendor/demucs/index.js');
   ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=new URL('./vendor/ort/',import.meta.url).href;
   processor=new DemucsProcessor({ort,sessionOptions:{executionProviders:['wasm'],graphOptimizationLevel:'basic',enableCpuMemArena:false,enableMemPattern:false}});
   const {loadModelBytes}=await import('./model.mjs?v=bundled-1');
   await processor.loadModel(await loadModelBytes());
   self.postMessage({type:'ready'});return;
  }
  if(!processor)throw new Error('El motor no está preparado.');
  const {left,right}=event.data,length=left.length;
  const peaks=names.map(()=>new Float32Array(700));let tails=null;
  for(let start=0;start<length;start+=STEP){
   const end=Math.min(length,start+N),final=end===length;
   self.postMessage({type:'progress',value:start/length,text:`Separando audio: ${Math.round(start/length*100)}%…`});
   const result=await processor.separate(left.subarray(start,end),right.subarray(start,end));
   const stereo=names.map(name=>[result[name].left,result[name].right]);
   const frames=final?end-start:STEP;
   if(tails)for(let stem=0;stem<4;stem++)for(let channel=0;channel<2;channel++)for(let i=0;i<Math.min(OVERLAP,frames);i++){
    const fade=i/(OVERLAP-1);stereo[stem][channel][i]=tails[stem][channel][i]*(1-fade)+stereo[stem][channel][i]*fade;
   }
   tails=final?null:stereo.map(channels=>channels.map(samples=>samples.slice(STEP)));
   const blocks=stereo.map((channels,stem)=>{
    const bytes=new ArrayBuffer(frames*8),view=new DataView(bytes);
    for(let i=0;i<frames;i++){
     const l=channels[0][i],r=channels[1][i];view.setFloat32(i*8,l,true);view.setFloat32(i*8+4,r,true);
     const bin=Math.min(699,Math.floor((start+i)*700/length));peaks[stem][bin]=Math.max(peaks[stem][bin],Math.abs(l),Math.abs(r));
    }return bytes;
   });
   self.postMessage({type:'block',blocks,frames},blocks);
   if(final)break;
  }
  self.postMessage({type:'done',frames:length,peaks},peaks.map(p=>p.buffer));
 }catch(error){processor=null;self.postMessage({type:'error',text:error.message || String(error)});}
};
