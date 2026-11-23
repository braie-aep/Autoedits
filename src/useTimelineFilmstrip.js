import {useEffect,useRef,useState} from 'react';
import {sourceCropRect} from './renderGeometry.js';

export const clampNumber=(n,min,max)=>Math.min(max,Math.max(min,Number(n)||0));
export function visibleTimeWindow(duration,zoom,scrollLeft,clientWidth,scrollWidth){
  if(!Number.isFinite(duration)||duration<=0) return {start:0,end:0};
  const viewWidth=Math.max(1,scrollWidth||clientWidth||1);
  const left=clampNumber(scrollLeft,0,Math.max(0,viewWidth-(clientWidth||viewWidth)));
  const start=duration*left/viewWidth;
  const end=duration*Math.min(1,(left+Math.min(viewWidth,clientWidth||viewWidth))/viewWidth);
  return {start,end:Math.max(start+Math.min(duration,.01),end)};
}
export function sampleFrameTimes(duration,mode,zoom,windowRange={}){
  if(!Number.isFinite(duration)||duration<=0)return [];
  const zoomLevel=Math.max(1,Math.min(16,Number(zoom)||1));
  const visibleStart=mode==='layers'?clampNumber(windowRange.start,0,duration):0;
  const expectedSpan=duration/zoomLevel;
  const suppliedSpan=Math.max(0,(windowRange.end||0)-visibleStart);
  const span=mode==='layers'&&suppliedSpan>expectedSpan*.65&&suppliedSpan<expectedSpan*1.35?suppliedSpan:mode==='layers'?expectedSpan:duration;
  const start=visibleStart,end=Math.min(duration,start+span);
  const count=mode==='layers'?21:19;
  const step=Math.max(.025,(end-start)/count);
  const before=mode==='layers'?2:0,after=mode==='layers'?2:0;
  const timestamps=[];
  for(let i=-before;i<count+after;i++){
    const t=clampNumber(start+i*step,0,Math.max(0,duration-.05));
    const time=Math.round(t*1000)/1000;
    if(timestamps.length===0||Math.abs(time-timestamps[timestamps.length-1])>.005) timestamps.push(time);
  }
  return timestamps.slice(0,26).map(time=>({time,widthSeconds:step}));
}
const loaded=(media,when)=>{
  if(media.readyState>=when)return Promise.resolve();
  return new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);media.removeEventListener('loadedmetadata',finish);media.removeEventListener('loadeddata',finish);media.removeEventListener('error',finish);resolve()};
    media.addEventListener('loadedmetadata',finish);media.addEventListener('loadeddata',finish);media.addEventListener('error',finish);
    const timer=setTimeout(finish,6000);
  });
};
const seekFrame=(media,time)=>{
  if(Math.abs(media.currentTime-time)<.025&&media.readyState>=2)return Promise.resolve();
  return new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);media.removeEventListener('seeked',finish);media.removeEventListener('error',finish);resolve()};
    media.addEventListener('seeked',finish);media.addEventListener('error',finish);
    const timer=setTimeout(finish,2500);
    try{media.currentTime=time}catch{finish()}
  });
};

/** Capture only visible, time-accurate frames. Increasing zoom shortens the sampled
 * time window; horizontal panning requests new timestamps. No fake thumbnails. */
export function useTimelineFilmstrip(url,duration,mode,zoom,windowRange) {
  const [frames,setFrames]=useState([]);
  const cacheRef=useRef(new Map());
  useEffect(()=>{cacheRef.current.clear();setFrames([])},[url]);
  useEffect(()=>{
    if(!url||!duration){setFrames([]);return}
    let cancelled=false;
    const points=sampleFrameTimes(duration,mode,zoom,windowRange);
    const cache=cacheRef.current;
    const readFrames=()=>points.filter(p=>cache.has(p.time)).map(p=>({...p,src:cache.get(p.time)}));
    setFrames(readFrames());
    const missing=points.filter(p=>!cache.has(p.time));
    if(!missing.length)return;
    const media=document.createElement('video');
    media.muted=true;media.playsInline=true;media.preload='auto';
    const canvas=document.createElement('canvas');canvas.width=144;canvas.height=82;
    const ctx=canvas.getContext('2d',{alpha:false});
    async function capture(){
      media.src=url;
      await loaded(media,1);
      if(cancelled||!ctx||!media.videoWidth||!media.videoHeight)return;
      const crop=sourceCropRect(media.videoWidth,media.videoHeight,canvas.width,canvas.height);
      for(const p of missing){
        if(cancelled)break;
        await seekFrame(media,p.time);
        if(cancelled)break;
        if(media.readyState<2)continue;
        try{
          ctx.drawImage(media,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
          cache.set(p.time,canvas.toDataURL('image/jpeg',.56));
          // Bound in-memory thumbnails, especially for long-form video panning.
          if(cache.size>150)cache.delete(cache.keys().next().value);
          if(!cancelled)setFrames(readFrames());
        }catch{ /* unsupported source frames are left empty */ }
      }
    }
    capture().catch(()=>{});
    return()=>{cancelled=true;media.pause();media.removeAttribute('src');media.load()};
  },[url,duration,mode,zoom,windowRange.start,windowRange.end]);
  return frames;
}
