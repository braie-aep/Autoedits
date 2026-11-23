import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceCropRect, outputCanvasSize} from './renderGeometry.js';

test('9:16 from 1920x1080 crops center instead of letterboxing', () => {
  const size = outputCanvasSize(1920, 1080, 9 / 16);
  assert.ok(Math.abs(size.width / size.height - 9 / 16) < .002);
  const crop = sourceCropRect(1920, 1080, size.width, size.height, 50);
  assert.ok(Math.abs(crop.width - 607.5) < 2);
  assert.equal(crop.height, 1080);
  assert.ok(Math.abs(crop.x - (1920 - crop.width) / 2) < .001);
  assert.equal(crop.y, 0);
});
test('horizontal focus moves crop without exposing empty pixels', () => {
  const left = sourceCropRect(1920, 1080, 720, 1280, 0);
  const right = sourceCropRect(1920, 1080, 720, 1280, 100);
  assert.equal(left.x, 0);
  assert.ok(Math.abs(right.x + right.width - 1920) < .001);
});
test('portrait sources stay full-bleed in portrait composition', () => {
  const c = sourceCropRect(1080, 1920, 720, 1280);
  assert.deepEqual(c,{x:0,y:0,width:1080,height:1920});
});
test('landscape output crops height from portrait source', () => {
  const c = sourceCropRect(1080, 1920, 1920, 1080);
  assert.equal(c.x,0);
  assert.ok(c.y>0);
  assert.ok(c.height<1920);
});
test('invalid dimensions cannot reach canvas drawImage', () => {
  assert.throws(()=>sourceCropRect(0,1080,720,1280), RangeError);
});
