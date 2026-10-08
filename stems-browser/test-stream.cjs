const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const events=[],context=vm.createContext({self:{postMessage:m=>events.push(m)},Float32Array,ArrayBuffer,DataView,Math,Error});
vm.runInContext(fs.readFileSync(__dirname+'/worker.js','utf8').replaceAll('import.meta.url',JSON.stringify('http://localhost/worker.js')),context);
vm.runInContext(`processor={separate:async(l,r)=>Object.fromEntries(['drums','bass','other','vocals'].map(name=>[name,{left:l.slice(),right:r.slice()}]))};`,context);
(async()=>{
 for(const length of [1,343980,343981,999999]){
  events.length=0;
  const left=Float32Array.from({length},(_,i)=>Math.sin(i/67)),right=Float32Array.from({length},(_,i)=>Math.cos(i/83));
  await context.self.onmessage({data:{left,right}});
  const blocks=events.filter(e=>e.type==='block'),done=events.find(e=>e.type==='done');assert.ok(done,JSON.stringify(events));
  assert.equal(blocks.reduce((n,b)=>n+b.frames,0),length);assert.equal(done.frames,length);
  for(let stem=0;stem<4;stem++){
   let offset=0;
   for(const block of blocks){assert.ok(block.frames<=343980);const view=new DataView(block.blocks[stem]);
    for(let i=0;i<block.frames;i++){assert.ok(Math.abs(view.getFloat32(i*8,true)-left[offset+i])<2e-7);assert.ok(Math.abs(view.getFloat32(i*8+4,true)-right[offset+i])<2e-7);}offset+=block.frames;
   }
  }
 }
 console.log('PASS: bounded blocks preserve stereo, duration and overlap without missing or repeated samples.');
})();
