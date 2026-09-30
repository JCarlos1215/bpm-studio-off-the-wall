export const LIMIT = 200 * 1024 * 1024;
export const formats = {
 mp3:{mime:'audio/mpeg',label:'MP3',audio:true,hint:'Extrae la primera pista de audio. MP3: 192 kb/s equilibrada, 320 kb/s alta o 128 kb/s pequeña.'},
 wav:{mime:'audio/wav',label:'WAV',audio:true,hint:'WAV PCM de 16 bits, sin compresión. Conserva la frecuencia de muestreo; el archivo puede crecer mucho.'},
 flac:{mime:'audio/flac',label:'FLAC',audio:true,hint:'FLAC conserva el audio decodificado sin pérdida adicional. No recupera calidad perdida previamente.'},
 m4a:{mime:'audio/mp4',label:'M4A',audio:true,hint:'Audio AAC en un contenedor M4A: 192, 256 o 128 kb/s según la calidad.'},
 aac:{mime:'audio/aac',label:'AAC',audio:true,hint:'Audio AAC en formato ADTS: 192, 256 o 128 kb/s según la calidad.'},
 mp4:{mime:'video/mp4',label:'MP4',audio:false,hint:'Video H.264 y audio AAC. Equilibrada: hasta 1080p; alta: resolución original; pequeña: hasta 720p. Conserva las proporciones.'},
 webm:{mime:'video/webm',label:'WebM',audio:false,hint:'Video VP8 y audio Vorbis. Hasta 1080p, resolución original o hasta 720p según la calidad. Puede tardar más que MP4.'}
};
export function buildArgs(input, output, format, quality, streams){
 const spec=formats[format];if(!spec)throw new Error('Formato de salida no válido.');
 if(!['standard','high','small'].includes(quality))throw new Error('Calidad no válida.');
 const audio=streams.find(s=>s.codec_type==='audio');
 const video=streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);
 if(spec.audio&&!audio)throw new Error('El archivo no contiene una pista de audio. Elige un video con sonido u otro archivo.');
 if(!spec.audio&&!video)throw new Error('El archivo no contiene una pista de video. Elige un formato de audio para convertirlo.');
 const args=['-i',input,'-map_metadata','-1','-map_chapters','-1','-sn','-dn'];
 const bitrate=quality==='high'?'256k':quality==='small'?'128k':'192k';
 if(spec.audio){
  args.push('-map',`0:${audio.index}`,'-vn');
  if(format==='mp3')args.push('-c:a','libmp3lame','-b:a',quality==='high'?'320k':bitrate,'-ar','44100','-ac','2');
  if(format==='wav')args.push('-c:a','pcm_s16le');
  if(format==='flac')args.push('-c:a','flac','-compression_level','5');
  if(format==='m4a'||format==='aac')args.push('-c:a','aac','-b:a',bitrate,'-ac','2');
  if(format==='m4a')args.push('-movflags','+faststart');
 }else{
  args.push('-map',`0:${video.index}`);if(audio)args.push('-map',`0:${audio.index}`);
  const height=quality==='small'?720:1080;
  const scale=quality==='high'?'scale=trunc(iw/2)*2:trunc(ih/2)*2':`scale=-2:trunc(min(ih\\,${height})/2)*2`;
  args.push('-vf',scale,'-pix_fmt','yuv420p','-threads','1');
  if(format==='mp4')args.push('-c:v','libx264','-preset','ultrafast','-crf',quality==='high'?'18':quality==='small'?'30':'23','-c:a','aac','-b:a',bitrate,'-ac','2','-movflags','+faststart');
  else args.push('-c:v','libvpx','-deadline','realtime','-cpu-used','8','-crf',quality==='high'?'24':quality==='small'?'40':'32','-b:v',quality==='high'?'4M':quality==='small'?'800k':'2M','-c:a','libvorbis','-q:a',quality==='high'?'6':quality==='small'?'3':'5','-ac','2');
 }
 return [...args,output];
}
