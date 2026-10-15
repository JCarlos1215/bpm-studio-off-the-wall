import {parseMeasurement} from '../audio-enhancer/engine.js';
export const DEFAULTS={input:0,dc:true,hp:20,low:0,presence:0,air:0,eqOn:true,eq:[80,250,1000,4000,12000].map(freq=>({freq,gain:0,q:1})),bus:false,threshold:-18,ratio:2,attack:25,release:150,multiband:false,bands:[150,800,3000,10000,20000].map(edge=>({edge,threshold:-20,ratio:2,gain:0})),deharsh:false,hfFreq:5000,hfThreshold:-20,hfRatio:2,drive:0,character:'neutral',width:1,mid:0,side:0,output:0,limiter:true,ceiling:-1,limRelease:80,normalize:true,target:-14,depth:24,rate:44100,format:'wav'};
export const clone=value=>JSON.parse(JSON.stringify(value));
const db=x=>10**(x/20);
export function validate(p){
 const range=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
 for(const [k,a,b] of [['input',-12,12],['hp',10,120],['low',-6,6],['presence',-6,6],['air',-6,6],['threshold',-48,0],['ratio',1,12],['attack',1,100],['release',20,1000],['hfFreq',2000,12000],['hfThreshold',-48,0],['hfRatio',1,8],['drive',0,12],['width',0,2],['mid',-6,6],['side',-6,6],['output',-12,12],['ceiling',-3,-.3],['limRelease',20,500],['target',-20,-8]])if(!range(p[k],a,b))throw new Error('Ajuste fuera de rango: '+k);
 if(![16,24].includes(p.depth)||![44100,48000].includes(p.rate)||!['wav','flac'].includes(p.format)||!['neutral','warm','bright','tape'].includes(p.character))throw new Error('Formato o carácter no válido.');
 if(!Array.isArray(p.eq)||p.eq.length!==5||!Array.isArray(p.bands)||p.bands.length!==5)throw new Error('La sesión debe contener cinco bandas.');
 for(const b of p.eq)if(!range(b.freq,30,18000)||!range(b.gain,-12,12)||!range(b.q,.2,8))throw new Error('Banda EQ no válida.');
 for(const b of p.bands)if(!range(b.threshold,-48,0)||!range(b.ratio,1,12)||!range(b.gain,-6,6))throw new Error('Banda de compresión no válida.');
 return p;
}
const comp=(threshold,ratio,attack=15,release=120)=>`acompressor=threshold=${db(threshold)}:ratio=${ratio}:attack=${attack}:release=${release}:makeup=1`;
export function graph(p){
 validate(p);const chains=[];let node='0:a',counter=0;
 const serial=filters=>{if(!filters.length)return;const next='s'+counter++;chains.push(`[${node}]${filters.join(',')}[${next}]`);node=next;};
 serial([`volume=${p.input}dB`,...(p.dc?['highpass=f=10']:[]),`highpass=f=${p.hp}`,`bass=g=${p.low}:f=100`,`equalizer=f=3000:t=q:w=1:g=${p.presence}`,`treble=g=${p.air}:f=10000`]);
 if(p.character!=='neutral'){const [l,h]=({warm:[.8,-.5],bright:[-.4,.8],tape:[1,-1]})[p.character];serial([`bass=g=${l}:f=150`,`treble=g=${h}:f=8000`]);}
 if(p.eqOn)serial(p.eq.map(b=>`equalizer=f=${b.freq}:t=q:w=${b.q}:g=${b.gain}`));
 const split=(edges,processor)=>{const prefix='b'+counter++,outs=edges.map((_,i)=>prefix+'o'+i);chains.push(`[${node}]asplit=${edges.length}${edges.map((_,i)=>`[${prefix}i${i}]`).join('')}`);edges.forEach((edge,i)=>{const f=[];if(i>0)f.push(`highpass=f=${edges[i-1]}:p=2`,`highpass=f=${edges[i-1]}:p=2`);if(i<edges.length-1)f.push(`lowpass=f=${edge}:p=2`,`lowpass=f=${edge}:p=2`);f.push(...processor(i));chains.push(`[${prefix}i${i}]${f.join(',')}[${outs[i]}]`);});const next='s'+counter++;chains.push(outs.map(x=>`[${x}]`).join('')+`amix=inputs=${edges.length}:normalize=0[${next}]`);node=next;};
 if(p.multiband)split([150,800,3000,10000,20000],i=>[comp(p.bands[i].threshold,p.bands[i].ratio),`volume=${p.bands[i].gain}dB`]);
 if(p.bus)serial([comp(p.threshold,p.ratio,p.attack,p.release)]);
 if(p.deharsh)split([p.hfFreq,20000],i=>i?[comp(p.hfThreshold,p.hfRatio,5,100)]:['anull']);
 if(p.drive>0)serial([`volume=${p.drive}dB`,'asoftclip=type=tanh:threshold=0.9:oversample=2',`volume=${-p.drive/2}dB`]);
 serial([p.width===0?`pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,volume=${p.mid}dB`:`stereotools=mlev=${db(p.mid)}:slev=${Math.max(.015625,p.width*db(p.side))}`,`volume=${p.output}dB`]);
 if(p.limiter)serial([`alimiter=limit=${db(p.ceiling)}:attack=5:release=${p.limRelease}:level=0:latency=1`]);
 serial(['anull']);return {filter:chains.join(';'),output:node};
}
export async function measure(ffmpeg,path,p){const logs=[],onLog=({message})=>logs.push(message);ffmpeg.on('log',onLog);try{const code=await ffmpeg.exec(['-hide_banner','-nostdin','-i',path,'-vn','-af',`loudnorm=I=${p.target}:TP=${p.ceiling-.3}:LRA=11:print_format=json`,'-f','null','-'],240000);if(code!==0)throw new Error('No se pudo medir el audio.');return parseMeasurement(logs);}finally{ffmpeg.off('log',onLog);}}
export function outputArgs(p){return ['-ar',String(p.rate),'-c:a',p.format==='flac'?'flac':p.depth===24?'pcm_s24le':'pcm_s16le',...(p.format==='flac'?['-sample_fmt',p.depth===24?'s32':'s16']:[]),'-map_metadata','-1'];}
export async function process(ffmpeg,p,current,phase){
 validate(p);const g=graph(p);phase('Aplicando ecualización, dinámica e imagen estéreo…',20,45);
 let code=await ffmpeg.exec(['-hide_banner','-nostdin','-y','-i','source','-filter_complex',g.filter,'-map',`[${g.output}]`,'-ar',String(p.rate),'-c:a','pcm_f32le','chain.wav'],600000);if(code!==0)throw new Error('El motor no pudo procesar la cadena. Prueba desactivar módulos o usar una pista más corta.');if(!current())throw new Error('Cancelado');
 phase('Midiendo loudness y margen de picos…',45,55);const chain=await measure(ffmpeg,'chain.wav',p);if(!current())throw new Error('Cancelado');
 const filters=[];if(p.normalize)filters.push(`loudnorm=I=${p.target}:TP=${p.ceiling-.3}:LRA=11:measured_I=${chain.loudness}:measured_TP=${chain.peak}:measured_LRA=${chain.range}:measured_thresh=${chain.threshold}:offset=${chain.offset}:linear=true`);
 phase('Renderizando el archivo final…',55,80);const output='master.'+p.format;
 code=await ffmpeg.exec(['-hide_banner','-nostdin','-y','-i','chain.wav',...(filters.length?['-af',filters.join(',')]:[]),...outputArgs(p),output],600000);if(code!==0)throw new Error('No se pudo exportar el master.');if(!current())throw new Error('Cancelado');
 phase('Verificando el archivo exportado…',80,90);let result=await measure(ffmpeg,output,p),path=output,adjusted=false;
 // Verify the final file after rate conversion; lower gain if intersample peaks exceed ceiling.
 if(p.limiter&&result.peak>p.ceiling+.05){path='safe.'+p.format;code=await ffmpeg.exec(['-hide_banner','-nostdin','-y','-i',output,'-af',`volume=${p.ceiling-result.peak-.2}dB`,...outputArgs(p),path],240000);if(code!==0)throw new Error('No se pudo ajustar el margen final.');result=await measure(ffmpeg,path,p);adjusted=true;if(result.peak>p.ceiling+.05)throw new Error('No se pudo cumplir el techo de picos.');}
 await ffmpeg.deleteFile('chain.wav').catch(()=>{});return {path,result,adjusted};
}
