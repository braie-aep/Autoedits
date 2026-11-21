// Browser-only Whisper transcription. Model weights are downloaded to the browser once.
let transcriberPromise=null;
export async function transcribeEnglish(file,onProgress=()=>{}){
  if(!file)throw new Error('Choose a video first.');
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  let offline;
  try{
    onProgress('Decoding audio track…');
    const decoded=await ctx.decodeAudioData(await file.arrayBuffer());
    if(decoded.duration>180)throw new Error('The first caption preview supports videos up to 3 minutes. Trim a shorter clip first.');
    if(!decoded.length)throw new Error('No audio samples found.');
    // Whisper requires 16 kHz mono PCM. OfflineAudioContext resamples without external services.
    const frames=Math.ceil(decoded.duration*16000);
    offline=new OfflineAudioContext(1,frames,16000);
    const source=offline.createBufferSource();
    source.buffer=decoded;
    source.connect(offline.destination);
    source.start();
    const rendered=await offline.startRendering();
    const audio=rendered.getChannelData(0);
    onProgress('Loading free English Whisper model (first download can be large)…');
    if(!transcriberPromise){
      transcriberPromise=import('@huggingface/transformers').then(async({pipeline})=>
        pipeline('automatic-speech-recognition','onnx-community/whisper-tiny.en',{device:'wasm',dtype:'q8'})
      ).catch(error=>{transcriberPromise=null;throw error;});
    }
    const transcriber=await transcriberPromise;
    onProgress('Transcribing speech on your device…');
    const result=await transcriber(audio,{return_timestamps:true,chunk_length_s:30,stride_length_s:5});
    const chunks=(result.chunks||[]).map(item=>({
      start:Math.max(0,Number(item.timestamp?.[0]??0)),
      end:Math.min(decoded.duration,Number(item.timestamp?.[1]??decoded.duration)),
      text:String(item.text||'').trim()
    })).filter(item=>item.text&&item.end>item.start);
    if(!chunks.length&&result.text?.trim()){
      chunks.push({start:0,end:decoded.duration,text:result.text.trim()});
    }
    if(!chunks.length)throw new Error('No speech was recognized in this video.');
    return chunks;
  }finally{await ctx.close().catch(()=>{});}
}
export function toSrt(captions){
  const ts=t=>{const ms=Math.max(0,Math.round(t*1000));const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),x=ms%1000;return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':')+','+String(x).padStart(3,'0')};
  return captions.map((c,i)=>[i+1,ts(c.start)+' --> '+ts(c.end),c.text,''].join('\n')).join('\n');
}
