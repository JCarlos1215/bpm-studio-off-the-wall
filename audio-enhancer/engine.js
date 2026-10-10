// Independent DSP pipeline using the repository's FFmpeg build.
// Loudness measurements: FFmpeg loudnorm, EBU R128 / ITU BS.1770.
import {pitchFilters} from './tuning.js?v=pitch-20261010-1';
export const PRESETS = {
  natural: {label:'Natural', loudness:-16, range:11},
  dj: {label:'DJ', loudness:-12, range:9},
  powerful: {label:'Potente', loudness:-10, range:7},
};
export function validateOptions({preset='natural',peak=-1,repair=true,removeDC=true,format='wav',sampleRate=44100,pitchMode='auto',pitchBehavior='preserve',manualCents=0}={}) {
  if (!PRESETS[preset] || ![-1,-2].includes(Number(peak)) || !['wav','flac'].includes(format) || ![44100,48000].includes(Number(sampleRate))) throw new Error('Los ajustes de procesamiento no son válidos.');
  if(!['off','auto','manual'].includes(pitchMode)||!['preserve','speed'].includes(pitchBehavior)||!Number.isFinite(Number(manualCents))||Math.abs(Number(manualCents))>100)throw new Error('El ajuste de tono debe estar entre −100 y +100 cents.');
  return {preset,peak:Number(peak),repair:Boolean(repair),removeDC:Boolean(removeDC),format,sampleRate:Number(sampleRate),pitchMode,pitchBehavior,manualCents:Number(manualCents),pitchCents:0};
}
export function parseMeasurement(lines) {
  const text=lines.join('\n');
  const matches=[...text.matchAll(/\{[^{}]*"input_i"[^{}]*\}/g)];
  if (!matches.length) throw new Error('No se pudo medir la sonoridad del archivo.');
  const raw=JSON.parse(matches.at(-1)[0]);
  const measurement={loudness:Number(raw.input_i),peak:Number(raw.input_tp),range:Number(raw.input_lra),threshold:Number(raw.input_thresh),offset:Number(raw.target_offset)};
  if (!Number.isFinite(measurement.loudness)) throw new Error('El archivo está en silencio o no tiene suficiente audio para medir la sonoridad.');
  if (Object.values(measurement).some(v=>!Number.isFinite(v))) throw new Error('El análisis no produjo mediciones fiables.');
  return measurement;
}
export function prepareFilters(options) {
  return [options.removeDC?'highpass=f=10':null,options.repair?'adeclip':null,...pitchFilters(options.pitchCents??0,options.pitchBehavior??'preserve')].filter(Boolean);
}
export function loudnessFilter(options,measurement=null) {
  const preset=PRESETS[options.preset];
  // Extra 0.5 dB of margin for the output-rate conversion; verify the exported file.
  const parts=[`I=${preset.loudness}`,`TP=${options.peak-.5}`,`LRA=${preset.range}`,'print_format=json'];
  if (measurement) parts.push(`measured_I=${measurement.loudness}`,`measured_TP=${measurement.peak}`,`measured_LRA=${measurement.range}`,`measured_thresh=${measurement.threshold}`,`offset=${measurement.offset}`,'linear=true');
  return `loudnorm=${parts.join(':')}`;
}
export async function measure(ffmpeg,path,options,filters=[],timeout=240000) {
  const lines=[];const onLog=({message})=>lines.push(message);
  ffmpeg.on('log',onLog);
  try {
    const code=await ffmpeg.exec(['-hide_banner','-nostdin','-i',path,'-map','0:a:0','-vn','-af',[...filters,loudnessFilter(options)].join(','),'-f','null','-'],timeout);
    if (code!==0) throw new Error('No se pudo analizar el audio. Revisa el formato o prueba una pista más corta.');
    return parseMeasurement(lines);
  } finally {ffmpeg.off('log',onLog);}
}
export function outputArgs(options) {
  return ['-ar',String(options.sampleRate),'-c:a',options.format==='wav'?'pcm_s24le':'flac',...(options.format==='flac'?['-compression_level','5']:[]),'-map_metadata','-1'];
}
export async function render(ffmpeg,input,output,options,measurement) {
  const filter=[...prepareFilters(options),loudnessFilter(options,measurement)].join(',');
  const code=await ffmpeg.exec(['-hide_banner','-nostdin','-y','-i',input,'-map','0:a:0','-vn','-af',filter,...outputArgs(options),output],600000);
  if(code!==0)throw new Error('El procesamiento no terminó. Puede faltar memoria; prueba una pista más corta.');
}
export async function enforcePeak(ffmpeg,path,measurement,options) {
  if (measurement.peak<=options.peak+.05) return {path,measurement,adjusted:false};
  const output=`safe.${options.format}`;
  const gain=options.peak-measurement.peak-.2;
  const code=await ffmpeg.exec(['-hide_banner','-nostdin','-y','-i',path,'-map','0:a:0','-af',`volume=${gain}dB`,...outputArgs(options),output],240000);
  if(code!==0)throw new Error('No se pudo ajustar el margen de picos.');
  const verified=await measure(ffmpeg,output,options);
  if (verified.peak>options.peak+.05) throw new Error('El archivo no cumple el límite de picos solicitado; prueba otro perfil.');
  return {path:output,measurement:verified,adjusted:true};
}
