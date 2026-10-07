// Use a local mono 44.1 kHz float32 PCM file; no music is stored in this repository.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SpectralOnset} from '../spectral-onset.js';
import {TempoTracker} from '../tempo.js';
import {analyzeAudioBuffer} from '../key-bpm-analyzer/analysis.js';
const [path, expectedText] = process.argv.slice(2);
if (!path || !expectedText) throw new Error('Usage: node tests/song-regression.mjs mono-44100.f32 expected-bpm');
const expected = Number(expectedText);
const bytes = readFileSync(path);
const data = new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
const result = analyzeAudioBuffer({sampleRate:44100,length:data.length,duration:data.length/44100,numberOfChannels:1,getChannelData:()=>data});
assert.ok(Math.abs(result.bpm-expected)<1,`File: ${result.bpm}`);
let Processor;
vm.runInNewContext(readFileSync(new URL('../audio-processor.js',import.meta.url),'utf8').replace(/^import .*;\n/,''),{
 SpectralOnset,sampleRate:44100,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(_,cls)=>{Processor=cls;},
});
const processor=new Processor(),tracker=new TempoTracker(),estimates=[];
processor.port.postMessage=batch=>{for(const sample of batch){const estimate=tracker.push(sample.beatRms,50,sample.spectralFlux);if(estimate!==undefined)estimates.push(estimate);}};
for(let i=0;i<data.length;i+=128)processor.process([[data.subarray(i,i+128)]]);
const visible=estimates.filter(Boolean);
assert.ok(visible.length/estimates.length>.6,'Tempo should be available for most of the song');
assert.ok(visible.every(e=>Math.abs(e.bpm-expected)<3),'No jumps to subdivisions');
console.log(`File: ${result.bpm} BPM. Live: ${visible.length}/${estimates.length} readings; no jumps >3 BPM.`);
