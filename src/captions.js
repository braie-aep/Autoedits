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
      transcriberPromise=import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1').then(async({pipeline})=>
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

// Record only the selected highlight's audio, avoiding full-video decoding on long files.
// Uses real-time playback in the browser; no audio is uploaded.
export async function captureHighlightAudio(videoUrl,start,end,onProgress=()=>{}){
  if(!window.MediaRecorder)throw new Error('This browser does not support audio recording.');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>180)
    throw new Error('Choose a highlight between 1 second and 3 minutes.');
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)throw new Error('Web Audio is not available.');
  const audioEl=document.createElement('video');
  audioEl.preload='auto';audioEl.playsInline=true;audioEl.src=videoUrl;
  let ctx,recorder,stream;
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Unable to open the video audio track.')),15000);
      audioEl.addEventListener('loadedmetadata',()=>{clearTimeout(timeout);resolve()},{once:true});
      audioEl.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('Unable to read the video file.'))},{once:true});
      audioEl.load();
    });
    ctx=new AudioContextClass();
    const source=ctx.createMediaElementSource(audioEl);
    const dest=ctx.createMediaStreamDestination();
    source.connect(dest); // Route to recorder only, not device speakers.
    stream=dest.stream;
    const mime=['audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw new Error('This browser cannot record WebM audio.');
    await new Promise((resolve,reject)=>{
      if(Math.abs(audioEl.currentTime-start)<.05){resolve();return;}
      const timeout=setTimeout(()=>reject(new Error('Unable to seek to the selected highlight.')),15000);
      audioEl.addEventListener('seeked',()=>{clearTimeout(timeout);resolve()},{once:true});
      audioEl.currentTime=start;
    });
    await ctx.resume();
    const chunks=[];
    recorder=new MediaRecorder(stream,{mimeType:mime});
    recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data)});
    const stopped=new Promise((resolve,reject)=>{
      recorder.addEventListener('stop',resolve,{once:true});
      recorder.addEventListener('error',()=>reject(new Error('Audio recording failed.')),{once:true});
    });
    onProgress('Capturing audio from '+Math.round(end-start)+'-second highlight (real time)…');
    recorder.start(1000);
    await audioEl.play();
    await new Promise((resolve,reject)=>{
      let previousProgress=-1;
      const tick=()=>{
        if(audioEl.error){reject(new Error('Video decoding stopped.'));return;}
        const seconds=Math.min(end-start,Math.max(0,audioEl.currentTime-start));
        const whole=Math.floor(seconds);
        if(whole!==previousProgress){previousProgress=whole;onProgress('Capturing highlight audio: '+whole+' / '+Math.ceil(end-start)+' seconds…');}
        if(audioEl.currentTime>=end||audioEl.ended){resolve();return;}
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    audioEl.pause();
    recorder.stop();
    await stopped;
    const blob=new Blob(chunks,{type:mime});
    if(blob.size<2000)throw new Error('No usable audio was recorded from this highlight.');
    return blob;
  }finally{
    audioEl.pause();
    if(recorder&&recorder.state!=='inactive')recorder.stop();
    stream?.getTracks().forEach(track=>track.stop());
    if(ctx)await ctx.close().catch(()=>{});
    audioEl.removeAttribute('src');audioEl.load();
  }
}
