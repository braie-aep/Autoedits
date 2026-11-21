// Explainable, local highlight suggestions. This is a heuristic, not semantic AI.
// Captions improve relevance; waveform energy provides a fallback.
const signalWords=/\b(important|amazing|best|because|secret|why|how|remember|tip|learn|surprise|problem|solution|never|always|finally|big|wow|incredible|first|key|result|mistake|actually|interesting)\b/gi;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function suggestHighlights({duration,captions=[],waveform=[],count=4,clipLength=30}){
 if(!Number.isFinite(duration)||duration<1)return [];
 const length=clamp(Number(clipLength)||30,Math.min(5,duration),Math.min(duration,60));
 const interval=Math.max(4,Math.min(10,length/3));
 const candidates=[];
 for(let t=0;t<duration;t+=interval){
   const start=Math.min(t,Math.max(0,duration-length)),end=Math.min(duration,start+length);
   const overlapping=captions.filter(c=>Number(c.end)>start&&Number(c.start)<end);
   const words=overlapping.map(c=>c.text).join(' ');
   const speechSeconds=overlapping.reduce((sum,c)=>sum+Math.max(0,Math.min(end,c.end)-Math.max(start,c.start)),0);
   const keywordHits=(words.match(signalWords)||[]).length;
   const normSpeech=clamp(speechSeconds/Math.max(1,end-start),0,1);
   const a=Math.floor(start/duration*waveform.length),b=Math.max(a+1,Math.ceil(end/duration*waveform.length));
   const values=waveform.slice(a,b);
   const energy=values.length?values.reduce((sum,v)=>sum+v,0)/values.length:0;
   // A modest preference for the middle, avoiding empty starts/ends.
   const score=(captions.length?normSpeech*.8+Math.min(keywordHits,5)*.18:0)+energy*.6;
   const reason=captions.length?(keywordHits?'Speech with potential key phrases':'Sustained speech'):'Audio energy/activity';
   candidates.push({start,end,score,reason,excerpt:words.trim().slice(0,160)});
   if(start+length>=duration)break;
 }
 candidates.sort((a,b)=>b.score-a.score);
 const chosen=[];
 for(const c of candidates){
   if(chosen.every(existing=>Math.max(0,Math.min(c.end,existing.end)-Math.max(c.start,existing.start))<length*.3)){
     chosen.push({...c,id:'h'+Math.round(c.start*1000)});
   }
   if(chosen.length>=count)break;
 }
 return chosen.sort((a,b)=>a.start-b.start);
}
