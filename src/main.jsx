import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Upload,Play,Pause,Download,WandSparkles,Scissors,Monitor,Smartphone,Square,Film,AlertCircle,Type,Music2,Shapes,Layers3,Clapperboard,Plus,RotateCcw,Volume2,VolumeX,ChevronDown,FolderOpen,SlidersHorizontal} from 'lucide-react';
import './style.css';
import './link-workflow.css';
import './editor-workspace.css';
import './invideo-inspired.css';
import {makeScenes,splitAt,soundtrackTime} from './sceneUtils.js';
import {useTimelineFilmstrip,visibleTimeWindow} from './useTimelineFilmstrip.js';
import {drawEditorTitle,drawEditorSticker} from './canvasOverlays.js';
import {sourceCropRect,outputCanvasSize} from './renderGeometry.js';
import {detectSilence,keepRanges} from './silence.js';
import {transcribeEnglish,toSrt,captureHighlightAudio} from './captions.js';
import {suggestHighlights} from './highlights.js';
import {scanVideoActivity} from './visualScan.js';
const ratios={'Original':null,'16:9':16/9,'9:16':9/16,'1:1':1,'4:5':4/5};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const fmt=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
function interpret(prompt,duration){
  const p=prompt.toLowerCase(),changes=[],unknown=[];let start=null,end=null,ratio=null,muted=null;
  const ratioMatch=p.match(/(?:9\s*:\s*16|16\s*:\s*9|1\s*:\s*1|4\s*:\s*5)/);
  if(ratioMatch){ratio=ratioMatch[0].replace(/\s/g,'');changes.push(`Aspect ratio ${ratio}`)}
  else if(/vertical|portrait|reel|shorts|tiktok/.test(p)){ratio='9:16';changes.push('Vertical 9:16 crop')}
  else if(/square/.test(p)){ratio='1:1';changes.push('Square 1:1 crop')}
  else if(/landscape|widescreen/.test(p)){ratio='16:9';changes.push('Landscape 16:9 crop')}
  const first=p.match(/(?:first|opening)\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s\b)/);
  if(first){start=0;end=clamp(Number(first[1]),0,duration);changes.push(`Keep first ${end} seconds`)}
  const range=p.match(/(?:from|between)\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?\s*(?:to|and|-)\s*(\d+(?:\.\d+)?)/);
  if(range){start=clamp(Number(range[1]),0,duration);end=clamp(Number(range[2]),0,duration);changes.push(`Trim ${start}s–${end}s`)}
  if(/\b(mute|no audio|remove audio|silent video)\b/.test(p)){muted=true;changes.push('Mute audio')}
  if(/\b(unmute|keep audio|include audio)\b/.test(p)){muted=false;changes.push('Keep audio')}
  if(/captions?|subtitles?|transcrib|highlight|silence|transitions?|music|color grad|cinematic|zoom|tracking|stabiliz|speed ramp/.test(p)) unknown.push('Some requested AI or creative effects are not available in this MVP.');
  if(!changes.length)unknown.push('No supported command found. Try “make it 9:16 and keep the first 15 seconds”.');
  return {start,end,ratio,muted,changes,unknown};
}
function App(){
const [file,setFile]=useState(null),[url,setUrl]=useState(''),[duration,setDuration]=useState(0),[dimensions,setDimensions]=useState([1920,1080]),[start,setStart]=useState(0),[end,setEnd]=useState(0),[ratio,setRatio]=useState('Original'),[muted,setMuted]=useState(false),[prompt,setPrompt]=useState('Make this a vertical 9:16 reel and keep the first 15 seconds'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[current,setCurrent]=useState(0);
const video=useRef(null),viewerRef=useRef(null),pendingPreviewRef=useRef(null),urlRef=useRef(''),cancelRef=useRef(false);
const [manualCuts,setManualCuts]=useState([]),[cutIn,setCutIn]=useState(0),[cutOut,setCutOut]=useState(0),[review,setReview]=useState(false);
const manualRef=useRef([]);
const [silences,setSilences]=useState([]),[analyzing,setAnalyzing]=useState(false),[cutSilence,setCutSilence]=useState(false);
const timelineRef=useRef(null);
const [waveform,setWaveform]=useState([]),[musicWaveform,setMusicWaveform]=useState([]),[audioReading,setAudioReading]=useState(false);
const [captions,setCaptions]=useState([]),[captionsByHighlight,setCaptionsByHighlight]=useState({}),[activeHighlightId,setActiveHighlightId]=useState(null),[captionsOn,setCaptionsOn]=useState(true),[transcribing,setTranscribing]=useState(false),[captionStatus,setCaptionStatus]=useState('');
const captionJob=useRef(0);
const [highlights,setHighlights]=useState([]),[highlightLength,setHighlightLength]=useState(30),[highlightCount,setHighlightCount]=useState(4);
const [highlightStatus,setHighlightStatus]=useState('');
const [youtubeInput,setYoutubeInput]=useState(''),[youtubeId,setYoutubeId]=useState(''),[youtubeError,setYoutubeError]=useState('');
const [importApiUrl,setImportApiUrl]=useState(()=>location.hostname.endsWith('github.io')?'https://autoedit-private-hc51.onrender.com':location.origin),[importApiKey,setImportApiKey]=useState('');
const [linkAuthorized,setLinkAuthorized]=useState(false),[linkWorking,setLinkWorking]=useState(false),[linkStep,setLinkStep]=useState('');
const [advancedImport,setAdvancedImport]=useState(false),autoLinkPending=useRef(false);
const [directUrl,setDirectUrl]=useState(''),[linkImportStatus,setLinkImportStatus]=useState(''),[importingLink,setImportingLink]=useState(false);
const [shortsBuilding,setShortsBuilding]=useState(false),[focusX,setFocusX]=useState(50),[focusMode,setFocusMode]=useState(true);
const [autoCaptionShorts,setAutoCaptionShorts]=useState(true),[shortsProgress,setShortsProgress]=useState(''),[motionGraphics,setMotionGraphics]=useState('dynamic'),[shortsTitle,setShortsTitle]=useState('BEST MOMENTS');
const activeHighlight=highlights.find(h=>h.id===activeHighlightId)||null;
const activeCaptions=activeHighlightId?(captionsByHighlight[activeHighlightId]||[]):captions;
const activeClipLabel=activeHighlight?'Highlight '+(highlights.findIndex(h=>h.id===activeHighlightId)+1):'Full video';
const [timelineView,setTimelineView]=useState('scenes'),[sceneMarkers,setSceneMarkers]=useState([]),[sceneThumbs,setSceneThumbs]=useState({});
const [editorTool,setEditorTool]=useState('media'),[timelineZoom,setTimelineZoom]=useState(1);
const [previewShare,setPreviewShare]=useState(54),[libraryWidth,setLibraryWidth]=useState(276),[propertiesWidth,setPropertiesWidth]=useState(250);
const workspaceRef=useRef(null),centerRef=useRef(null),sequenceScrollRef=useRef(null),activeResizeRef=useRef(null),scrollTimerRef=useRef(null);
const [timelineWindow,setTimelineWindow]=useState({start:0,end:0});
const timelineFrames=useTimelineFilmstrip(url,duration,timelineView,timelineZoom,timelineWindow);
function syncTimelineViewport(el){
 if(!el||!duration)return;
 const windowTimes=visibleTimeWindow(duration,timelineZoom,el.scrollLeft,el.clientWidth,el.scrollWidth);
 setTimelineWindow(old=>Math.abs(old.start-windowTimes.start)<.04&&Math.abs(old.end-windowTimes.end)<.04?old:windowTimes);
}
function scheduleTimelineViewport(e){
 const el=e.currentTarget;clearTimeout(scrollTimerRef.current);
 scrollTimerRef.current=setTimeout(()=>syncTimelineViewport(el),140);
}
useEffect(()=>{
 if(timelineView!=='layers'||!duration)return;
 const handle=requestAnimationFrame(()=>{
  const el=sequenceScrollRef.current;if(!el)return;
  el.scrollLeft=Math.max(0,current/Math.max(.01,duration)*el.scrollWidth-el.clientWidth/2);
  syncTimelineViewport(el);
 });
 return()=>cancelAnimationFrame(handle);
},[timelineZoom,timelineView,duration]);
useEffect(()=>()=>clearTimeout(scrollTimerRef.current),[]);
function startWorkspaceResize(e,kind){
 if(e.button!==0)return;
 e.preventDefault();
 activeResizeRef.current={kind,startX:e.clientX,startY:e.clientY,preview:previewShare,library:libraryWidth,properties:propertiesWidth,centerHeight:centerRef.current?.getBoundingClientRect().height||600};
 e.currentTarget.setPointerCapture?.(e.pointerId);
}
function moveWorkspaceResize(e){
 const drag=activeResizeRef.current;if(!drag)return;
 if(drag.kind==='horizontal'){
  const available=Math.max(1,drag.centerHeight-61);
  const low=Math.max(22,210/available*100),high=Math.min(78,(available-175)/available*100);
  setPreviewShare(Math.max(low,Math.min(Math.max(low,high),drag.preview+(e.clientY-drag.startY)/available*100)));
 }else{
  const maxLibrary=Math.min(420,Math.max(220,window.innerWidth-drag.properties-72-16-360));
  if(drag.kind==='library')setLibraryWidth(Math.max(210,Math.min(maxLibrary,drag.library+e.clientX-drag.startX)));
  if(drag.kind==='properties')setPropertiesWidth(Math.max(205,Math.min(420,drag.properties-(e.clientX-drag.startX))));
 }
}
function endWorkspaceResize(e){
 if(!activeResizeRef.current)return;activeResizeRef.current=null;
 if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
}
function resizeWithKeyboard(e,kind){
 if(kind==='horizontal'&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
   e.preventDefault();setPreviewShare(v=>Math.max(24,Math.min(76,v+(e.key==='ArrowDown'?4:-4))));
 }else if(kind!=='horizontal'&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
   e.preventDefault();const diff=e.key==='ArrowRight'?12:-12;
   if(kind==='library')setLibraryWidth(v=>Math.max(210,Math.min(420,v+diff)));
   else setPropertiesWidth(v=>Math.max(205,Math.min(420,v-diff)));
 }
}

const [projectName,setProjectName]=useState('Untitled video'),[selectedLayer,setSelectedLayer]=useState('video');

const scenes=makeScenes(duration,sceneMarkers),currentScene=scenes.find(c=>current>=c.start&&current<c.end)||scenes[scenes.length-1];
const [titleLayer,setTitleLayer]=useState(null),[stickerLayer,setStickerLayer]=useState(null);
const [videoFilter,setVideoFilter]=useState({brightness:100,contrast:100,saturate:100});
const [musicFile,setMusicFile]=useState(null),[musicUrl,setMusicUrl]=useState(''),[musicDuration,setMusicDuration]=useState(0),[musicVolume,setMusicVolume]=useState(65),[musicEnabled,setMusicEnabled]=useState(true);
const musicUrlRef=useRef(''),musicPreviewRef=useRef(null);
useEffect(()=>{
 if(!musicFile){setMusicWaveform([]);return}
 let active=true;
 (musicFile.size<150*1024*1024?detectSilence(musicFile):Promise.reject(new Error('Soundtrack too large to decode locally'))).then(r=>{if(active)setMusicWaveform(r.peaks||[])}).catch(()=>{if(active)setMusicWaveform([])});
 return()=>{active=false};
},[musicFile]);
useEffect(()=>{if(musicPreviewRef.current){musicPreviewRef.current.volume=musicVolume/100;musicPreviewRef.current.muted=!musicEnabled;if(!musicEnabled)musicPreviewRef.current.pause();else if(playing)musicPreviewRef.current.play().catch(()=>{})}},[musicVolume,musicEnabled,playing,musicUrl]);
const stageRef=useRef(null),[stageSize,setStageSize]=useState({width:0,height:0});
useEffect(()=>{if(!url||!stageRef.current||typeof ResizeObserver==='undefined')return;const el=stageRef.current;const measure=()=>{const b=el.getBoundingClientRect();setStageSize(old=>(old.width===b.width&&old.height===b.height)?old:{width:b.width,height:b.height})};const observer=new ResizeObserver(measure);observer.observe(el);measure();return()=>observer.disconnect()},[url]);
const [visualSamples,setVisualSamples]=useState([]),[visualScanning,setVisualScanning]=useState(false),visualJob=useRef(0);
const audioAnalysisRef=useRef(null),analysisJob=useRef(0);
useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current)},[]);
useEffect(()=>()=>{if(musicUrlRef.current)URL.revokeObjectURL(musicUrlRef.current)},[]);
useEffect(()=>{
 if(!url||duration<=0){setSceneThumbs({});return}
 let cancelled=false;const v=document.createElement('video');v.src=url;v.preload='auto';v.muted=true;v.playsInline=true;
 const canvas=document.createElement('canvas');canvas.width=170;canvas.height=100;const ctx=canvas.getContext('2d');
 async function capture(){
   await new Promise(resolve=>{v.onloadedmetadata=resolve;v.onerror=resolve;if(v.readyState>=1)resolve();});
   if(!ctx||cancelled)return;
   const captures={};
   for(const scene of makeScenes(duration,sceneMarkers).slice(0,12)){
     if(cancelled)break;
     try{
       const moment=Math.min(duration-.08,scene.start+Math.min(.5,(scene.end-scene.start)/2));
       await new Promise(resolve=>{v.onseeked=resolve;v.onerror=resolve;v.currentTime=Math.max(0,moment);if(Math.abs(v.currentTime-moment)<.001&&v.readyState>=2)resolve()});
       if(cancelled)break;
       const crop=sourceCropRect(v.videoWidth,v.videoHeight,canvas.width,canvas.height);
       ctx.drawImage(v,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
       captures[scene.id]=canvas.toDataURL('image/jpeg',.6);
       setSceneThumbs({...captures});
     }catch{ /* source codecs and seeks vary; keep placeholder thumbnail */ }
   }
 }
 capture();
 return ()=>{cancelled=true;v.pause();v.removeAttribute('src');v.load()};
},[url,duration,sceneMarkers]);
function load(f,autoShorts=false){if(!f)return;autoLinkPending.current=autoShorts;if(!f.type.startsWith('video/')){setMessage('Choose a video file.');return}if(urlRef.current)URL.revokeObjectURL(urlRef.current);const next=URL.createObjectURL(f);urlRef.current=next;setUrl(next);setFile(f);setDuration(0);setStart(0);setEnd(0);setSceneMarkers([]);setSceneThumbs({});setTitleLayer(null);setStickerLayer(null);setVideoFilter({brightness:100,contrast:100,saturate:100});setSelectedLayer('video');setRatio('Original');setMuted(false);setSilences([]);setCutSilence(false);setManualCuts([]);manualRef.current=[];setReview(false);setCutIn(0);setCutOut(0);setShortsBuilding(false);setShortsProgress('');setFocusX(50);setHighlights([]);setActiveHighlightId(null);setCaptionsByHighlight({});setVisualSamples([]);setVisualScanning(false);visualJob.current++;setHighlightStatus('');setTranscribing(false);setCaptions([]);setCaptionsOn(true);setCaptionStatus('');captionJob.current++;setWaveform([]);audioAnalysisRef.current=null;const job=++analysisJob.current;setAudioReading(f.size<350*1024*1024);(f.size<350*1024*1024?detectSilence(f):Promise.reject(new Error('Long-video audio decoding skipped to save memory'))).then(result=>{if(job!==analysisJob.current)return;audioAnalysisRef.current=result;setWaveform(result.peaks||[])}).catch(()=>{if(job===analysisJob.current)setWaveform([])}).finally(()=>{if(job===analysisJob.current)setAudioReading(false)});setMessage('Video loaded. Waiting for metadata…')}
async function importDirectVideoLink(){
 if(importingLink||busy)return;
 let target;
 try{
   target=new URL(directUrl.trim());
   if(target.protocol!=='https:')throw Error('Use a secure HTTPS video-file URL.');
   const host=target.hostname.toLowerCase();
   if(/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)){
     throw Error('YouTube watch links cannot supply editable video bytes. Use the original file or a permitted direct video-file URL.');
   }
   if(target.username||target.password)throw Error('Links containing passwords are not supported.');
 }catch(error){setLinkImportStatus(error.message||'Enter a valid video URL.');return}
 setImportingLink(true);setLinkImportStatus('Fetching permitted video file…');
 try{
   const response=await fetch(target.href,{mode:'cors',credentials:'omit',redirect:'follow'});
   if(!response.ok)throw Error('Remote server returned '+response.status+'.');
   const type=(response.headers.get('content-type')||'').toLowerCase();
   if(type.includes('text/html'))throw Error('This is a web page, not a direct video file.');
   const declared=Number(response.headers.get('content-length')||0);
   const limit=600*1024*1024;
   if(declared>limit)throw Error('Video is larger than 600 MB. Upload the file directly instead.');
   const blob=await response.blob();
   if(blob.size>limit)throw Error('Video exceeds the 600 MB browser-link limit.');
   if(blob.size<1024)throw Error('Video data was empty.');
   const path=decodeURIComponent(target.pathname.split('/').pop()||'remote-video.mp4');
   const name=/\.(mp4|webm|mov|m4v)$/i.test(path)?path:'linked-video.mp4';
   const mediaType=type.startsWith('video/')?type:'video/mp4';
   load(new File([blob],name,{type:mediaType}));
   setLinkImportStatus('Imported '+name+'. Video is now ready for Shorts Automation Studio. Click Create portrait highlights + graphics.');
 }catch(error){
   setLinkImportStatus('Link import failed: '+(error?.message||'Network blocked')+'. The source must allow cross-origin video downloads (CORS). Try uploading the original file.');
 }finally{setImportingLink(false)}
}
async function generateShortsFromLink(){
 if(linkWorking||shortsBuilding||importingLink||busy)return;
 const input=youtubeInput.trim();
 if(!input){setLinkStep('Paste a YouTube video link to get started.');return}
 let target;
 try{
   target=new URL(input);
   if(target.protocol!=='https:'||!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(target.hostname.toLowerCase().replace(/^www\./,''))){
     throw Error('Paste an HTTPS YouTube video link.');
   }
   if(!linkAuthorized)throw Error('Confirm that you own this video or have permission to edit it.');
   if(!importApiUrl.trim())throw Error('This static GitHub Pages copy has no import server. Open the separately hosted AutoEdit app or configure a private HTTPS server.');
   if(!importApiKey.trim()){setAdvancedImport(true);throw Error('Enter the private server access key once. It is shown in your hosting dashboard, not stored in the website.');}
   const api=new URL(importApiUrl.trim());
   if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash)throw Error('Importer server must be a valid HTTPS base URL.');
   setLinkWorking(true);setLinkStep('Stage 1/4 — asking the private importer to retrieve your video…');
   const base=api.href.replace(/\/$/,'');
   const headers={Authorization:'Bearer '+importApiKey.trim()};
   const response=await fetch(base+'/api/import',{method:'POST',mode:'cors',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({url:input,authorized:true})});
   const data=await response.json().catch(()=>null);
   if(!response.ok)throw Error(data?.detail||'Importer returned HTTP '+response.status);
   if(!data?.download_path||!data.download_path.startsWith('/api/media/'))throw Error('Importer response is missing a media path.');
   setLinkStep('Stage 2/4 — transferring imported video into AutoEdit…');
   const media=await fetch(base+data.download_path,{headers,mode:'cors'});
   if(!media.ok)throw Error('Could not retrieve imported video ('+media.status+').');
   const buffer=await media.blob();
   if(!buffer.size)throw Error('The imported file was empty.');
   if(buffer.size>600*1024*1024)throw Error('Imported file is too large for this browser.');
   const mediaType=media.headers.get('content-type')?.startsWith('video/')?media.headers.get('content-type'):'video/mp4';
   const safeName=String(data.title||'youtube-video').replace(/[^\w -]/g,'').trim().slice(0,80)||'youtube-video';
   setLinkStep('Stage 3/4 — video ready; finding highlights and generating Shorts…');
   load(new File([buffer],safeName+'.mp4',{type:mediaType}),true);
 }catch(err){setLinkStep('Link automation stopped: '+(err?.message||'Unknown error'))}
 finally{setLinkWorking(false)}
}
function openYoutubePreview(){
 try{
   const raw=new URL(youtubeInput.trim());const host=raw.hostname.toLowerCase().replace(/^www\./,'');
   let id='';
   if(host==='youtu.be')id=raw.pathname.split('/')[1]||'';
   else if(['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host)){
      id=raw.searchParams.get('v')||raw.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1]||'';
   }
   if(!/^[\w-]{11}$/.test(id))throw new Error('Enter a valid YouTube video link.');
   setYoutubeId(id);setYoutubeError('');
 }catch(e){setYoutubeError('Please paste a valid YouTube video URL.');setYoutubeId('')}
}
async function createShorts(){
 if(!file||!duration||shortsBuilding||visualScanning||busy||transcribing)return;
 const job=++captionJob.current;
 setShortsBuilding(true);setHighlightStatus('Preparing Shorts from your uploaded footage…');
 setShortsProgress('Stage 1/3 — find highlight candidates');
 try{
   let frames=visualSamples;
   if(!captions.length&&!waveform.length&&!frames.length){
     frames=await scanVideoActivity(url,duration,status=>setShortsProgress('Analyzing visual activity: '+status));
     setVisualSamples(frames);
   }
   const picks=suggestHighlights({duration,captions,waveform,visualSamples:frames,count:highlightCount,clipLength:highlightLength});
   if(!picks.length)throw new Error('No highlight candidates found.');
   setHighlights(picks);setRatio('9:16');setFocusMode(true);setFocusX(50);
   selectHighlight(picks[0],false);
   setHighlightStatus('Generated '+picks.length+' suggested clips. Review each card below; these are activity estimates, not actual YouTube audience metrics.');
   if(autoCaptionShorts){
     setTranscribing(true);
     const updates={};const failures=[];
     for(let i=0;i<picks.length;i++){
       const clip=picks[i];
       setShortsProgress('Stage 2/3 — captioning clip '+(i+1)+' of '+picks.length);
       try{
         const recorded=await captureHighlightAudio(url,clip.start,clip.end,status=>setShortsProgress('Clip '+(i+1)+'/'+picks.length+': '+status));
         const result=await transcribeEnglish(recorded,status=>setShortsProgress('Clip '+(i+1)+'/'+picks.length+': '+status));
         updates[clip.id]=result.map(c=>({start:clip.start+c.start,end:Math.min(clip.end,clip.start+c.end),text:c.text})).filter(c=>c.end>c.start);
         setCaptionsByHighlight(previous=>({...previous,[clip.id]:updates[clip.id]}));
       }catch(error){failures.push('Clip '+(i+1)+': '+error.message)}
       if(job!==captionJob.current)break;
     }
     setCaptionsOn(true);
     setCaptionStatus(failures.length?('Caption issues: '+failures.join(' | ')):'Captions generated separately for all '+picks.length+' clips. Review text before exporting.');
     setTranscribing(false);
   }
   setShortsProgress('Stage 3/3 — ready for review. Select each clip, adjust the crop, then export.');
   setLinkStep('Ready — '+picks.length+' Shorts suggested. Review the results below and export each clip.');
   setEditorTool('shorts');
 }catch(e){setShortsProgress('Automation stopped: '+e.message);setHighlightStatus('Could not prepare Shorts: '+e.message)}
 finally{setTranscribing(false);setShortsBuilding(false)}
}
function metadata(e){const v=e.currentTarget;if(!Number.isFinite(v.duration)){setMessage('This video has no readable duration. Try MP4 (H.264).');return}setDuration(v.duration);setEnd(v.duration);setCutOut(Math.min(5,v.duration));setDimensions([v.videoWidth,v.videoHeight]);setMessage('Ready to edit. Your file stays on your device.')}
useEffect(()=>{
 if(duration>0&&file&&autoLinkPending.current){
   autoLinkPending.current=false;
   setLinkStep('Stage 4/4 — creating portrait highlights, captions and graphics…');
   createShorts();
 }
},[duration,file]);
async function apply(){if(!duration||analyzing||busy)return;const wantsSilence=/(?:remove|cut|delete|skip|trim|clear)\s+(?:all\s+)?(?:the\s+)?(?:silent\s+(?:parts?|sections?|moments?)|silence|pauses?|dead\s*air)|(?:auto\s*cut|detect)\s+silence/i.test(prompt);const cut=prompt.toLowerCase().match(/(?:cut|remove|delete|skip)\s+(?:the\s+)?(?:section\s+)?(?:from\s+|between\s+)(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?\s*(?:to|and|-)\s*(\d+(?:\.\d+)?)/);if(cut){addCut(Number(cut[1]),Number(cut[2]));if(!wantsSilence)return;}const r=interpret(prompt,duration);if(r.ratio)setRatio(r.ratio);if(r.start!==null)setStart(r.start);if(r.end!==null)setEnd(r.end);if(r.muted!==null)setMuted(r.muted);if(wantsSilence){await analyzeSilence();return;}if(/(?:find|create|make|generate|suggest|auto)\s+(?:the\s+)?(?:best\s+)?(?:highlights?|clips?|shorts?)/i.test(prompt)){generateHighlights();return;}if(/(?:generate|create|add|make|auto|turn on)\s+(?:english\s+)?(?:captions?|subtitles?)/i.test(prompt)){await generateCaptions();return;}setMessage([...r.changes.map(x=>'✓ '+x),...r.unknown.map(x=>'⚠ '+x)].join('\n'))}
function addCut(a,b){const from=clamp(Math.min(a,b),start,end),to=clamp(Math.max(a,b),start,end);if(to-from<0.05){setMessage('Choose a cut at least 0.05 seconds long.');return;}const next=[...manualRef.current,[from,to]].sort((x,y)=>x[0]-y[0]);const merged=[];for(const [x,y] of next){if(merged.length&&x<=merged[merged.length-1][1])merged[merged.length-1][1]=Math.max(y,merged[merged.length-1][1]);else merged.push([x,y]);}manualRef.current=merged;setManualCuts(merged);setMessage('Cut marked: '+fmt(from)+'–'+fmt(to)+'. Enable Review edit to preview the joined result.');}
function adjustCut(type,i,edge,value){const list=type==='manual'?manualCuts:silences;const currentCut=list[i];if(!currentCut||!Number.isFinite(value))return;let a=edge===0?clamp(value,0,currentCut[1]-0.05):currentCut[0];let b=edge===1?clamp(value,currentCut[0]+0.05,duration):currentCut[1];const next=list.map((cut,index)=>index===i?[a,b]:cut).sort((x,y)=>x[0]-y[0]);if(type==='manual'){manualRef.current=next;setManualCuts(next)}else setSilences(next);}
function restoreSilence(i){setSilences(previous=>previous.filter((_,index)=>index!==i));setMessage('Silent section restored. It will now be kept in review and export.');}
function restoreCut(i){const next=manualRef.current.filter((_,j)=>j!==i);manualRef.current=next;setManualCuts(next);setMessage('Cut restored.');}
function ranges(){const cuts=[...manualCuts,...(cutSilence?silences:[])].map(([a,b])=>[Math.max(start,a),Math.min(end,b)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);const merged=[];for(const [a,b] of cuts){if(merged.length&&a<=merged[merged.length-1][1])merged[merged.length-1][1]=Math.max(b,merged[merged.length-1][1]);else merged.push([a,b]);}return keepRanges(merged,start,end,0);}
async function analyzeSilence(){if(!file||analyzing||busy)return;setAnalyzing(true);setMessage('Analyzing the video audio locally to find silent sections…');try{
 const result=audioAnalysisRef.current||await detectSilence(file);
 audioAnalysisRef.current=result;setWaveform(result.peaks||[]);
 setSilences(result.silent);
 setCutSilence(result.silent.length>0);
 setReview(result.silent.length>0);
 video.current?.pause();
 if(result.silent.length){seek(start);setMessage('✓ Found '+result.silent.length+' silent section(s). They are marked amber on the timeline and will be skipped in review and export. Restore any section you want to keep.');}
 else setMessage('No silent sections met the detection threshold. Nothing was removed. Try a video with longer pauses or adjust the audio.');
 timelineRef.current?.scrollIntoView({behavior:'smooth',block:'center'});
 }catch(e){setMessage('Could not analyze audio: '+e.message+'. This browser may not decode the audio track. Try an H.264/AAC MP4 or a short WebM.')}finally{setAnalyzing(false)}}
async function generateCaptions(){if(activeHighlight){await captionHighlight(activeHighlight);return;}if(!file||transcribing||busy)return;const job=++captionJob.current;setTranscribing(true);setCaptionStatus('Preparing transcription…');try{const items=await transcribeEnglish(file,status=>{if(job===captionJob.current)setCaptionStatus(status)});if(job!==captionJob.current)return;setCaptions(items);setCaptionsOn(true);setCaptionStatus('Generated '+items.length+' captions. Review and correct the text before exporting.')}catch(error){if(job===captionJob.current)setCaptionStatus('Captions failed: '+error.message)}finally{if(job===captionJob.current)setTranscribing(false)}}
async function captionHighlight(clip){
 if(!file||!url||transcribing||busy)return;
 const job=++captionJob.current;setTranscribing(true);
 setCaptionStatus('Recording highlight '+fmt(clip.start)+'–'+fmt(clip.end)+'…');
 try{
  const audioClip=await captureHighlightAudio(url,clip.start,clip.end,status=>{if(job===captionJob.current)setCaptionStatus(status)});
  if(job!==captionJob.current)return;
  const result=await transcribeEnglish(audioClip,status=>{if(job===captionJob.current)setCaptionStatus(status)});
  if(job!==captionJob.current)return;
  const timed=result.map(c=>({start:clip.start+c.start,end:Math.min(clip.end,clip.start+c.end),text:c.text})).filter(c=>c.end>c.start);
  setCaptionsByHighlight(prev=>({...prev,[clip.id]:timed}));
  setCaptionsOn(true);selectHighlight(clip,false);
  setCaptionStatus('Generated '+timed.length+' subtitles for this highlight only. Review below.');
 }catch(error){if(job===captionJob.current)setCaptionStatus('Captions failed for this highlight: '+error.message)}
 finally{if(job===captionJob.current)setTranscribing(false)}
}
function editActiveCaptions(updater){
 if(activeHighlightId)setCaptionsByHighlight(prev=>({...prev,[activeHighlightId]:updater(prev[activeHighlightId]||[])}));
 else setCaptions(updater);
}
function updateCaption(i,field,value){editActiveCaptions(items=>items.map((c,j)=>j===i?{...c,[field]:field==='text'?value:Number(value)}:c));}
function downloadSrt(){const content=toSrt(activeCaptions);const link=document.createElement('a'),objectUrl=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));link.href=objectUrl;link.download=(file?.name.replace(/\.[^.]+$/,'')||'captions')+(activeHighlight?' - '+activeHighlight.id:'')+'.srt';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),15000)}
async function generateHighlights(){
 if(!duration||!url||visualScanning)return;
 let samples=visualSamples;
 if(!captions.length&&!waveform.length&&!samples.length){
   setVisualScanning(true);
   const job=++visualJob.current;
   setHighlightStatus('Audio analysis unavailable. Scanning selected frames from the video instead…');
   try{
     samples=await scanVideoActivity(url,duration,status=>{if(visualJob.current===job)setHighlightStatus(status)});
     if(visualJob.current!==job)return;
     setVisualSamples(samples);
   }catch(error){
     if(visualJob.current===job)setHighlightStatus('Visual fallback failed: '+error.message);
     return;
   }finally{if(visualJob.current===job)setVisualScanning(false)}
 }
 const candidates=suggestHighlights({duration,captions,waveform,visualSamples:samples,count:highlightCount,clipLength:highlightLength});
 setHighlights(candidates);setActiveHighlightId(null);
 const mode=captions.length?'captions and audio activity':waveform.length?'audio activity':'sampled visual changes';
 setHighlightStatus(candidates.length?'Suggested '+candidates.length+' clip(s) using '+mode+'. These are estimates: preview before export.':'No highlight candidates found.');
}
function selectHighlight(item,autoPlay=false){
 if(!item||!video.current)return;
 const el=video.current;el.pause();
 if(pendingPreviewRef.current){el.removeEventListener('seeked',pendingPreviewRef.current);pendingPreviewRef.current=null;}
 setActiveHighlightId(item.id);setStart(item.start);setEnd(item.end);
 setReview(false);setCutSilence(false);manualRef.current=[];setManualCuts([]);
 setCutIn(item.start);setCutOut(item.end);setCurrent(item.start);
 if(autoPlay){
   const go=()=>{if(pendingPreviewRef.current!==go)return;pendingPreviewRef.current=null;el.removeEventListener('seeked',go);el.play().catch(()=>setMessage('Press Play to preview this highlight.'));};
   pendingPreviewRef.current=go;
   el.addEventListener('seeked',go,{once:true});
   requestAnimationFrame(()=>{if(Math.abs(el.currentTime-item.start)<0.08&&el.readyState>=3)go();});
 }
 el.currentTime=item.start;
 setMessage('Selected '+fmt(item.start)+'–'+fmt(item.end)+'. This clip has independent captions and export boundaries.');
}
function useHighlight(item){selectHighlight(item,false);timelineRef.current?.scrollIntoView({behavior:'smooth',block:'center'});}
function previewHighlight(item){selectHighlight(item,true);viewerRef.current?.scrollIntoView({behavior:'smooth',block:'center'});}
function seek(time){if(video.current){video.current.currentTime=time;setCurrent(time)}if(musicPreviewRef.current&&musicDuration>0){try{musicPreviewRef.current.currentTime=soundtrackTime(time,musicDuration)}catch{}}}
function addSceneSplit(){
 if(!duration){setMessage('Import a video before splitting scenes.');return}
 const next=splitAt(sceneMarkers,current,duration);
 if(!next){setMessage('Move the playhead inside a scene to split it. Maximum 12 scenes.');return}
 setSceneMarkers(next);setTimelineView('scenes');setMessage('Scene split added at '+fmt(current)+'. Click a scene to trim or export it.');
}
function selectScene(scene){
 video.current?.pause();setActiveHighlightId(null);setReview(false);setStart(scene.start);setEnd(scene.end);seek(scene.start);setSelectedLayer('video');
}
function addTitle(preset='heading'){
 const presets={heading:{text:'Your headline',size:7.2,y:23,color:'#ffffff',background:true},subtitle:{text:'Your subtitle',size:4.3,y:70,color:'#ffffff',background:true},minimal:{text:'A simple title',size:5,y:50,color:'#ffffff',background:false}};
 const p=presets[preset]||presets.heading;
 setTitleLayer({...p,x:50,preset});setSelectedLayer('text');setEditorTool('text');
}
function addSticker(symbol){
 setStickerLayer({symbol,x:78,y:24,size:12});setSelectedLayer('sticker');setEditorTool('elements');
}
function loadSoundtrack(f){
 if(!f)return;
 if(!(f.type.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|aac)$/i.test(f.name))){setMessage('Choose an audio file such as MP3 or WAV.');return}
 musicPreviewRef.current?.pause();
 if(musicUrlRef.current)URL.revokeObjectURL(musicUrlRef.current);
 const next=URL.createObjectURL(f);musicUrlRef.current=next;setMusicFile(f);setMusicUrl(next);setMusicDuration(0);setMusicEnabled(true);setMusicWaveform([]);setSelectedLayer('music');setMessage('Music added. Adjust its level in the Music panel and preview the result.');
}
function removeSoundtrack(){
 musicPreviewRef.current?.pause();if(musicUrlRef.current)URL.revokeObjectURL(musicUrlRef.current);
 musicUrlRef.current='';setMusicUrl('');setMusicFile(null);setMusicDuration(0);setMusicWaveform([]);setSelectedLayer('video');
}

function toggle(){if(!video.current)return;if(video.current.paused){const segs=review?ranges():[[start,end]];if(!segs.length){setMessage('No footage remains after cuts. Restore a section.');return;}const t=video.current.currentTime;const segment=segs.find(([a,b])=>t>=a&&t<b);if(!segment)seek(segs.find(([a])=>a>=t)?.[0]??segs[0][0]);video.current.play().catch(()=>{});}else video.current.pause()}
const [w,h]=dimensions;const ar=ratios[ratio]||w/h;
const cropPosition=focusMode?focusX:50;
// Width is calculated from BOTH available stage dimensions, so the program frame
// always has the true output aspect ratio, including on narrow laptop screens.
const previewWidth=stageSize.width&&stageSize.height?Math.max(80,Math.min(stageSize.width-28,(stageSize.height-28)*ar)):(ar<1?240:520);
const graphicsEnabled=motionGraphics!=='off';
async function exportVideo(){
if(!file||busy)return;if(end<=start){setMessage('End time must be after start time.');return}
if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){setMessage('Browser export unsupported. Try a current desktop Chrome browser.');return}
setBusy(true);setProgress(0);cancelRef.current=false;let ctx=null,source=null,stream=null,recorder=null,exportVideoEl=null,audioEl=null,musicEl=null;
try{
 const canvas=document.createElement('canvas');const size=outputCanvasSize(w,h,ar);canvas.width=size.width;canvas.height=size.height;
 const c=canvas.getContext('2d',{alpha:false});if(!c)throw new Error('Canvas unavailable');
 exportVideoEl=document.createElement('video');exportVideoEl.src=url;exportVideoEl.preload='auto';exportVideoEl.playsInline=true;exportVideoEl.muted=true;exportVideoEl.crossOrigin='anonymous';
 await new Promise((resolve,reject)=>{exportVideoEl.onloadedmetadata=resolve;exportVideoEl.onerror=()=>reject(new Error('Could not decode this video'));exportVideoEl.load()});
 // Use a separate media element for audio, routed into a recording stream.
 audioEl=document.createElement('video');audioEl.src=url;audioEl.preload='auto';audioEl.playsInline=true;audioEl.muted=false;
 await new Promise((resolve,reject)=>{audioEl.onloadedmetadata=resolve;audioEl.onerror=()=>reject(new Error('Could not decode audio'));audioEl.load()});
 ctx=new (window.AudioContext||window.webkitAudioContext)();source=ctx.createMediaElementSource(audioEl);const dest=ctx.createMediaStreamDestination();
 const mainGain=ctx.createGain();mainGain.gain.value=muted?0:1;source.connect(mainGain).connect(dest);
 // A user-supplied soundtrack is mixed locally into the exported recording.
 if(musicUrl&&musicEnabled&&musicVolume>0){
   musicEl=document.createElement('audio');musicEl.src=musicUrl;musicEl.preload='auto';musicEl.loop=true;
   await new Promise((resolve,reject)=>{musicEl.onloadedmetadata=resolve;musicEl.onerror=()=>reject(new Error('Could not decode your music file'));musicEl.load()});
   const musicGain=ctx.createGain();musicGain.gain.value=musicVolume/100;
   ctx.createMediaElementSource(musicEl).connect(musicGain).connect(dest);
 }
 // Never route export audio to speakers.
 await Promise.all([new Promise(r=>{exportVideoEl.onseeked=r;exportVideoEl.currentTime=start}),new Promise(r=>{audioEl.onseeked=r;audioEl.currentTime=start})]);
 const segments=ranges();
 if(!segments.length)throw new Error('All selected footage is silent. Disable silence cutting to export.');
 const draw=()=>{const vw=exportVideoEl.videoWidth,vh=exportVideoEl.videoHeight;const crop=sourceCropRect(vw,vh,canvas.width,canvas.height,cropPosition);
 c.filter=`brightness(${videoFilter.brightness}%) contrast(${videoFilter.contrast}%) saturate(${videoFilter.saturate}%)`;
 c.drawImage(exportVideoEl,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);c.filter='none';
 if(graphicsEnabled&&activeHighlight){
   const elapsed=Math.max(0,exportVideoEl.currentTime-start);
   const length=Math.max(.1,end-start);
   const reveal=Math.min(1,elapsed/.5);
   c.save();c.globalAlpha=reveal;
   const fs=Math.max(13,Math.round(canvas.width*.035));
   c.font='800 '+fs+'px sans-serif';c.textAlign='left';c.textBaseline='middle';
   const title=shortsTitle.trim().slice(0,32)||'HIGHLIGHT';
   const tw=Math.min(canvas.width*.8,c.measureText(title).width+fs);
   c.fillStyle='rgba(12,14,24,.78)';c.fillRect(canvas.width*.06,canvas.height*.065,tw,fs*1.8);
   c.fillStyle='#ffffff';c.fillText(title,canvas.width*.06+fs*.4,canvas.height*.065+fs*.9,tw-fs*.6);
   c.fillStyle='#9577ff';c.fillRect(0,canvas.height-7,canvas.width*Math.min(1,elapsed/length),7);
   c.restore();
 }
 drawEditorTitle(c,canvas,titleLayer);drawEditorSticker(c,canvas,stickerLayer);
 if(captionsOn&&activeCaptions.length){const moment=exportVideoEl.currentTime;const caption=activeCaptions.find(item=>moment>=item.start&&moment<item.end);if(caption?.text){const fontsize=Math.max(16,Math.round(canvas.height*.042));c.font='700 '+fontsize+'px sans-serif';c.textAlign='center';c.textBaseline='middle';const maxWidth=canvas.width*.85;const words=caption.text.split(/\s+/);const lines=[];let line='';for(const word of words){const trial=line?line+' '+word:word;if(c.measureText(trial).width>maxWidth&&line){lines.push(line);line=word}else line=trial;}if(line)lines.push(line);const shown=lines.slice(0,3);const lh=fontsize*1.3;const top=canvas.height*.83-(shown.length-1)*lh/2;c.lineWidth=Math.max(3,fontsize*.22);c.strokeStyle='rgba(0,0,0,.9)';c.fillStyle='#ffffff';shown.forEach((text,i)=>{const y=top+i*lh;c.strokeText(text,canvas.width/2,y,maxWidth);c.fillText(text,canvas.width/2,y,maxWidth)})}}
 };
 draw();stream=canvas.captureStream(30);if(!muted||(musicEl&&musicEnabled))for(const t of dest.stream.getAudioTracks())stream.addTrack(t);
 const types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];const mime=types.find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('No supported WebM recorder');
 const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
 const finished=new Promise((resolve,reject)=>{recorder.onerror=()=>reject(new Error('Recording failed'));recorder.onstop=resolve});recorder.start(500);await ctx.resume();
 const total=segments.reduce((sum,[a,b])=>sum+b-a,0);let completed=0;
 for(const [a,b] of segments){
  if(cancelRef.current)break;
  await Promise.all([new Promise(r=>{exportVideoEl.onseeked=r;exportVideoEl.currentTime=a}),new Promise(r=>{audioEl.onseeked=r;audioEl.currentTime=a})]);
  if(musicEl){musicEl.currentTime=soundtrackTime(completed,musicEl.duration||0)}
  await Promise.all([exportVideoEl.play(),audioEl.play(),...(musicEl?[musicEl.play()]:[])]);
  await new Promise(resolve=>{const tick=()=>{if(cancelRef.current||exportVideoEl.currentTime>=b||exportVideoEl.ended){resolve();return}draw();setProgress(Math.min(99,Math.round((completed+Math.max(0,exportVideoEl.currentTime-a))/total*100)));requestAnimationFrame(tick)};requestAnimationFrame(tick)});
  exportVideoEl.pause();audioEl.pause();musicEl?.pause();completed+=b-a;
 }
 exportVideoEl.pause();audioEl.pause();musicEl?.pause();recorder.stop();await finished;
 if(!cancelRef.current){const blob=new Blob(chunks,{type:'video/webm'});const output=URL.createObjectURL(blob);const a=document.createElement('a');a.href=output;a.download=(file.name.replace(/\.[^.]+$/,'')||'edited')+'-edited.webm';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(output),60000);setMessage('Export complete! Saved as WebM. Export uses real-time recording, so it takes approximately the clip duration.');setProgress(100)}else setMessage('Export canceled.');
 audioEl.src='';if(musicEl)musicEl.src='';
}catch(e){setMessage('Export failed: '+e.message+' — Try a shorter H.264 MP4 in desktop Chrome.')}finally{if(exportVideoEl){exportVideoEl.pause();exportVideoEl.removeAttribute('src');exportVideoEl.load()}musicEl?.pause();if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());if(ctx)await ctx.close().catch(()=>{});setBusy(false)}
}
return <div className="app editor-app">
<header className="editor-topbar invideo-topbar">
  <div className="logo"><span className="logoicon"><WandSparkles size={19}/></span><strong>AutoEdit</strong><span className="version">STUDIO 3.0</span></div>
  <div className="project-title"><span>Project</span><input aria-label="Project name" maxLength={65} value={projectName} onChange={e=>setProjectName(e.target.value)}/><span className="session-label">Local edit session</span></div>
  <div className="editor-actions"><div className="toolbar-divider"/><button type="button" className="ratio-quick" onClick={()=>setEditorTool('effects')}><Monitor size={15}/> {ratio}<ChevronDown size={13}/></button><a href="https://github.com/braie-aep/Autoedits" target="_blank" rel="noreferrer">GitHub</a><button type="button" className="top-export" onClick={()=>setEditorTool('export')}><Download size={15}/> Export</button></div>
</header>
<main ref={workspaceRef} className="editor-workspace invideo-workspace workspace-lock" style={{'--library-width':libraryWidth+'px','--properties-width':propertiesWidth+'px'}}>
<nav className="tool-rail" aria-label="Editor tools">
  <button type="button" className={editorTool==='media'?'active':''} aria-pressed={editorTool==='media'} onClick={()=>setEditorTool('media')}><FolderOpen size={19}/><span>Media</span></button>
  <button type="button" className={editorTool==='text'?'active':''} aria-pressed={editorTool==='text'} onClick={()=>setEditorTool('text')}><Type size={20}/><span>Text</span></button>
  <button type="button" className={editorTool==='music'?'active':''} aria-pressed={editorTool==='music'} onClick={()=>setEditorTool('music')}><Music2 size={19}/><span>Music</span></button>
  <button type="button" className={editorTool==='elements'?'active':''} aria-pressed={editorTool==='elements'} onClick={()=>setEditorTool('elements')}><Shapes size={19}/><span>Elements</span></button>
  <button type="button" className={editorTool==='captions'?'active':''} aria-pressed={editorTool==='captions'} onClick={()=>setEditorTool('captions')}><Clapperboard size={19}/><span>Captions</span></button>
  <div className="rail-rule"/>
  <button type="button" className={editorTool==='shorts'?'active':''} aria-pressed={editorTool==='shorts'} onClick={()=>setEditorTool('shorts')}><Smartphone size={19}/><span>Shorts</span></button>
  <button type="button" className={editorTool==='ai'?'active':''} aria-pressed={editorTool==='ai'} onClick={()=>setEditorTool('ai')}><WandSparkles size={19}/><span>AI Edit</span></button>
  <button type="button" className={editorTool==='effects'?'active':''} aria-pressed={editorTool==='effects'} onClick={()=>{setEditorTool('effects');setSelectedLayer('video')}}><Monitor size={19}/><span>Canvas</span></button>
</nav>
<aside className="tool-inspector"><div className="inspector-heading"><strong>{{media:'Your media',text:'Add text',music:'Music & audio',elements:'Stickers & elements',ai:'AI editor',shorts:'Auto Shorts',captions:'Subtitles',effects:'Resize & crop',export:'Export video'}[editorTool]}</strong><small>Library</small></div>
{editorTool==='media'&&<><section className="panel youtube-source"><div className="panelhead"><span><Film size={17}/> YouTube to Shorts Automation</span><span className="tag">LINK WORKFLOW</span></div><div className="youtube-body"><p>Paste the link of a video you own or have permission to edit. With a connected private import server, AutoEdit will retrieve the footage and automatically suggest multiple 9:16 Shorts with optional captions and basic graphics.</p><div className="youtube-input"><input aria-label="YouTube video URL" placeholder="https://www.youtube.com/watch?v=…" value={youtubeInput} onChange={e=>setYoutubeInput(e.target.value)}/><button disabled={linkWorking||shortsBuilding} onClick={generateShortsFromLink}>{linkWorking?'Retrieving…':shortsBuilding?'Creating Shorts…':'Generate Shorts'}</button></div><label className="link-consent"><input type="checkbox" checked={linkAuthorized} onChange={e=>setLinkAuthorized(e.target.checked)}/> I own this video or have permission to download and edit it</label>{linkStep&&<p className="studio-progress" role="status">{linkStep}</p>}{highlights.length>0&&<div className="link-results"><strong>{highlights.length} Shorts suggested</strong><span>{Object.values(captionsByHighlight).filter(x=>x?.length).length} captioned · 9:16 portrait · review each clip in Highlight Finder below</span><button onClick={()=>{setEditorTool('shorts');requestAnimationFrame(()=>document.querySelector('.highlights-panel')?.scrollIntoView({behavior:'smooth'}));}}>View clip results</button></div>}<button className="server-toggle" onClick={()=>setAdvancedImport(v=>!v)}>{advancedImport?'Hide server settings':(importApiUrl?'Private access key / server settings':'Connect the import server')}</button>{advancedImport&&<div className="import-settings"><label>Private importer HTTPS address<input value={importApiUrl} placeholder="https://your-importer.example.com" onChange={e=>setImportApiUrl(e.target.value)} /></label><label>Private importer access key<input type="password" autoComplete="off" value={importApiKey} onChange={e=>setImportApiKey(e.target.value)} placeholder="Access key" /></label><small>The server is not hosted by GitHub Pages. For a private owner-operated deployment only; do not distribute an API key to public users. This key stays in the current page memory and is not saved.</small></div>}<p className="youtube-disclaimer">Video download works only when the separately hosted importer can access an authorized source. YouTube availability and platform restrictions apply. Highlight scores are activity-based estimates, not YouTube audience metrics. The import server is linked to this GitHub Pages editor but requires a private owner access key.</p></div></section><section className="panel project-media"><div className="panelhead"><span><Upload size={17}/> Project media</span></div><label className="project-import"><Upload size={18}/> Import a local video<input type="file" accept="video/*" onChange={e=>load(e.target.files?.[0])}/></label>{file&&<div className="project-file"><Film size={16}/><span>{file.name}<br/>{fmt(duration)} · {dimensions.join('×')}</span></div>}</section></>}

{editorTool==='text'&&<section className="library-content"><p className="library-intro">Click a text style to place it on your video. Select the text on your canvas to change its appearance.</p>
  <div className="title-preset-list">
    <button type="button" className="title-preset preset-heading" onClick={()=>addTitle('heading')}><span>Aa</span><strong>Add a heading</strong><small>Bold title</small><Plus size={17}/></button>
    <button type="button" className="title-preset preset-subtitle" onClick={()=>addTitle('subtitle')}><span>Subtitle</span><strong>Add a subtitle</strong><small>Lower third</small><Plus size={17}/></button>
    <button type="button" className="title-preset preset-minimal" onClick={()=>addTitle('minimal')}><span>Your text</span><strong>Simple text</strong><small>Clean & minimal</small><Plus size={17}/></button>
  </div>
  {titleLayer&&<div className="library-edit"><label>Text content<textarea rows={3} maxLength={180} value={titleLayer.text} onChange={e=>setTitleLayer(t=>({...t,text:e.target.value}))}/></label><button type="button" className="secondary-action" onClick={()=>setSelectedLayer('text')}>Edit text properties</button><button type="button" className="remove-action" onClick={()=>{setTitleLayer(null);setSelectedLayer('video')}}>Remove text layer</button></div>}
</section>}
{editorTool==='music'&&<section className="library-content"><p className="library-intro">Add a soundtrack from your computer. AutoEdit mixes it with your video's audio during export. No paid music or API.</p>
  <label className="library-upload"><Music2 size={19}/><strong>Upload music or audio</strong><small>MP3 · WAV · M4A · OGG</small><input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" onChange={e=>loadSoundtrack(e.target.files?.[0])}/></label>
  {musicFile?<div className="soundtrack-item"><Music2 size={22}/><div><strong>{musicFile.name}</strong><small>{musicDuration?fmt(musicDuration):'Reading audio…'}</small></div><button type="button" onClick={removeSoundtrack} aria-label="Remove soundtrack">×</button></div>:<p className="empty-library">Your soundtrack will appear here and in the audio timeline.</p>}
  {musicFile&&<div className="library-edit"><label>Music volume · {musicVolume}%<input type="range" min="0" max="100" value={musicVolume} onChange={e=>setMusicVolume(Number(e.target.value))}/></label><label className="inline-switch"><input type="checkbox" checked={musicEnabled} onChange={e=>setMusicEnabled(e.target.checked)}/> Enable music track</label></div>}
</section>}
{editorTool==='elements'&&<section className="library-content"><p className="library-intro">Add simple elements to your canvas. Select an element to position or resize it.</p>
  <div className="sticker-grid">{['✨','⭐','❤️','🔥','🎉','✅','💬','🎬','🚀','⚡','😊','👀'].map(symbol=><button type="button" key={symbol} aria-label={'Add '+symbol+' element'} onClick={()=>addSticker(symbol)}>{symbol}</button>)}</div>
  {stickerLayer&&<div className="library-edit"><span className="selected-element">Selected element: {stickerLayer.symbol}</span><button type="button" className="remove-action" onClick={()=>{setStickerLayer(null);setSelectedLayer('video')}}>Remove element</button></div>}
</section>}
{editorTool==='ai'&&<section className="panel prompt"><div className="panelhead"><span><WandSparkles size={17}/> Prompt editor</span><span className="tag">RULE-BASED MVP</span></div><label className="label">What should we do with your video?</label><textarea rows="5" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Make it vertical 9:16, keep the first 15 seconds, and mute audio"/><button className="primary" disabled={!duration||busy||analyzing} onClick={apply}><WandSparkles size={17}/>{analyzing?"Detecting silence…":"Apply prompt"}</button><button className="prompt-silence" disabled={!duration||busy||analyzing} onClick={analyzeSilence}>✂ Remove all detected silence</button><div className="hint">Try: “Find highlights”, “Remove silence”, “Cut from 10 to 15 seconds”, or “Make it 9:16”. Removed sections are reviewable before export.</div>{message&&<div className="status" role="status">{message}</div>}</section>}
{editorTool==='shorts'&&<><section className="panel shorts-panel"><div className="panelhead"><span><Smartphone size={17}/> Shorts Automation Studio</span><span className="tag">BETA</span></div><div className="shorts-body"><p>Upload a video to automatically prepare portrait highlights with optional English captions and a simple animated graphics template. Keep each clip separate for review and export.</p><label className="studio-upload"><Upload size={16}/> Choose video for automation<input type="file" accept="video/*" onChange={e=>load(e.target.files?.[0])}/></label>{file&&<div className="studio-source">Source: {file.name}</div>}<label className="mute"><input type="checkbox" checked={autoCaptionShorts} disabled={shortsBuilding} onChange={e=>setAutoCaptionShorts(e.target.checked)}/> Automatically caption each highlight (English; runs locally, may be slow)</label><button className="primary" disabled={!duration||shortsBuilding||visualScanning||busy||transcribing} onClick={createShorts}>{shortsBuilding?'Processing Shorts…':'Create portrait highlights + graphics'}</button>{shortsProgress&&<div className="studio-progress" role="status">{shortsProgress}</div>}<div className="studio-divider"/> <label className="studio-field">Motion graphics preset<select value={motionGraphics} onChange={e=>setMotionGraphics(e.target.value)}><option value="dynamic">Title + animated progress strip</option><option value="off">No motion graphics</option></select></label><label className="studio-field">Title text<input maxLength={32} value={shortsTitle} onChange={e=>setShortsTitle(e.target.value)} placeholder="BEST MOMENTS"/></label><label className="mute"><input type="checkbox" checked={focusMode} onChange={e=>setFocusMode(e.target.checked)}/> Focus framing (manual horizontal position)</label><label className="focus-label">Subject position: {focusX}% <input aria-label="Focus horizontal position" type="range" min="0" max="100" step="1" value={focusX} disabled={!focusMode} onChange={e=>setFocusX(Number(e.target.value))}/></label><small>Highlights use activity estimates, not audience engagement analytics. The graphics preset is a simple title and progress animation, not AI-generated motion design. Face tracking and automatic multi-clip export are not implemented.</small></div></section><section className="panel highlights-panel"><div className="panelhead"><span><Scissors size={17}/> Highlight finder</span><span className="tag">BETA</span></div><div className="highlight-body"><p>Suggest clips using caption keywords or audio activity. If audio cannot be analyzed, AutoEdit samples video frames for visual changes—even in long videos. This does not understand the story or dialogue.</p><div className="highlight-options"><label>Clip length (seconds)<select value={highlightLength} onChange={e=>setHighlightLength(Number(e.target.value))}><option value={15}>15</option><option value={30}>30</option><option value={45}>45</option><option value={60}>60</option></select></label><label>Suggestions<select value={highlightCount} onChange={e=>setHighlightCount(Number(e.target.value))}><option value={2}>2</option><option value={4}>4</option><option value={6}>6</option></select></label></div><button className="primary highlight-action" disabled={!duration||busy||visualScanning} onClick={generateHighlights}>{visualScanning?'Scanning video frames…':'Find highlights'}</button>{highlightStatus&&<div className="highlight-status" role="status">{highlightStatus}</div>}{highlights.length>0&&<><div className="highlight-result-count" role="status">{highlights.length} highlight{highlights.length===1?'':'s'} suggested · {Object.values(captionsByHighlight).filter(arr=>arr?.length>0).length} captioned</div><div className="highlight-results">{highlights.map((clip,i)=><div className={'highlight-result'+(clip.id===activeHighlightId?' active':'')} key={clip.id}><div><strong>Highlight {i+1}{clip.id===activeHighlightId?' · Selected':''}</strong><span>{fmt(clip.start)}–{fmt(clip.end)}</span></div><p>{clip.reason}{clip.excerpt?' · “'+clip.excerpt+'”':''}</p><div className="highlight-actions"><button onClick={()=>previewHighlight(clip)}>Play this clip</button><button onClick={()=>useHighlight(clip)}>Use highlight</button><button disabled={transcribing||busy||visualScanning} onClick={()=>captionHighlight(clip)}>{transcribing?'Working…':(captionsByHighlight[clip.id]?.length?'Regenerate captions ✓':'Caption this clip')}</button></div></div>)}</div></>}<small>Each highlight is independent. Play this clip previews its own range. Caption this clip processes only that highlight, and its subtitles stay separate from other highlights.</small></div></section></>}
{editorTool==='captions'&&<section className="panel captions-panel"><div className="panelhead"><span><Film size={17}/> AI captions (English)</span><span className="meta">{activeClipLabel} · Free local model</span></div><div className="caption-body"><p>Generate subtitles from speech, edit the text, then burn them into your exported video. The first run downloads a speech model. Choose an individual highlight to caption it from a long video. Maximum 3 minutes per caption job; English only.</p><button className="primary caption-generate" disabled={!duration||transcribing||busy} onClick={generateCaptions}>{transcribing?'Transcribing…':(activeHighlight?'Generate captions for '+activeClipLabel:'Generate English captions')}</button>{captionStatus&&<div className="caption-status" role="status">{captionStatus}</div>}{activeCaptions.length>0&&<><label className="mute"><input type="checkbox" checked={captionsOn} onChange={e=>setCaptionsOn(e.target.checked)}/> Show captions in preview and export</label><button className="srt-download" onClick={downloadSrt}>Download SRT (original video timing)</button><div className="caption-list">{activeCaptions.map((c,i)=><div className="caption-item" key={i}><div className="caption-times"><label>Start <input aria-label={'Caption '+(i+1)+' start'} type="number" step=".1" min="0" max={c.end} value={Number(c.start.toFixed(2))} onChange={e=>updateCaption(i,'start',e.target.value)}/></label><label>End <input aria-label={'Caption '+(i+1)+' end'} type="number" step=".1" min={c.start} max={duration} value={Number(c.end.toFixed(2))} onChange={e=>updateCaption(i,'end',e.target.value)}/></label><button onClick={()=>seek(c.start)}>Play</button><button onClick={()=>editActiveCaptions(items=>items.filter((_,j)=>j!==i))}>Delete</button></div><textarea aria-label={'Caption '+(i+1)+' text'} rows={2} value={c.text} onChange={e=>updateCaption(i,'text',e.target.value)}/></div>)}</div></>}</div></section>}
{editorTool==='effects'&&<section className="panel effects-panel"><div className="panelhead"><span><WandSparkles size={17}/> Effects & framing</span></div><div className="effect-controls"><label>Sequence aspect ratio</label><div className="ratios">{Object.keys(ratios).map(r=><button key={r} disabled={!duration||busy} className={ratio===r?'active':''} onClick={()=>setRatio(r)}>{r}</button>)}</div><label>Horizontal crop focus · {focusX}%<input type="range" min="0" max="100" step="1" value={focusX} disabled={!duration||!focusMode} onChange={e=>setFocusX(Number(e.target.value))}/></label><label className="mute"><input type="checkbox" checked={focusMode} onChange={e=>setFocusMode(e.target.checked)}/> Enable manual focus framing</label><label>Motion graphics preset<select value={motionGraphics} onChange={e=>setMotionGraphics(e.target.value)}><option value="dynamic">Animated title + progress bar</option><option value="off">No graphics</option></select></label><label>Title text<input maxLength={32} value={shortsTitle} onChange={e=>setShortsTitle(e.target.value)}/></label><label className="mute"><input type="checkbox" checked={captionsOn} onChange={e=>setCaptionsOn(e.target.checked)}/> Show captions inside output frame</label><p>Program Monitor shows the actual sequence framing. For 9:16, a landscape source fills the portrait frame; move the horizontal focus slider to choose which part is visible. Captions and graphics stay inside this frame in preview and export.</p></div></section>}
{editorTool==='export'&&<><section className="panel settings"><div className="panelhead"><span><Monitor size={17}/> Output settings</span></div><div className="label">Aspect ratio</div><div className="ratios">{Object.keys(ratios).map(r=><button key={r} disabled={!duration||busy} className={ratio===r?'active':''} onClick={()=>setRatio(r)}>{r}</button>)}</div><div className="outputinfo"><span>Automatic silence detection</span><button disabled={!duration||busy||analyzing} onClick={analyzeSilence}>{analyzing?'Analyzing…':'Detect silence'}</button></div>{silences.length>0&&<label className="mute"><input type="checkbox" checked={cutSilence} onChange={e=>setCutSilence(e.target.checked)}/> Skip {silences.length} detected quiet sections during export</label>}<label className="mute"><input type="checkbox" checked={muted} disabled={!duration||busy} onChange={e=>setMuted(e.target.checked)}/> Mute exported audio</label><div className="outputinfo"><span>Output format</span><strong>WebM (up to 1280px)</strong></div><div className="outputinfo"><span>Export mode</span><strong>Real-time browser recording</strong></div><button className="primary export" disabled={!duration||busy} onClick={exportVideo}><Download size={17}/>{busy?`Exporting ${progress}%…`:'Export video'}</button>{busy&&<button className="cancel" onClick={()=>{cancelRef.current=true}}>Cancel export</button>}</section><div className="note"><AlertCircle size={17}/><p><b>Current limits:</b> One video at a time. Prompt commands support manual time-range cuts, aspect ratio, trim and mute. Experimental local silence cutting is available. English AI captions are experimental. Highlights, transitions and MP4 export are not yet available. Exports use the browser and may be slow for long footage.</p></div></>}
</aside>
<div className="workspace-column-handle" role="separator" aria-label="Resize media library" aria-orientation="vertical" tabIndex={0} onPointerDown={e=>startWorkspaceResize(e,'library')} onPointerMove={moveWorkspaceResize} onPointerUp={endWorkspaceResize} onPointerCancel={endWorkspaceResize} onKeyDown={e=>resizeWithKeyboard(e,'library')} title="Drag left or right to resize the tools panel"><span/></div>
<section ref={centerRef} className="editor-center resizable-editor-center" style={{'--preview-share':previewShare+'fr','--timeline-share':(100-previewShare)+'fr'}}><div className="monitor-strip"><strong><i className="monitor-dot"/> Canvas preview</strong><div className="monitor-ratios"><button type="button" className={ratio==='16:9'?'active':''} onClick={()=>setRatio('16:9')}>16:9</button><button type="button" className={ratio==='9:16'?'active':''} onClick={()=>setRatio('9:16')}>9:16</button><button type="button" className={ratio==='1:1'?'active':''} onClick={()=>setRatio('1:1')}>1:1</button></div><span>{fmt(current)} / {fmt(duration)}</span></div><section className="panel viewer" ref={viewerRef}><div className="panelhead"><span><Film size={17}/> Preview</span><span className="meta">{file?file.name:'No video loaded'}</span></div>{url?<div className="stage" ref={stageRef}><div className="program-frame" style={{width:previewWidth+"px",aspectRatio:String(ar)}}><video className="program-video" ref={video} src={url} playsInline muted={muted} onLoadedMetadata={metadata} onTimeUpdate={e=>{const t=e.currentTarget.currentTime;setCurrent(t);const music=musicPreviewRef.current;if(music&&musicDuration>0&&!music.paused&&Math.abs(music.currentTime-soundtrackTime(t,musicDuration))>.7){music.currentTime=soundtrackTime(t,musicDuration)}if(!e.currentTarget.paused&&review){const segs=ranges();const active=segs.find(([a,b])=>t>=a&&t<b);if(!active){const next=segs.find(([a])=>a>=t-0.08);if(next){e.currentTarget.currentTime=next[0];return;}e.currentTarget.pause();setPlaying(false);return;}if(t>=active[1]-0.06){const next=segs.find(([a])=>a>=active[1]-0.01);if(next){e.currentTarget.currentTime=next[0];return;}}}if(!e.currentTarget.paused&&t>=end&&end>0){e.currentTarget.pause();setPlaying(false)}}} onPlay={()=>{setPlaying(true);const m=musicPreviewRef.current;if(m&&musicEnabled){if(musicDuration>0)m.currentTime=soundtrackTime(video.current?.currentTime||0,musicDuration);m.play().catch(()=>{})}}} onPause={()=>{setPlaying(false);musicPreviewRef.current?.pause()}} onClick={()=>setSelectedLayer('video')} style={{objectPosition:cropPosition+'% center',filter:`brightness(${videoFilter.brightness}%) contrast(${videoFilter.contrast}%) saturate(${videoFilter.saturate}%)`}}/>{titleLayer&&<div className="studio-text-layer" role="button" tabIndex={0} aria-label="Select text overlay" onClick={e=>{e.stopPropagation();setSelectedLayer('text')}} onKeyDown={e=>{if(e.key==='Enter'){setSelectedLayer('text');setEditorTool('text')}}} style={{left:titleLayer.x+'%',top:titleLayer.y+'%',color:titleLayer.color,background:titleLayer.background?'rgba(13,18,29,.72)':'transparent',fontSize:Math.max(12,Math.round(previewWidth*titleLayer.size/100))+'px'}}>{titleLayer.text}</div>}{stickerLayer&&<div className="studio-sticker-layer" role="button" tabIndex={0} aria-label="Select sticker" onClick={e=>{e.stopPropagation();setSelectedLayer('sticker')}} onKeyDown={e=>{if(e.key==='Enter'){setSelectedLayer('sticker');setEditorTool('elements')}}} style={{left:stickerLayer.x+'%',top:stickerLayer.y+'%',fontSize:Math.max(17,Math.round(previewWidth*stickerLayer.size/100))+'px'}}>{stickerLayer.symbol}</div>}{graphicsEnabled&&activeHighlight&&<div className="shorts-graphics-overlay"><span>{shortsTitle||'BEST MOMENTS'}</span><i style={{width:Math.min(100,Math.max(0,(current-start)/Math.max(.1,end-start)*100))+'%'}}/></div>}{captionsOn&&activeCaptions.length>0&&<div className="caption-overlay">{activeCaptions.find(item=>current>=item.start&&current<item.end)?.text||""}</div>}</div></div>:<label className="drop"><Upload size={36}/><strong>Drop in your footage</strong><span>Or click to choose a video from your device</span><small>MP4 / WebM / MOV (browser codec support varies)</small><input type="file" accept="video/*" onChange={e=>load(e.target.files?.[0])}/></label>}<div className="controls"><button disabled={!url} onClick={toggle}>{playing?<Pause size={17}/>:<Play size={17}/>}</button><span>{fmt(current)} / {fmt(duration)}</span><input aria-label="Playhead" type="range" min="0" max={duration||1} step="0.1" value={current} disabled={!duration} onChange={e=>seek(Number(e.target.value))}/><label className="replace">Replace video<input type="file" accept="video/*" onChange={e=>load(e.target.files?.[0])}/></label></div></section><div className="workspace-row-handle" role="separator" tabIndex={0} aria-label="Resize preview and timeline" aria-orientation="horizontal" aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(previewShare)} onPointerDown={e=>startWorkspaceResize(e,'horizontal')} onPointerMove={moveWorkspaceResize} onPointerUp={endWorkspaceResize} onPointerCancel={endWorkspaceResize} onKeyDown={e=>resizeWithKeyboard(e,'horizontal')} title="Drag up or down to resize preview and timeline"><span/></div><section className={"panel timeline "+(timelineView==="scenes"?"scenes-mode":"layers-mode")} ref={timelineRef}><div className="panelhead"><span><Clapperboard size={17}/> Your video timeline</span><div className="timeline-toolbar"><button type="button" title="Zoom out timeline" disabled={timelineZoom<=1} onClick={()=>setTimelineZoom(z=>Math.max(1,z/2))}>−</button><span>{timelineZoom}×</span><button type="button" title="Zoom in timeline" disabled={timelineZoom>=16} onClick={()=>{setTimelineView('layers');setTimelineZoom(z=>Math.min(16,z*2))}}>+</button><span>{fmt(Math.max(0,end-start))} selected</span></div></div><div className="studio-timeline-toolbar"><div className="view-tabs"><button type="button" className={timelineView==='scenes'?'active':''} onClick={()=>setTimelineView('scenes')}><Clapperboard size={14}/> Scenes</button><button type="button" className={timelineView==='layers'?'active':''} onClick={()=>setTimelineView('layers')}><Layers3 size={14}/> Layers</button></div><div className="scene-edit-actions"><button type="button" disabled={!duration} title="Create a scene boundary at the playhead" onClick={addSceneSplit}><Scissors size={14}/> Split scene</button><button type="button" disabled={!sceneMarkers.length} title="Remove scene splits" onClick={()=>{setSceneMarkers([]);setStart(0);setEnd(duration);seek(0);setMessage('Scene splits cleared.')}}><RotateCcw size={14}/> Reset</button></div></div>
{timelineView==='scenes'&&<div className="scene-storyboard"><div className="scene-row">{scenes.length?scenes.map((scene,i)=><button type="button" key={scene.id} className={'scene-card'+((start===scene.start&&end===scene.end)?' selected':'')} onClick={()=>selectScene(scene)} title={'Select scene '+(i+1)}>
 <div className="scene-thumb" style={sceneThumbs[scene.id]?{backgroundImage:`url(${sceneThumbs[scene.id]})`}:{}}>{!sceneThumbs[scene.id]&&<Film size={22}/>}<span className="scene-number">Scene {i+1}</span></div>
 <div className="scene-description"><strong>Scene {String(i+1).padStart(2,'0')}</strong><small>{fmt(scene.end-scene.start)}</small></div>
 </button>):<div className="storyboard-placeholder"><Film size={23}/><span>Import a video to create scenes</span></div>}
 {duration>0&&<button type="button" className="storyboard-split" onClick={addSceneSplit} title="Split at current playhead"><Plus size={20}/><span>Split</span></button>}
 </div>
 <div className="storyboard-audio">{musicFile&&musicEnabled?<><Music2 size={15}/><span>{musicFile.name}</span><div className="audio-ribbon" style={{opacity:Math.max(.2,musicVolume/100)}}/></>:<><Volume2 size={15}/><span>{file?'Original audio':'Audio track'}</span><div className="audio-ribbon source-ribbon"/></>}</div>
 </div>}
<div className={'sequence-scroll'+(timelineView==='layers'?' shown':'')} ref={sequenceScrollRef} onScroll={scheduleTimelineViewport} aria-label="Multitrack editor timeline"><div className="sequence-tracks" style={{width:timelineZoom*100+"%"}}><div className="sequence-ruler"><div className="ruler-label">TC</div><div className="ruler-marks"><span>00:00</span><span>{fmt(duration/4)}</span><span>{fmt(duration/2)}</span><span>{fmt(duration*3/4)}</span><span>{fmt(duration)}</span></div></div>
<div className="seq-track video-track"><div className="seq-label"><strong>V1</strong><span>Video</span></div><div className="seq-lane" onClick={e=>{if(!duration)return;const box=e.currentTarget.getBoundingClientRect();seek(clamp((e.clientX-box.left)/box.width*duration,0,duration))}}>{url?<div className="seq-clip" style={{left:(duration?start/duration*100:0)+"%",width:(duration?(end-start)/duration*100:0)+"%"}}><span className="seq-clip-thumb"/><span>{file?.name||"Source clip"}</span></div>:<span className="seq-hint">Import a video to begin</span>}{manualCuts.map(([a,b],i)=><div className="seq-cut" key={"c"+i} style={{left:(duration?a/duration*100:0)+"%",width:(duration?(b-a)/duration*100:0)+"%"}}/>)}{cutSilence&&silences.map(([a,b],i)=><div className="seq-cut silence" key={"s"+i} style={{left:(duration?a/duration*100:0)+"%",width:(duration?(b-a)/duration*100:0)+"%"}}/>)}<div className="seq-playhead" style={{left:(duration?current/duration*100:0)+"%"}}/></div></div>
<div className="seq-track"><div className="seq-label"><strong>G1</strong><span>Text</span></div><div className="seq-lane" onClick={e=>{if(!duration)return;const box=e.currentTarget.getBoundingClientRect();seek(clamp((e.clientX-box.left)/box.width*duration,0,duration))}}>{(titleLayer||graphicsEnabled&&activeHighlight)&&<div className="seq-clip graphic-clip" style={{left:(duration?start/duration*100:0)+"%",width:(duration?(end-start)/duration*100:0)+"%"}}>{titleLayer?.text||shortsTitle||"TITLE"}</div>}<div className="seq-playhead" style={{left:(duration?current/duration*100:0)+"%"}}/></div></div>
<div className="seq-track"><div className="seq-label"><strong>T1</strong><span>Captions</span></div><div className="seq-lane" onClick={e=>{if(!duration)return;const box=e.currentTarget.getBoundingClientRect();seek(clamp((e.clientX-box.left)/box.width*duration,0,duration))}}>{captionsOn&&activeCaptions.map((c,i)=><div key={i} className="seq-cue" title={c.text} style={{left:(duration?c.start/duration*100:0)+"%",width:(duration?Math.max(0,c.end-c.start)/duration*100:0)+"%"}}>{c.text}</div>)}<div className="seq-playhead" style={{left:(duration?current/duration*100:0)+"%"}}/></div></div>
<div className="seq-track audio-track"><div className="seq-label"><strong>A1</strong><button type="button" className="seq-mute" title={muted?"Unmute audio":"Mute audio"} aria-label={muted?"Unmute audio track":"Mute audio track"} onClick={()=>setMuted(v=>!v)}>{muted?"Unmute":"Mute"}</button></div><div className="seq-lane" onClick={e=>{if(!duration)return;const box=e.currentTarget.getBoundingClientRect();seek(clamp((e.clientX-box.left)/box.width*duration,0,duration))}}>{url&&<div className="seq-clip audio-clip" style={{left:(duration?start/duration*100:0)+"%",width:(duration?(end-start)/duration*100:0)+"%"}}>{muted?"Muted":"Source audio"}</div>}{waveform.length>0&&<svg className="seq-wave" viewBox="0 0 180 48" preserveAspectRatio="none" aria-hidden="true">{waveform.map((peak,i)=><rect key={i} x={i+.15} y={24-Math.max(1,peak*22)} width=".7" height={Math.max(2,peak*44)} rx=".25"/>)}</svg>}{manualCuts.map(([a,b],i)=><div className="seq-cut" key={"c"+i} style={{left:(duration?a/duration*100:0)+"%",width:(duration?(b-a)/duration*100:0)+"%"}}/>)}{cutSilence&&silences.map(([a,b],i)=><div className="seq-cut silence" key={"s"+i} style={{left:(duration?a/duration*100:0)+"%",width:(duration?(b-a)/duration*100:0)+"%"}}/>)}<div className="seq-playhead" style={{left:(duration?current/duration*100:0)+"%"}}/></div></div>
<div className="seq-track audio-track"><div className="seq-label"><strong>A2</strong><span>Music</span></div><div className="seq-lane" onClick={e=>{if(!duration)return;const box=e.currentTarget.getBoundingClientRect();seek(clamp((e.clientX-box.left)/box.width*duration,0,duration))}}>{musicFile&&<div className="seq-clip audio-clip" style={{left:'0%',width:'100%',opacity:musicEnabled?Math.max(.35,musicVolume/100):.32}} onClick={e=>{e.stopPropagation();setSelectedLayer('music');setEditorTool('music')}}><Music2 size={13}/>{musicFile.name}</div>}<div className="seq-playhead" style={{left:(duration?current/duration*100:0)+"%"}}/></div></div></div></div><div className="timefields"><label>Start (seconds)<input type="number" min="0" max={end} step="0.1" value={start} disabled={!duration} onChange={e=>{const n=clamp(Number(e.target.value)||0,0,end);setStart(n);seek(n)}}/></label><label>End (seconds)<input type="number" min={start} max={duration} step="0.1" value={Number(end.toFixed(1))} disabled={!duration} onChange={e=>setEnd(clamp(Number(e.target.value)||0,start,duration))}/></label></div><div className="track"><div className="selected" style={{left:`${duration?start/duration*100:0}%`,width:`${duration?(end-start)/duration*100:0}%`}}></div><div className="playhead" style={{left:`${duration?current/duration*100:0}%`}}></div></div><div className="ticks"><span>00:00</span><span>{fmt(duration)}</span></div><div className="wave-header"><strong>Audio waveform</strong><span>{audioReading?'Analyzing audio…':waveform.length?'Click waveform to seek • edit cut times below':'Waveform unavailable for this audio codec'}</span></div><div className="waveform" role="slider" aria-label="Audio waveform position" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={current} tabIndex={duration?0:-1} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();seek(clamp(current+(e.key==='ArrowRight'?0.5:-0.5),0,duration))}}} onClick={e=>{if(!duration)return;const box=e.currentTarget.getBoundingClientRect();seek(clamp((e.clientX-box.left)/box.width*duration,0,duration))}}><svg viewBox="0 0 180 48" preserveAspectRatio="none" aria-hidden="true">{waveform.map((peak,i)=><rect key={i} x={i+.15} y={24-Math.max(1,peak*22)} width=".7" height={Math.max(2,peak*44)} rx=".25" fill="#9e8aff"/>)}</svg><div className="wave-playhead" style={{left:`${duration?current/duration*100:0}%`}}/>{manualCuts.map(([a,b],i)=><div className="wave-cut manual" key={'m'+i} style={{left:`${duration?a/duration*100:0}%`,width:`${duration?(b-a)/duration*100:0}%`}}/>)}{cutSilence&&silences.map(([a,b],i)=><div className="wave-cut automatic" key={'a'+i} style={{left:`${duration?a/duration*100:0}%`,width:`${duration?(b-a)/duration*100:0}%`}}/>)}</div><div className="cut-track" aria-label="Edit timeline">{manualCuts.map(([a,b],i)=><div key={i} title={`Removed ${fmt(a)}–${fmt(b)}`} className="cut-block" style={{left:`${duration?a/duration*100:0}%`,width:`${duration?(b-a)/duration*100:0}%`}}/>)}{cutSilence&&silences.map(([a,b],i)=><div key={`s${i}`} className="silence-block" title={`Silence ${fmt(a)}–${fmt(b)}`} style={{left:`${duration?a/duration*100:0}%`,width:`${duration?(b-a)/duration*100:0}%`}}/>)}</div><div className="cut-tools"><strong>Cut & review</strong><p>Mark a section to remove, or use a prompt like “cut from 10 to 15 seconds”. Red = manual cuts; amber = detected silence. Adjust each cut’s in/out time below or restore it.</p><div className="cut-fields"><label>Cut from (s)<input type="number" min="0" max={duration} step=".1" value={cutIn} onChange={e=>setCutIn(Number(e.target.value))}/><button onClick={()=>setCutIn(Number(current.toFixed(1)))}>Use playhead</button></label><label>Cut to (s)<input type="number" min="0" max={duration} step=".1" value={cutOut} onChange={e=>setCutOut(Number(e.target.value))}/><button onClick={()=>setCutOut(Number(current.toFixed(1)))}>Use playhead</button></label></div><button className="cut-action" disabled={!duration||busy} onClick={()=>addCut(cutIn,cutOut)}>✂ Remove selected section</button><label className="mute"><input type="checkbox" checked={review} onChange={e=>{video.current?.pause();setReview(e.target.checked);seek(start)}}/> Review edit — skip removed sections</label>{manualCuts.map(([a,b],i)=><div className="cut-row" key={'manual'+i}><div className="cut-editor"><span>Manual cut {i+1}</span><input aria-label={`Manual cut ${i+1} start`} type="number" min="0" max={b-.05} step=".1" value={Number(a.toFixed(2))} onChange={e=>adjustCut('manual',i,0,Number(e.target.value))}/><span>to</span><input aria-label={`Manual cut ${i+1} end`} type="number" min={a+.05} max={duration} step=".1" value={Number(b.toFixed(2))} onChange={e=>adjustCut('manual',i,1,Number(e.target.value))}/></div><button onClick={()=>restoreCut(i)}>Restore</button></div>)}{cutSilence&&silences.map(([a,b],i)=><div className="cut-row" key={'silence'+i}><div className="cut-editor"><span>Silence {i+1}</span><input aria-label={`Silence ${i+1} start`} type="number" min="0" max={b-.05} step=".1" value={Number(a.toFixed(2))} onChange={e=>adjustCut('silence',i,0,Number(e.target.value))}/><span>to</span><input aria-label={`Silence ${i+1} end`} type="number" min={a+.05} max={duration} step=".1" value={Number(b.toFixed(2))} onChange={e=>adjustCut('silence',i,1,Number(e.target.value))}/></div><button onClick={()=>restoreSilence(i)}>Keep</button></div>)}<div className="cut-summary">{ranges().length} kept segment(s) · {fmt(ranges().reduce((sum,[a,b])=>sum+b-a,0))} estimated output</div></div></section></section>
<div className="workspace-column-handle properties-handle" role="separator" aria-label="Resize properties panel" aria-orientation="vertical" tabIndex={0} onPointerDown={e=>startWorkspaceResize(e,'properties')} onPointerMove={moveWorkspaceResize} onPointerUp={endWorkspaceResize} onPointerCancel={endWorkspaceResize} onKeyDown={e=>resizeWithKeyboard(e,'properties')} title="Drag left or right to resize properties"><span/></div>
<aside className="studio-properties"><div className="properties-heading"><span><SlidersHorizontal size={16}/> Properties</span><small>{selectedLayer==='video'?'Video canvas':selectedLayer==='text'?'Text layer':selectedLayer==='sticker'?'Element':selectedLayer==='music'?'Soundtrack':'Edit'}</small></div>
{selectedLayer==='video'&&<div className="properties-body">
 <div className="property-section"><strong>Canvas size</strong><div className="prop-ratios">{['16:9','9:16','1:1','4:5'].map(r=><button key={r} type="button" className={ratio===r?'active':''} onClick={()=>setRatio(r)}>{r}</button>)}</div><small>{ratio==='9:16'?'Full-height vertical framing for Shorts & Reels':'Resize the output canvas at any time.'}</small></div>
 <div className="property-section"><strong>Crop & frame</strong><label>Horizontal focus · {focusX}%<input type="range" min="0" max="100" value={focusX} onChange={e=>setFocusX(Number(e.target.value))}/></label><label className="inline-switch"><input type="checkbox" checked={focusMode} onChange={e=>setFocusMode(e.target.checked)}/> Enable custom focus</label></div>
 <div className="property-section"><strong>Adjust</strong>{[['Brightness','brightness'],['Contrast','contrast'],['Saturation','saturate']].map(([label,key])=><label key={key}>{label} · {videoFilter[key]}%<input type="range" min="0" max="200" value={videoFilter[key]} onChange={e=>setVideoFilter(p=>({...p,[key]:Number(e.target.value)}))}/></label>)}<button type="button" className="secondary-action" onClick={()=>setVideoFilter({brightness:100,contrast:100,saturate:100})}>Reset adjustments</button></div>
</div>}
{selectedLayer==='text'&&<div className="properties-body">{titleLayer?<><div className="property-section"><strong>Edit text</strong><textarea rows={3} maxLength={180} value={titleLayer.text} onChange={e=>setTitleLayer(t=>({...t,text:e.target.value}))}/><label>Text color<input type="color" value={titleLayer.color} onChange={e=>setTitleLayer(t=>({...t,color:e.target.value}))}/></label><label className="inline-switch"><input type="checkbox" checked={titleLayer.background} onChange={e=>setTitleLayer(t=>({...t,background:e.target.checked}))}/> Text background</label></div><div className="property-section"><strong>Transform</strong>{[['Size','size',2,15],['Position X','x',8,92],['Position Y','y',8,92]].map(([label,key,min,max])=><label key={key}>{label} · {titleLayer[key]}{key==='size'?'%':''}<input type="range" min={min} max={max} step="1" value={titleLayer[key]} onChange={e=>setTitleLayer(t=>({...t,[key]:Number(e.target.value)}))}/></label>)}</div><button type="button" className="remove-action" onClick={()=>{setTitleLayer(null);setSelectedLayer('video')}}>Delete text</button></>:<p className="empty-library">Choose a text preset from the Text tab.</p>}</div>}
{selectedLayer==='sticker'&&<div className="properties-body">{stickerLayer?<><div className="property-section"><strong>Element position</strong>{[['Size','size',3,22],['Position X','x',8,92],['Position Y','y',8,92]].map(([label,key,min,max])=><label key={key}>{label} · {stickerLayer[key]}<input type="range" min={min} max={max} value={stickerLayer[key]} onChange={e=>setStickerLayer(t=>({...t,[key]:Number(e.target.value)}))}/></label>)}</div><button type="button" className="remove-action" onClick={()=>{setStickerLayer(null);setSelectedLayer('video')}}>Delete element</button></>:<p className="empty-library">Choose an element from the Elements tab.</p>}</div>}
{selectedLayer==='music'&&<div className="properties-body">{musicFile?<><div className="property-section"><strong>{musicFile.name}</strong><label>Soundtrack volume · {musicVolume}%<input type="range" min="0" max="100" value={musicVolume} onChange={e=>setMusicVolume(Number(e.target.value))}/></label><label className="inline-switch"><input type="checkbox" checked={musicEnabled} onChange={e=>setMusicEnabled(e.target.checked)}/> Enable track</label></div><button type="button" className="remove-action" onClick={removeSoundtrack}>Remove soundtrack</button></>:<p className="empty-library">Import your own audio in Music.</p>}</div>}
<div className="layer-list"><strong>Layers</strong><button type="button" onClick={()=>setSelectedLayer('video')} className={selectedLayer==='video'?'selected':''}><Film size={15}/> Video <span>V1</span></button>{titleLayer&&<button type="button" onClick={()=>setSelectedLayer('text')} className={selectedLayer==='text'?'selected':''}><Type size={15}/> Text <span>T1</span></button>}{stickerLayer&&<button type="button" onClick={()=>setSelectedLayer('sticker')} className={selectedLayer==='sticker'?'selected':''}><Shapes size={15}/> Element <span>E1</span></button>}{musicFile&&<button type="button" onClick={()=>setSelectedLayer('music')} className={selectedLayer==='music'?'selected':''}><Music2 size={15}/> Music <span>A2</span></button>}</div>
</aside>
</main>{musicUrl&&<audio ref={musicPreviewRef} src={musicUrl} loop preload="auto" style={{display:'none'}} onLoadedMetadata={e=>{setMusicDuration(e.currentTarget.duration);e.currentTarget.volume=musicVolume/100}}/>}<footer className="editor-statusbar"><span><b>AutoEdit Studio 3.0</b> · InVideo-inspired editing workspace · Video + local music + text</span><span>{url?dimensions.join(' × ')+' · '+ratio:'Import a video or paste an authorized link to start'}</span></footer></div>}

createRoot(document.getElementById('root')).render(<App/>);
