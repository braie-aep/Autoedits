const clamp = (n,min,max) => Math.max(min,Math.min(max,Number(n)||0));
export function drawEditorTitle(ctx,canvas,layer) {
  if(!layer?.text?.trim())return;
  const size=Math.max(16,Math.round(canvas.width*clamp(layer.size,2,15)/100));
  const cx=canvas.width*clamp(layer.x,8,92)/100;
  const cy=canvas.height*clamp(layer.y,8,92)/100;
  const maxW=canvas.width*.85;
  ctx.save();ctx.font=`800 ${size}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  const words=layer.text.trim().slice(0,180).split(/\s+/);let line='';const lines=[];
  for(const word of words){
    const test=line?line+' '+word:word;
    if(ctx.measureText(test).width>maxW && line){lines.push(line);line=word;}else line=test;
  }
  if(line)lines.push(line);
  const visible=lines.slice(0,4),spacing=size*1.23,total=visible.length*spacing;
  if(layer.background){
    const contentW=Math.min(maxW,Math.max(...visible.map(x=>ctx.measureText(x).width),size*3));
    ctx.fillStyle='rgba(13,18,29,.72)';
    const bx=clamp(cx-contentW/2-size*.55,0,canvas.width),bw=Math.min(contentW+size*1.1,canvas.width-bx);
    ctx.fillRect(bx,clamp(cy-total/2-size*.4,0,canvas.height),bw,total+size*.8);
  }
  ctx.fillStyle=layer.color||'#ffffff';ctx.shadowColor='rgba(0,0,0,.75)';ctx.shadowBlur=size*.18;
  visible.forEach((value,i)=>ctx.fillText(value,cx,cy-total/2+spacing*(i+.5),maxW));
  ctx.restore();
}
export function drawEditorSticker(ctx,canvas,layer) {
  if(!layer?.symbol)return;
  const size=Math.round(canvas.width*clamp(layer.size,3,22)/100);
  ctx.save();ctx.font=`${size}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(layer.symbol,canvas.width*clamp(layer.x,8,92)/100,canvas.height*clamp(layer.y,8,92)/100);
  ctx.restore();
}
