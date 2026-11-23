/** Lightweight scene/storyboard helpers for a single editable source video.
 * Split points are nondestructive markers, not separate uploaded clips.
 */
export function makeScenes(duration, markers = []) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const sorted = [...new Set(markers.filter(x=>Number.isFinite(x)&&x>0&&x<duration).map(x=>Math.round(x*100)/100))].sort((a,b)=>a-b);
  return [0,...sorted].map((start,index)=>({id:`scene-${index}`,index,start,end:([...sorted,duration])[index]}));
}
export function splitAt(markers,time,duration) {
  if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0) return null;
  const scenes=makeScenes(duration,markers);
  const scene=scenes.find(s=>time>s.start+.35&&time<s.end-.35);
  if(!scene||scenes.length>=12) return null;
  const next=Math.round(time*100)/100;
  return [...markers,next].sort((a,b)=>a-b);
}
export function soundtrackTime(time,duration) {
  return duration>0 ? ((time % duration) + duration) % duration : 0;
}
