// Fixed 100 Hz energy envelope: independent of display refresh rate.
export class TempoTracker {
  constructor(){ this.reset(); }
  reset(){ this.envelope=[];this.previous=0;this.history=[];this.sinceEstimate=0;this.elapsed=0;this.lastSignal=0;this.result=null; }
  push(rms, sensitivity=50){
    this.elapsed+=.01;
    const gate=10**((-45-sensitivity*.3)/20);
    const energy=rms>gate?Math.log1p(rms*100):0;
    const flux=Math.max(0,energy-this.previous);
    this.previous=energy;
    this.envelope.push(flux);if(this.envelope.length>1600)this.envelope.shift();
    if(rms>gate)this.lastSignal=this.elapsed;
    if(++this.sinceEstimate<100)return undefined;
    this.sinceEstimate=0;
    if(this.elapsed-this.lastSignal>2){this.history=[];this.result=null;return null;}
    if(this.envelope.length<600)return null;
    const x=this.envelope.map((_,i,a)=>((a[i-2]||0)+2*(a[i-1]||0)+3*a[i]+2*(a[i+1]||0)+(a[i+2]||0))/9);let total=0;
    for(const v of x)total+=v*v;
    if(total<.01){this.history=[];this.result=null;return null;}
    const corr=[];
    for(let lag=29;lag<=101;lag++){
      let dot=0,a=0,b=0;
      for(let i=lag;i<x.length;i++){dot+=x[i]*x[i-lag];a+=x[i]**2;b+=x[i-lag]**2;}
      corr[lag]=dot/Math.sqrt(a*b||1);
    }
    const candidates=[];
    for(let lag=30;lag<=100;lag++)if(corr[lag]>=corr[lag-1]&&corr[lag]>=corr[lag+1]){
      const periodicity=corr[lag];
      const prior=.94+.06*Math.exp(-(((6000/lag-120)/55)**2));
      candidates.push({lag,periodicity,score:periodicity*prior});
    }
    candidates.sort((a,b)=>b.score-a.score);
    let best=candidates[0];
    // Resolve near-equal octave aliases toward the shorter supported period.
    if(best){const faster=candidates.filter(c=>c.lag<best.lag*.7&&c.periodicity>best.periodicity*.9&&Math.abs(best.lag/c.lag-Math.round(best.lag/c.lag))<.08).sort((a,b)=>a.lag-b.lag);if(faster.length)best=faster[0];}
    if(!best||best.periodicity<.22){this.history=[];this.result=null;return null;}
    const l=best.lag,denom=corr[l-1]-2*corr[l]+corr[l+1];
    const offset=denom?Math.max(-.5,Math.min(.5,.5*(corr[l-1]-corr[l+1])/denom)):0;
    const raw=6000/(l+offset);
    if(this.history.length&&Math.abs(raw-this.history.at(-1))>8)this.history=[];
    this.history.push(raw);if(this.history.length>5)this.history.shift();
    const sorted=[...this.history].sort((a,b)=>a-b),bpm=sorted[Math.floor(sorted.length/2)];
    const spread=Math.max(...sorted)-Math.min(...sorted);
    const consistency=Math.max(0,1-spread/8)*Math.min(1,this.history.length/4);
    const confidence=Math.round(Math.min(.98,best.periodicity)*100*(.65+.35*consistency));
    this.result={bpm:Math.max(60,Math.min(200,bpm)),confidence,stable:confidence>=70&&this.history.length>=3&&spread<2};
    return this.result;
  }
}
