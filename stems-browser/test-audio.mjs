import assert from 'node:assert/strict';
import {encodeWav,wavHeader} from './audio.mjs';
const left=Float32Array.of(.25,-.5,1.2),right=Float32Array.of(-.25,.5,-1.2);
const bytes=encodeWav([left,right]),view=new DataView(bytes);
assert.equal(bytes.byteLength,44+3*8);
assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');
assert.equal(view.getUint16(20,true),3); // IEEE float, preserving peaks above 1.
assert.equal(view.getUint32(24,true),44100);
assert.equal(view.getUint32(40,true),3*8);
assert.deepEqual(new Uint8Array(wavHeader(3)),new Uint8Array(bytes.slice(0,44)));
for(let i=0;i<3;i++){
  assert.equal(view.getFloat32(44+i*8,true),left[i]);
  assert.equal(view.getFloat32(48+i*8,true),right[i]);
}
console.log('PASS: WAV preserves duration, stereo float samples, and peaks without clipping.');
