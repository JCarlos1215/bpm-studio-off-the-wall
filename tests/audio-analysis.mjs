import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {analyzeAudioBuffer} from '../key-bpm-analyzer/analysis.js';
import {TempoTracker} from '../tempo.js';
let Processor;
const sr = 44100;
vm.runInNewContext(readFileSync(new URL('../audio-processor.js', import.meta.url), 'utf8'), {
 sampleRate: sr, AudioWorkletProcessor: class {constructor(){this.port={postMessage(){}};}},
 registerProcessor: (_, cls) => {Processor=cls;},
});
function buffer(data, channels=[data]) {
 return {sampleRate:sr,length:data.length,duration:data.length/sr,numberOfChannels:channels.length,getChannelData:i=>channels[i]};
}
function live(data) {
 const processor=new Processor(), tracker=new TempoTracker(); let result=null;
 processor.port.postMessage=batch=>{for(const s of batch){const r=tracker.push(s.beatRms);if(r!==undefined)result=r;}};
 for(let i=0;i<data.length;i+=128)processor.process([[data.subarray(i,i+128)]]);
 return result;
}
for(const bpm of [70,90,120,128,150,174,190]) {
 const data=Float32Array.from({length:sr*18},(_,i)=>{
  const t=i/sr, phase=t%(60/bpm), hat=t%(30/bpm);
  return .6*Math.exp(-phase*45)*Math.sin(2*Math.PI*80*t)+.12*Math.exp(-hat*100)*Math.sin(2*Math.PI*6000*t);
 });
 const result=analyzeAudioBuffer(buffer(data));
 assert.ok(Math.abs(result.bpm-bpm)<1,`file ${bpm}: ${result.bpm}`);
 const tracked=live(data);
 assert.ok(tracked && Math.abs(tracked.bpm-bpm)<1,`live ${bpm}: ${tracked?.bpm}`);
 console.log(`${bpm} BPM: file ${result.bpm}, microphone ${tracked.bpm.toFixed(1)}`);
}
const silence=new Float32Array(sr*12);
const silent=analyzeAudioBuffer(buffer(silence));
assert.equal(silent.bpm,null);assert.equal(silent.key,null);assert.equal(silent.energy,0);assert.deepEqual(silent.cues,[]);assert.equal(live(silence),null);
const tone=Float32Array.from({length:sr*12},(_,i)=>.2*Math.sin(2*Math.PI*440*i/sr));
const quiet=analyzeAudioBuffer(buffer(tone));
assert.equal(quiet.bpm,null,'steady tone is not a beat');
assert.equal(live(tone),null);
const loud=Float32Array.from(tone,x=>x*2);
const louder=analyzeAudioBuffer(buffer(loud));
assert.ok(Math.abs(louder.energy-quiet.energy-10)<=1,'6 dB gain changes level by 10 points');
const inverted=Float32Array.from(tone,x=>-x);
assert.equal(analyzeAudioBuffer(buffer(tone,[tone,inverted])).energy,quiet.energy,'stereo phase must not cancel energy');
console.log('Silence, steady tone, level scaling and opposite-phase stereo: OK');
