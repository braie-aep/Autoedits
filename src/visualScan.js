// Sample sparse video frames locally when browser audio decoding is unavailable.
// This is a visual-activity heuristic, NOT semantic video understanding.
export async function scanVideoActivity(url,duration,onProgress=()=>{}){
 if(!url||!Number.isFinite(duration)||duration<=0)throw new Error('Load a video first.');
 const media=document.createElement('video');
 media.preload='auto';media.muted=true;media.playsInline=true;
 media.src=url;
 try{
  await new Promise((resolve,reject)=>{
   if(media.readyState>=1){resolve();return;}
   const timeout=setTimeout(()=>reject(new Error('Video could not load for visual scan.')),12000);
   media.addEventListener('loadedmetadata',()=>{clearTimeout(timeout);resolve()},{once:true});
   media.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('Cannot decode this video.'))},{once:true});
   media.load();
  });
  const canvas=document.createElement('canvas');canvas.width=56;canvas.height=32;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Canvas unavailable');
  const count=Math.min(72,Math.max(20,Math.ceil(duration/35)));
  const samples=[];let previous=null;
  for(let i=0;i<count;i++){
   const time=Math.min(duration-.05,Math.max(0,(i+.5)*duration/count));
   await new Promise((resolve,reject)=>{
    let finished=false;
    const complete=(error)=>{if(finished)return;finished=true;clearTimeout(timeout);media.removeEventListener('seeked',onSeek);media.removeEventListener('error',onError);error?reject(error):resolve()};
    const onSeek=()=>complete(),onError=()=>complete(new Error('Video seek failed'));
    const timeout=setTimeout(()=>complete(new Error('Video seek timed out')),5500);
    media.addEventListener('seeked',onSeek);media.addEventListener('error',onError);
    media.currentTime=time;
    if(Math.abs(media.currentTime-time)<.05&&media.readyState>=2)complete();
   });
   context.drawImage(media,0,0,canvas.width,canvas.height);
   const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
   const gray=new Uint8Array(canvas.width*canvas.height);
   let texture=0;
   for(let j=0;j<gray.length;j++){
    const k=j*4;gray[j]=(pixels[k]*.299+pixels[k+1]*.587+pixels[k+2]*.114)|0;
    if(j%canvas.width)texture+=Math.abs(gray[j]-gray[j-1]);
   }
   let difference=0;
   if(previous)for(let j=0;j<gray.length;j+=2)difference+=Math.abs(gray[j]-previous[j]);
   const change=previous?Math.min(1,difference/(gray.length/2*70)):0;
   const detail=Math.min(1,texture/(gray.length*35));
   samples.push({time,activity:Math.min(1,change*.8+detail*.2)});
   previous=gray;
   onProgress('Scanning sample frame '+(i+1)+' of '+count+'…');
  }
  return samples;
 }finally{media.pause();media.removeAttribute('src');media.load();}
}
