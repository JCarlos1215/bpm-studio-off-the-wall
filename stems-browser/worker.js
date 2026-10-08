// demucs-web (MIT) performs FFT, model inference and overlap-add locally.
let processor;
self.onmessage=async event=>{
  try{
    if(!processor){
      self.postMessage({type:'status',text:'Preparando Demucs para este dispositivo…'});
      const ort=await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/ort.webgpu.min.mjs');
      const {DemucsProcessor,CONSTANTS}=await import('https://cdn.jsdelivr.net/npm/demucs-web@1.0.2/src/index.js');
      ort.env.wasm.numThreads=1;
      ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
      const gpu=!!navigator.gpu && !!(await navigator.gpu.requestAdapter());
      processor=new DemucsProcessor({ort,sessionOptions:{executionProviders:gpu?['webgpu','wasm']:['wasm'],graphOptimizationLevel:'basic',enableCpuMemArena:false,enableMemPattern:false},
        onProgress:info=>self.postMessage({type:'progress',value:info.progress,text:`Separando segmento ${info.currentSegment} de ${info.totalSegments}…`}),
        onDownloadProgress:(loaded,total)=>self.postMessage({type:'status',text:`Descargando modelo: ${(loaded/1048576).toFixed(0)} MB${total?' de '+(total/1048576).toFixed(0)+' MB':''}…`}),
        onLog:()=>self.postMessage({type:'status',text:'Preparando el modelo de separación…'})});
      await processor.loadModel(CONSTANTS.DEFAULT_MODEL_URL);
    }
    const result=await processor.separate(event.data.left,event.data.right);
    const stems=['drums','bass','other','vocals'].map(name=>[result[name].left,result[name].right]);
    self.postMessage({type:'done',stems,rate:44100},stems.flat().map(channel=>channel.buffer));
  }catch(error){processor=null;self.postMessage({type:'error',text:error.message || String(error)});}
};
