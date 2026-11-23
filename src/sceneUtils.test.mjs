import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScenes,splitAt,soundtrackTime} from './sceneUtils.js';
test('no video shows no scenes',()=>assert.deepEqual(makeScenes(0,[]),[]));
test('scene splits create ordered nonoverlapping segments',()=>{
 const segments=makeScenes(12,[8,3]);
 assert.deepEqual(segments.map(s=>[s.start,s.end]),[[0,3],[3,8],[8,12]]);
});
test('split refuses cuts too near a scene edge',()=>{
 assert.equal(splitAt([3],3.1,12),null);
 assert.deepEqual(splitAt([3],7,12),[3,7]);
});
test('music wraps at its length and respects zero',()=>{
 assert.equal(soundtrackTime(12.4,5),2.4000000000000004);
 assert.equal(soundtrackTime(12.4,0),0);
});
