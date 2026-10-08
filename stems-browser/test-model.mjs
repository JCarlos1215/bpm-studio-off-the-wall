import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadModelBytes} from './model.mjs';
const manifest=JSON.parse(await readFile(new URL('./models/manifest.json',import.meta.url)));
globalThis.fetch=async url=>new Response(await readFile(new URL(url)));
const bytes=await loadModelBytes();
assert.equal(bytes.byteLength,manifest.bytes);
assert.equal(createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),manifest.sha256);
for(const part of manifest.parts){const content=await readFile(new URL('./models/'+part.file,import.meta.url));assert.equal(content.length,part.bytes);assert.equal(createHash('sha256').update(content).digest('hex'),part.sha256);}
console.log('PASS: bundled model parts reconstruct the exact upstream ONNX model.');
