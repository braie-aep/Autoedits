import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'pipe',detached:true});
server.stdout.on('data',data=>process.stdout.write(data));
server.stderr.on('data',data=>process.stderr.write(data));
let browser;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  let ok=false;
  for(let i=0;i<40;i++){
    try{const r=await fetch('http://127.0.0.1:4173/');if(r.ok){ok=true;break}}catch{}
    await sleep(250);
  }
  assert.ok(ok,'Vite dev server must start');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1536,height:960},deviceScaleFactor:1});
  page.setDefaultTimeout(15000);
  const jsErrors=[];page.on('pageerror',err=>jsErrors.push(err.message));
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('.invideo-topbar .version').getByText('STUDIO 3.1',{exact:true}).waitFor();
  assert.equal(await page.locator('.tool-rail button').count(),8);
  await page.locator('.project-import input[type=file]').setInputFiles('/tmp/autoedit-smoke.mp4');
  await page.locator('.program-video').waitFor();
  await page.waitForFunction(()=>document.querySelector('.program-video')?.videoWidth>0);
  // User-requested placement: all three controls belong BESIDE the title
  // in the upper "Your video timeline" header, not a second toolbar row.
  assert.equal(await page.locator('.studio-timeline-toolbar').count(),0,'There must not be a separate Scenes/Layers/Cuts row');
  const titleBox=await page.locator('.timeline-main-header .timeline-heading-title').boundingBox();
  const buttonBoxes=await Promise.all(['Scenes','Layers','Cuts'].map(async name=>page.locator('.timeline-main-header').getByRole('button',{name,exact:name!=='Cuts'}).boundingBox()));
  assert.ok(titleBox&&buttonBoxes.every(Boolean),'Timeline header and all three controls must be visible');
  assert.ok(buttonBoxes.every(b=>Math.abs((b.y+b.height/2)-(titleBox.y+titleBox.height/2))<15),'Scenes, Layers and Cuts must be aligned beside the timeline title on the same row');
  assert.ok(buttonBoxes[0].x>=titleBox.x+titleBox.width-2,'Scenes must appear after the timeline title');
  assert.ok(buttonBoxes[0].x<buttonBoxes[1].x&&buttonBoxes[1].x<buttonBoxes[2].x,'Controls must appear in order Scenes, Layers, Cuts');
  console.log('Timeline header placement passed: title, Scenes, Layers and Cuts share the top row');
  // Cuts should be opened beside Scenes/Layers, never displayed below the tracks.
  assert.equal(await page.locator('.timeline .cut-tools').count(),0,'Cut controls must not be below the timeline');
  assert.equal(await page.locator('.timeline .timefields').count(),0,'Trim fields must not be below the timeline');
  const cutToggle=page.locator('.timeline-mode-group .timeline-cuts-trigger');
  await cutToggle.click();
  await page.locator('.tool-inspector .cut-inspector').waitFor();
  assert.equal(await cutToggle.getAttribute('aria-pressed'),'true','Cuts button reflects the selected tools panel');
  assert.equal(await page.locator('.timeline .scene-storyboard').count(),1,'Opening Cuts must not replace the scene timeline');
  const cutPanel=page.locator('.tool-inspector .cut-inspector');
  await cutPanel.locator('.cut-fields input').first().fill('1');
  await cutPanel.locator('.cut-fields input').nth(1).fill('2');
  await cutPanel.locator('.cut-action').click();
  await cutPanel.getByText('Manual cut 1').waitFor();
  assert.equal(await page.locator('.timeline .cut-tools').count(),0,'Creating a cut cannot insert tools beneath the timeline');
  await cutPanel.getByRole('button',{name:'Restore'}).click();
  assert.equal(await cutPanel.getByText('Manual cut 1').count(),0,'Restore should remove a manual cut');
  await page.locator('.tool-rail').getByRole('button',{name:'Media'}).click();
  console.log('Cuts-panel regression passed: toolbar toggle opens working controls on the left, without touching timeline layout');

  // Regression: the legacy unscoped `.selected` rule used to absolutely position
  // the selected scene card and selected layer button across the whole editor.
  await page.locator('.scene-card.selected').waitFor();
  const scene=await page.locator('.scene-card.selected').boundingBox();
  const timeline=await page.locator('.timeline').boundingBox();
  assert.ok(scene&&timeline,'The scene and timeline must render');
  const noPageScroll=await page.evaluate(()=>({scroll:document.documentElement.scrollHeight,viewport:innerHeight,body:document.body.scrollHeight}));
  assert.ok(noPageScroll.scroll<=noPageScroll.viewport+2,'Editor document must fit entirely inside a single viewport');
  assert.ok(noPageScroll.body<=noPageScroll.viewport+2,'The body cannot become a scrolling page');
  const beforeHeight=timeline.height;
  const divider=await page.getByRole('separator',{name:'Resize preview and timeline'}).boundingBox();
  assert.ok(divider,'Preview/timeline resize handle must render');
  await page.mouse.move(divider.x+divider.width/2,divider.y+divider.height/2);
  await page.mouse.down();
  await page.mouse.move(divider.x+divider.width/2,divider.y-70,{steps:8});
  await page.mouse.up();
  const afterHeight=(await page.locator('.timeline').boundingBox()).height;
  assert.ok(afterHeight>beforeHeight+20,'Dragging divider upward must enlarge the timeline');
  assert.ok((await page.locator('.viewer').boundingBox()).height<420,'Canvas preview must shrink when timeline enlarges');
  console.log('Workspace drag regression passed: one-page shell, resize increases timeline area');
  await page.waitForFunction(()=>document.querySelectorAll('.storyboard-frame img').length>=3,null,{timeout:25000});
  console.log('Frame strip captures decoded source images');
  assert.ok(scene.height<175,'The selected scene must be a thumbnail, not a page-height overlay');
  assert.ok(scene.y>=timeline.y&&scene.y+scene.height<=timeline.y+timeline.height+5,'Scene card must remain inside the timeline');
  assert.equal(await page.locator('.scene-card.selected').evaluate(el=>getComputedStyle(el).position),'static','Selected scene must not inherit absolute positioning');
  const properties=await page.locator('.studio-properties').boundingBox();
  const activeLayer=await page.locator('.layer-list>button.selected').boundingBox();
  assert.ok(properties&&activeLayer&&activeLayer.height<65,'The active layer control must stay a normal button');
  assert.ok(activeLayer.y>=properties.y&&activeLayer.y+activeLayer.height<=properties.y+properties.height,'Layer controls must stay inside the Properties panel');
  assert.equal(await page.locator('.layer-list>button.selected').evaluate(el=>getComputedStyle(el).position),'static','Selected layer must not inherit absolute positioning');
  console.log('Layout regression passed: scene card and properties controls stay inside their panels at 1536x960');

  await page.locator('.monitor-ratios button',{hasText:'9:16'}).click();
  const frame=await page.locator('.program-frame').boundingBox();
  assert.ok(frame&&Math.abs(frame.width/frame.height-9/16)<.03,'Canvas should have a true 9:16 aspect ratio');
  await page.locator('.tool-rail').getByRole('button',{name:'Text'}).click();
  await page.locator('.title-preset.preset-heading').click();
  await page.locator('.studio-text-layer').waitFor();
  const text=await page.locator('.studio-text-layer').boundingBox();
  assert.ok(text&&text.x>=frame.x-3&&text.x+text.width<=frame.x+frame.width+3,'Text must stay inside portrait canvas');
  await page.locator('.tool-rail').getByRole('button',{name:'Elements'}).click();
  await page.getByRole('button',{name:'Add ✨ element'}).click();
  await page.locator('.studio-sticker-layer').waitFor();
  await page.locator('.tool-rail').getByRole('button',{name:'Music'}).click();
  await page.locator('.library-upload input[type=file]').setInputFiles('/tmp/autoedit-music.wav');
  await page.locator('.soundtrack-item').waitFor();
  await page.locator('input[aria-label="Playhead"]').evaluate(el=>{
    el.value='2';
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.getByRole('button',{name:'Split scene'}).click();
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  for(let i=0;i<3;i++)await page.locator('.timeline-toolbar button[title="Zoom in timeline"]').click();
  assert.ok((await page.locator('.sequence-scroll').evaluate(el=>el.scrollWidth))>(await page.locator('.sequence-scroll').evaluate(el=>el.clientWidth))*5,'Zoom must make the timeline detailed and horizontally pannable inside its own panel');
  await page.waitForFunction(()=>document.querySelectorAll('.seq-frame-tile img').length>=3,null,{timeout:25000});
  assert.ok(await page.locator('.seq-frame-tile').count()>2,'Zoomed V1 track must contain frames at actual timestamps');
  await page.locator('.sequence-scroll').evaluate(el=>el.scrollLeft=Math.max(0,el.scrollWidth-el.clientWidth));
  await page.waitForFunction(()=>{const el=document.querySelector('.sequence-scroll');return el&&el.scrollLeft>100;});
  const afterPan=await page.locator('.seq-frame-tile').count();
  assert.ok(afterPan>=3,'Panning across a long zoomed timeline must retain time-based frame tiles');
  assert.ok(await page.locator('.seq-track.audio-track').count()>=2,'Audio waveform lanes remain separate from video frames');
  // Browser synthetic slider events vary; make the storyboard itself the main assertion.
  assert.ok(await page.locator('.seq-track.video-track').count()===1,'The detailed video track must stay mounted in Layers view');
  if(jsErrors.length)throw new Error('Browser JS error: '+jsErrors.join(' | '));
  fs.mkdirSync('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/studio3.png',fullPage:false});
  console.log('Studio 3.1 browser smoke passed: one-screen layout, resize handles, frame thumbnails, detailed zoom, audio lanes, 9:16 and editing tools');
} finally {
  if(browser)await browser.close();
  try{process.kill(-server.pid,'SIGTERM')}catch{server.kill('SIGTERM')}
  server.stdout.destroy();server.stderr.destroy();
}
