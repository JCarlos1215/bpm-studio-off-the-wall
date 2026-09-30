// Read FFmpeg's input description without decoding the whole file.
// The browser core's ffprobe export is not usable in this pinned build.
export async function inspectMedia(ffmpeg,path){
 const streams=[];let duration=null;
 const onLog=({message})=>{
  const track=message.match(/^\s*Stream #0:(\d+).*?: (Audio|Video): ([^ ,]+)/);
  if(track&&!streams.some(s=>s.index===Number(track[1])))streams.push({index:Number(track[1]),codec_type:track[2].toLowerCase(),codec_name:track[3],disposition:{attached_pic:message.includes('(attached pic)')}});
  const time=message.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);if(time)duration=Number(time[1])*3600+Number(time[2])*60+Number(time[3]);
 };
 ffmpeg.on('log',onLog);
 try{await ffmpeg.exec(['-hide_banner','-i',path]);}finally{ffmpeg.off('log',onLog);}
 if(!streams.length)throw new Error('UNSUPPORTED');
 return {streams,duration};
}
