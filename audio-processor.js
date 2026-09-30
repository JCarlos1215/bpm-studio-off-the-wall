class SignalProcessor extends AudioWorkletProcessor {
  constructor(){super();this.reset();this.port.onmessage=()=>this.reset();}
  reset(){this.sum=0;this.peak=0;this.n=0;this.frames=0;this.batch=[];this.period=Math.round(sampleRate/100);}
  process(inputs){
    const channels=inputs[0];if(!channels?.length)return true;
    for(let i=0;i<channels[0].length;i++){
      // The input is configured as mono by the host AudioWorkletNode.
      const v=channels[0][i];this.sum+=v*v;this.peak=Math.max(this.peak,Math.abs(v));this.n++;
      if(this.n===this.period){this.batch.push({rms:Math.sqrt(this.sum/this.n),peak:this.peak});this.sum=0;this.peak=0;this.n=0;
        if(this.batch.length===5){this.port.postMessage(this.batch);this.batch=[];}
      }
    }
    // Output remains silent: no microphone feedback.
    return true;
  }
}
registerProcessor('signal-processor',SignalProcessor);
