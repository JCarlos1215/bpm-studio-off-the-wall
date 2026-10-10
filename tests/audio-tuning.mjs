import assert from 'node:assert/strict';
import {estimateTuning,TUNING_RATE as sr} from '../audio-enhancer/tuning.js';
import {validateOptions} from '../audio-enhancer/engine.js';
function chord(cents,length=12){return Float32Array.from({length:sr*length},(_,i)=>{
 const t=i/sr,ratio=2**(cents/1200);return .35*Math.sin(2*Math.PI*440*ratio*t)+.2*Math.sin(2*Math.PI*329.6275569*ratio*t)+.1*Math.sin(2*Math.PI*659.2551138*ratio*t);
});}
for(const cents of [-35,-12,0,24,40]){
 const result=await estimateTuning(chord(cents));
 assert.equal(result.reliable,true);assert.ok(Math.abs(result.cents-cents)<.8,JSON.stringify(result));
 console.log(`${cents} cents → ${result.cents} cents`);
}
assert.equal((await estimateTuning(chord(49))).reliable,false);
assert.equal((await estimateTuning(new Float32Array(sr*12))).reliable,false);
assert.equal((await estimateTuning(chord(20,1))).reliable,false);
let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const noise=Float32Array.from({length:sr*12},()=>random()*.4-.2);
assert.equal((await estimateTuning(noise)).reliable,false);
const mixed=chord(25);mixed.set(chord(-25,6),sr*6);
assert.equal((await estimateTuning(mixed)).reliable,false);
await assert.rejects(estimateTuning(chord(20),{current:()=>false}),/cancelado/);
for(const invalid of [101,-101,NaN,Infinity])assert.throws(()=>validateOptions({pitchMode:'manual',manualCents:invalid}));
console.log('Silencio, ruido, afinación variable, límites y cancelación: OK');
