import test from 'node:test';
import assert from 'node:assert/strict';
import {drawEditorTitle,drawEditorSticker} from './canvasOverlays.js';
test('draw title and sticker inside output canvas using normalized placement',()=>{
 const items=[];
 const ctx={
   save(){},restore(){},fillRect(...a){items.push(['rect',...a])},
   fillText(...a){items.push(['text',...a])},
   measureText(v){return {width:v.length*19}}
 };
 const canvas={width:640,height:1138};
 drawEditorTitle(ctx,canvas,{text:'Hello AutoEdit',size:7,x:50,y:25,color:'#fff',background:true});
 drawEditorSticker(ctx,canvas,{symbol:'✨',size:12,x:75,y:28});
 assert.ok(items.some(x=>x[0]==='rect'));
 assert.ok(items.filter(x=>x[0]==='text').length>=2);
 for(const x of items.filter(x=>x[0]==='text')){assert.ok(x[2]>=0&&x[2]<=canvas.width);assert.ok(x[3]>=0&&x[3]<=canvas.height)}
});
test('empty title and sticker are harmless',()=>{
 const ctx={save(){throw Error('should not draw')}};
 drawEditorTitle(ctx,{width:640,height:1138},null);
 drawEditorSticker(ctx,{width:640,height:1138},null);
});
