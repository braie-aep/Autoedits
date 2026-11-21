// Local, browser-only silence analysis. No video or audio is uploaded.
export async function detectSilence(file,{thresholdDb=-38,minSilence=0.55}={}){
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)throw new Error('Web Audio is unavailable in this browser');
  const ctx=new AudioContextClass();
  try{
    const buffer=await file.arrayBuffer();
    const decoded=await ctx.decodeAudioData(buffer);
    const sampleRate=decoded.sampleRate,channels=decoded.numberOfChannels;
    const frame=Math.max(1,Math.floor(sampleRate*0.025));
    const threshold=Math.pow(10,thresholdDb/20);
    const silent=[];
    const barCount=180,peaks=Array(barCount).fill(0);
    let open=null;
    for(let i=0;i<decoded.length;i+=frame){
      const end=Math.min(decoded.length,i+frame);
      let sum=0,count=0;
      for(let ch=0;ch<channels;ch++){
        const samples=decoded.getChannelData(ch);
        for(let j=i;j<end;j+=2){sum+=samples[j]*samples[j];count++;}
      }
      const rms=Math.sqrt(sum/Math.max(1,count));
      const bar=Math.min(barCount-1,Math.floor(i/decoded.length*barCount));
      peaks[bar]=Math.max(peaks[bar],rms);
      const quiet=rms<threshold;
      if(quiet&&open===null)open=i/sampleRate;
      if(!quiet&&open!==null){
        const stop=i/sampleRate;
        if(stop-open>=minSilence)silent.push([open,stop]);
        open=null;
      }
    }
    if(open!==null&&decoded.duration-open>=minSilence)silent.push([open,decoded.duration]);
    const maxPeak=Math.max(...peaks,0.001);
    return {silent,duration:decoded.duration,peaks:peaks.map(v=>Math.min(1,Math.sqrt(v/maxPeak)))};
  }finally{await ctx.close();}
}
export function keepRanges(silent,start,end,padding=0.12){
  let cursor=start;
  const kept=[];
  for(const [a,b] of silent){
    const from=Math.max(start,a+padding),to=Math.min(end,b-padding);
    if(to<=from)continue;
    if(from>cursor+0.03)kept.push([cursor,from]);
    cursor=Math.max(cursor,to);
  }
  if(end>cursor+0.03)kept.push([cursor,end]);
  return kept;
}
