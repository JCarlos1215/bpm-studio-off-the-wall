import { estimateBeat } from './beat-analysis.js?v=tempo-20261007-3';
// Fixed 100 Hz energy envelope: independent of display refresh rate.
export class TempoTracker {
  constructor(){ this.reset(); }
  reset(){ this.envelope=[];this.spectralEnvelope=[];this.reference=null;this.previous=0;this.history=[];this.sinceEstimate=0;this.elapsed=0;this.lastSignal=0;this.result=null;this.pending=[]; }
  push(rms, sensitivity=50, spectralFlux=null){
    this.elapsed+=.01;
    const gate=10**((-45-sensitivity*.3)/20);
    const energy=rms>gate?Math.log1p(rms*100):0;
    const flux=Math.max(0,energy-this.previous);
    this.previous=energy;
    this.envelope.push(flux);if(this.envelope.length>1600)this.envelope.shift();
    if(spectralFlux!==null){this.spectralEnvelope.push(spectralFlux);if(this.spectralEnvelope.length>1600)this.spectralEnvelope.shift();}
    if(rms>gate)this.lastSignal=this.elapsed;
    if(++this.sinceEstimate<100)return undefined;
    this.sinceEstimate=0;
    if(this.elapsed-this.lastSignal>2){this.history=[];this.result=null;this.reference=null;return null;}
    if(this.envelope.length<600)return null;
    const bass=estimateBeat(this.envelope,100,this.reference);
    const spectral=estimateBeat(this.spectralEnvelope,100,this.reference);
    let estimate=bass;
    if(spectral){
      if(bass && Math.abs(bass.bpm-spectral.bpm)<3){
        estimate={...spectral,confidence:Math.min(95,Math.max(bass.confidence,spectral.confidence)+10)};
      }else if(this.reference){
        estimate=[bass,spectral].filter(Boolean).find(e=>Math.abs(e.bpm-this.reference)<3) ?? spectral;
      }else if(!bass || spectral.confidence>=65)estimate=spectral;
      else if(Math.abs(bass.bpm-spectral.bpm)>3)return null;
    }
    if(this.reference && estimate && Math.abs(estimate.bpm-this.reference)>5 && (!bass || !spectral || Math.abs(bass.bpm-spectral.bpm)>3))return null;
    if(!estimate){this.history=[];this.result=null;return null;}
    const raw=estimate.bpm;
    if(this.reference && Math.abs(raw-this.reference)>5){
      if(this.pending.length && Math.abs(raw-this.pending.at(-1))>3)this.pending=[];
      this.pending.push(raw);
      if(this.pending.length<5 || estimate.confidence<50){
        // Hide an unsupported change instead of presenting a rhythmic subdivision as tempo.
        if(this.pending.length>=5){this.history=[];this.result=null;this.pending=[];}
        return null;
      }
      this.history=[];
    }else this.pending=[];
    if(this.history.length&&Math.abs(raw-this.history.at(-1))>8)this.history=[];
    this.history.push(raw);if(this.history.length>5)this.history.shift();
    const sorted=[...this.history].sort((a,b)=>a-b),bpm=sorted[Math.floor(sorted.length/2)];
    const spread=Math.max(...sorted)-Math.min(...sorted);
    const consistency=Math.max(0,1-spread/8)*Math.min(1,this.history.length/4);
    const confidence=Math.round(estimate.confidence*(.65+.35*consistency));
    this.reference=bpm;
    this.result={bpm:Math.max(60,Math.min(200,bpm)),confidence,stable:confidence>=70&&this.history.length>=3&&spread<2};
    return this.result;
  }
}
