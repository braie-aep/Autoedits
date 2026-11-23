import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleFrameTimes,visibleTimeWindow} from './useTimelineFilmstrip.js';
test('fixed viewport returns actual source time span',()=>{
 const p=visibleTimeWindow(120,4,900,900,3600);
 assert.deepEqual(p,{start:30,end:60});
});
test('zoomed view samples nearby source frames instead of all 2 hours',()=>{
 const normal=sampleFrameTimes(7200,'scenes',1,{start:0,end:0});
 const zoomed=sampleFrameTimes(7200,'layers',8,{start:900,end:1800});
 assert.ok(normal.length>=17&&zoomed.length>=20);
 assert.ok(zoomed.every(p=>p.time>=0&&p.time<=7200));
 assert.ok(Math.max(...zoomed.map(p=>p.time))-Math.min(...zoomed.map(p=>p.time))<1300);
 assert.ok(zoomed.some(p=>p.time>900&&p.time<1800));
});
test('no source produces no frames and all samples stay in range',()=>{
 assert.deepEqual(sampleFrameTimes(0,'layers',8,{start:0,end:0}),[]);
 const p=sampleFrameTimes(2,'layers',16,{start:1.9,end:2});
 assert.ok(p.length>0&&p.every(t=>t.time>=0&&t.time<=2));
});
