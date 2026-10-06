import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
// Editing regressions use stable source projects; published-worlds.spec covers the current release defaults.
const catalog=JSON.parse(await readFile(new URL('../web/editor/data/catalog.json',import.meta.url)));
const originals=await Promise.all(catalog.map(c=>readFile(new URL('../web/editor/data/'+c.stage+'.json',import.meta.url),'utf8').then(JSON.parse).then(b=>b.project)));
test.beforeEach(async({page})=>{await page.addInitScript(projects=>{for(const p of projects){const key='ttrc-editor-v1:'+p.stage;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(p));}},originals);await page.route('**/api/editor/status',r=>r.fulfill({json:{available:true}}));await page.goto('/editor');await expect(page.locator('#loading')).toBeHidden();});
test('all stages load, including native LCD art and original actors',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));const values=await page.locator('#stage option').evaluateAll(es=>es.map(e=>e.value));expect(values).toHaveLength(26);for(const v of values){await page.selectOption('#stage',v);await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#test')).toBeEnabled();}await page.selectOption('#stage','Fx');await expect(page.locator('#native-list')).toContainText('Corneria Arwings');expect(errors).toEqual([]);});
test('target inspector, animation, undo, redo, reload and export retain the project',async({page})=>{await page.getByRole('button',{name:/Target 1 static/}).click();const x=page.getByLabel('X',{exact:true});const before=Number(await x.inputValue());await x.fill(String(before+4));await x.press('Tab');await expect(x).toHaveValue(String(before+4));await page.locator('#undo').click();await page.getByRole('button',{name:/Target 1 static/}).click();await expect(x).toHaveValue(String(before));await page.locator('#redo').click();await page.getByRole('button',{name:/Target 1 static/}).click();await expect(x).toHaveValue(String(before+4));await page.getByLabel('Target behavior').selectOption('teleport');await expect(page.getByLabel('Keyframes:',{exact:false})).toHaveValue(/120/);await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.getByRole('button',{name:/Target 1 teleport/}).click();await expect(x).toHaveValue(String(before+4));const download=page.waitForEvent('download');await page.locator('#export').click();expect((await download).suggestedFilename()).toMatch(/\.ttrc\.json$/);});
test('invalid edits block launch, valid draft is sent to isolated editor endpoint',async({page})=>{let submitted;await page.route('**/api/editor/test',async route=>{submitted=route.request().postDataJSON();await route.fulfill({json:{status:'started'}});});await page.getByRole('button',{name:/Target 1 static/}).click();await page.getByLabel('X',{exact:true}).fill('1800');await page.getByLabel('X',{exact:true}).press('Tab');await expect(page.locator('#test')).toBeDisabled();await expect(page.locator('#validation-list')).toContainText('outside');await page.locator('#undo').click();await expect(page.locator('#test')).toBeEnabled();await page.locator('#test').click();await expect(page.locator('#toast')).toContainText('Dolphin opened');expect(submitted.stage).toBe('Pk');expect(submitted.targets).toHaveLength(10);});
test('textured platform and bumper additions can be adjusted and deleted',async({page})=>{await page.locator('#add-platform').click();await expect(page.locator('#selection-title')).toHaveText('New moving platform');await page.getByLabel('Travel X').fill('70');await page.getByLabel('Travel X').press('Tab');await page.locator('#add-bumper').click();await expect(page.locator('#selection-title')).toHaveText('Bumper');await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('#object-list')).not.toContainText('Bumper');await page.screenshot({path:'build/editor/editor.png',fullPage:true});});
test('shared project links import without launching and clear the fragment',async({page})=>{const p=await page.evaluate(async()=>{const b=await(await fetch('/editor/data/Pk.json')).json();b.project.name='Shared power plant';b.project.targets[0][0]+=3;return b.project;});let calls=0;await page.route('**/api/editor/test',r=>{calls++;return r.fulfill({json:{status:'started'}});});await page.goto('/editor#draft='+encodeURIComponent(JSON.stringify(p)));await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#name')).toHaveValue('Shared power plant');expect(new URL(page.url()).hash).toBe('');expect(calls).toBe(0);});
test('web mode transfers the draft to the companion without an ISO upload',async({page})=>{await page.unroute('**/api/editor/status');await page.route('**/api/editor/status',r=>r.fulfill({json:{available:false}}));await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.context().route('http://localhost:4317/**',r=>r.fulfill({contentType:'text/html',body:'Companion transfer fixture'}));const next=page.waitForEvent('popup');await page.locator('#test').click();const popup=await next;await popup.waitForLoadState();const url=new URL(popup.url());expect(url.origin).toBe('http://localhost:4317');const draft=JSON.parse(decodeURIComponent(url.hash.slice(7)));expect(draft.format).toBe('TTRC_STAGE_PROJECT');expect(draft.targets).toHaveLength(10);expect(draft).not.toHaveProperty('iso');});

test('randomize moves only targets and undo restores them',async({page})=>{const before=await page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Pk')));await page.locator('#randomize').click();await expect(page.locator('#toast')).toContainText('targets moved');const after=await page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Pk')));expect(after.targets).not.toEqual(before.targets);for(const key of ['platforms','solids','spawn','mechanisms','additions'])expect(after[key]).toEqual(before[key]);await page.locator('#undo').click();expect(await page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Pk')))).toEqual(before);});
test('boosts remain available and target teleport destinations persist when switching behavior',async({page})=>{await page.locator('#add-boost-right').click();await expect(page.getByRole('combobox',{name:'Direction',exact:true})).toHaveValue('right');await page.locator('#add-boost-left').click();await expect(page.getByRole('combobox',{name:'Direction',exact:true})).toHaveValue('left');await page.getByRole('button',{name:/Target 1 static/}).click();await page.getByLabel('Target behavior').selectOption('teleport');const x=await page.getByLabel('Stop 2 X',{exact:true}).inputValue();await page.getByLabel('Stop 2 X',{exact:true}).fill(String(Number(x)+3));await page.getByLabel('Stop 2 X',{exact:true}).press('Tab');await page.getByRole('button',{name:'Add stop',exact:true}).click();await expect(page.getByLabel('Stop 4 frame',{exact:true})).toBeVisible();await page.getByLabel('Target behavior').selectOption('moving');await expect(page.getByLabel('Stop 3 X',{exact:true})).toHaveValue(String(Number(x)+3));await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.getByRole('button',{name:/Target 1 moving/}).click();await expect(page.getByLabel('Target behavior')).toHaveValue('moving');await expect(page.getByLabel('Stop 4 frame',{exact:true})).toBeVisible();await page.getByLabel('Target behavior').selectOption('static');await expect(page.getByRole('button',{name:'Add stop',exact:true})).toHaveCount(0);});
test('static ledges keep collision controls and moving platforms expose their own motion',async({page})=>{await page.getByRole('button',{name:/Steel deck 1 collision/,exact:true}).click();await expect(page.getByLabel('Platform behavior')).toHaveCount(0);await expect(page.getByLabel('Target behavior')).toHaveCount(0);await page.locator('#add-platform').click();await expect(page.getByLabel('Platform behavior')).toHaveCount(0);await expect(page.getByLabel('Travel X')).toBeVisible();await expect(page.getByLabel('Movement',{exact:true})).toHaveValue('authored');});

test('school blocks retain their texture reference through move, duplicate, delete and reload',async({page})=>{
 await page.selectOption('#stage','Ns');await expect(page.locator('#loading')).toBeHidden();
 const saved=()=>page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Ns')));
 const before=await saved();
 await page.locator('#object-list button').filter({hasText:'Onett Elementary School'}).click();
 await page.getByRole('button',{name:'Duplicate',exact:true}).click();
 let next=await saved();expect(next.solids).toHaveLength(before.solids.length+1);expect(next.solids.at(-1).asset).toBe('solid-2');expect(next.solids.at(-1).source).toBeUndefined();expect(next.solids.at(-1).points[0][0]).toBe(before.solids[2].points[0][0]+10);
 await page.getByRole('button',{name:'Delete',exact:true}).click();expect((await saved()).solids).toEqual(before.solids);
 await page.locator('#piece-library button').filter({hasText:'Onett Elementary School'}).click();expect((await saved()).solids.at(-1).asset).toBe('solid-2');
 await page.reload();await expect(page.locator('#loading')).toBeHidden();expect((await saved()).solids).toHaveLength(before.solids.length+1);
});
test('native enemies have rendered model thumbnails and editable persistent spawn points',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.selectOption('#stage','Ic');await expect(page.locator('#loading')).toBeHidden();
 const card=page.locator('#piece-library button').filter({hasText:'Topi'});await expect(card).toHaveCount(1);
 const pixels=await card.locator('canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n});expect(pixels).toBeGreaterThan(100);
 await card.click();await expect(page.locator('#selection-title')).toHaveText('Topi');await page.getByLabel('X',{exact:true}).fill('30');await page.getByLabel('X',{exact:true}).press('Tab');
 const p=await page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Ic')));expect(p.nativeActors).toHaveLength(4);expect(p.nativeActors.at(-1)).toMatchObject({kind:46,x:30});
 await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('#object-list button').filter({hasText:'Topi'})).toHaveCount(2);expect(errors).toEqual([]);
});

for(const behavior of ['moving','teleport'])test(`click and drag target stops on the map (${behavior})`,async({page})=>{
 await page.selectOption('#stage','Gw');await expect(page.locator('#loading')).toBeHidden();
 const saved=()=>page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Gw')));
 const before=await saved();await page.getByRole('button',{name:/Target 1 (static|moving|teleport)/}).click();await page.getByLabel('Target behavior').selectOption(behavior);
 await page.getByRole('button',{name:'Clear stops',exact:true}).click();await page.getByRole('button',{name:'Place stops on map',exact:true}).click();
 await expect(page.locator('#route-placement')).toBeVisible();
 const bounds=await page.evaluate(async()=> (await(await fetch('/editor/data/Gw.json')).json()).artBounds),rect=await page.locator('#scene').boundingBox();
 const [l,t,r,b]=bounds,scale=Math.min((rect.width-65)/(r-l),(rect.height-65)/(t-b));
 const at=([x,y])=>[rect.x+rect.width/2+(x-(l+r)/2)*scale,rect.y+rect.height/2-(y-(t+b)/2)*scale];
 for(const point of [[-80,180],[96,216]])await page.mouse.click(...at(point));
 let p=await saved(),c=p.targetCycles.find(c=>c.target===0);expect(c.keys).toEqual([[0,...p.targets[0]],[80,-80,180],[160,96,216],[240,...p.targets[0]]]);
 for(const key of ['solids','platforms','mechanisms','additions','targets'])expect(p[key]).toEqual(before[key]);
 await page.mouse.move(...at([-80,180]));await page.mouse.down();await page.mouse.move(...at([-110,196]),{steps:6});await page.mouse.up();
 c=(await saved()).targetCycles.find(c=>c.target===0);expect(c.keys[1]).toEqual([80,-110,196]);expect(c.keys[2]).toEqual([160,96,216]);
 await page.keyboard.press('Escape');await expect(page.locator('#route-placement')).toBeHidden();await expect(page.locator('#selection-title')).toHaveText('Target 1');
 await page.locator('#undo').click();expect((await saved()).targetCycles.find(c=>c.target===0).keys[1]).toEqual([80,-80,180]);
 await page.locator('#redo').click();await page.reload();await expect(page.locator('#loading')).toBeHidden();expect((await saved()).targetCycles.find(c=>c.target===0)).toEqual(c);
 await page.getByRole('button',{name:/Target 1 (static|moving|teleport)/}).click();await page.getByRole('button',{name:'Place stops on map',exact:true}).click();
 await page.keyboard.down('Space');await page.mouse.move(...at([20,130]));await page.mouse.down();await page.mouse.move(...at([40,150]));await page.mouse.up();await page.keyboard.up('Space');
 expect((await saved()).targetCycles.find(c=>c.target===0)).toEqual(c);await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.locator('#route-placement')).toBeHidden();
 await expect(page.locator('#test')).toBeEnabled();
});

test('new platform renders its native texture, follows the timeline and resizes on both axes',async({page})=>{
 await page.evaluate(()=>{window.nativeDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(this.canvas.id==='scene'&&image instanceof HTMLCanvasElement&&image.width===384)window.nativeDraws.push(args);return draw.call(this,image,...args);};});
 await page.locator('#add-platform').click();
 const first=await page.evaluate(()=>window.nativeDraws.at(-1));expect(first).toHaveLength(4);expect(first[2]).toBeGreaterThan(10);expect(first[3]).toBeGreaterThan(2);
 await page.getByLabel('Width',{exact:true}).fill('64');await page.getByLabel('Width',{exact:true}).press('Tab');
 const resized=await page.evaluate(()=>window.nativeDraws.at(-1));expect(resized[2]).toBeCloseTo(first[2]*2,4);expect(resized[3]).toBeCloseTo(first[3]*2,4);
 await page.locator('#frame').fill('120');await page.locator('#frame').dispatchEvent('input');const moved=await page.evaluate(()=>window.nativeDraws.at(-1));expect(moved[0]).toBeGreaterThan(resized[0]);expect(moved[2]).toBeCloseTo(resized[2],4);
 await page.screenshot({path:'build/editor/addition-platform.png',fullPage:true});
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#object-list')).toContainText('New moving platform');
});

for(const object of ['platform','Zapdos'])test(`map routes for ${object} retain destinations when switching motion type`,async({page})=>{
 if(object==='platform')await page.locator('#add-platform').click();else await page.getByRole('button',{name:/Zapdos generator pass bumper/}).click();
 await page.getByLabel('Movement',{exact:true}).selectOption('moving');await page.getByRole('button',{name:'Clear stops',exact:true}).click();await page.getByRole('button',{name:'Place stops on map',exact:true}).click();
 const bounds=await page.evaluate(async()=> (await(await fetch('/editor/data/Pk.json')).json()).artBounds),rect=await page.locator('#scene').boundingBox(),[l,t,r,b]=bounds,scale=Math.min((rect.width-65)/(r-l),(rect.height-65)/(t-b));
 const at=([x,y])=>[rect.x+rect.width/2+(x-(l+r)/2)*scale,rect.y+rect.height/2-(y-(t+b)/2)*scale];
 await page.mouse.click(...at([-120,180]));await page.mouse.click(...at([120,230]));
 const saved=()=>page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Pk'))),get=p=>object==='platform'?p.additions.at(-1):p.mechanisms[1];
 let m=get(await saved());expect(m.motion.keys).toHaveLength(4);expect(m.motion.keys[1].slice(1)).toEqual([-120,180]);expect(m.motion.keys[2].slice(1)).toEqual([120,230]);
 await page.mouse.move(...at([-120,180]));await page.mouse.down();await page.mouse.move(...at([-100,200]),{steps:4});await page.mouse.up();await page.getByRole('button',{name:'Done',exact:true}).click();
 const keys=get(await saved()).motion.keys;expect(keys[1].slice(1)).toEqual([-100,200]);await page.getByLabel('Movement',{exact:true}).selectOption('teleport');expect(get(await saved()).motion.keys).toEqual(keys);
 await page.getByLabel('Loop length (frames)').fill('600');await page.getByLabel('Loop length (frames)').press('Tab');m=get(await saved());expect(m.motion.keys.map(k=>k[0])).toEqual([0,200,400,600]);
 await expect(page.locator('#test')).toBeEnabled();await page.reload();await expect(page.locator('#loading')).toBeHidden();expect(get(await saved())).toEqual(m);
 if(object==='platform')await page.getByRole('button',{name:/New moving platform teleport/}).click();else await page.getByRole('button',{name:/Zapdos generator pass teleport/}).click();
 await page.getByLabel('Movement',{exact:true}).selectOption('authored');expect(get(await saved()).motion).toBeUndefined();
});

test('Luigi furniture uses complete sprites and preserves edited drafts',async({page})=>{
 await page.selectOption('#stage','Lg');await expect(page.locator('#loading')).toBeHidden();
 await page.getByRole('button',{name:/Manor piano collision/}).click();await expect(page.locator('#selection-title')).toHaveText('Manor piano');
 await page.getByLabel('X',{exact:true}).fill('70');await page.getByLabel('X',{exact:true}).press('Tab');
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.getByRole('button',{name:/Manor piano collision/}).click();await expect(page.getByLabel('X',{exact:true})).toHaveValue('70');
 await page.screenshot({path:'build/editor/scenery/Lg-editor.png',fullPage:true});
});

test('wide terrain keeps continuous texture joins, end caps and original texel density',async({page})=>{
 const result=await page.evaluate(async()=>{
  const {drawPiece,textureStrips}=await import('/editor/pieces.js');
  const source=document.createElement('canvas');source.width=100;source.height=100;const paint=source.getContext('2d');
  for(let x=0;x<100;x++){paint.fillStyle=`rgb(${x+20},80,100)`;paint.fillRect(x,0,1,100);}
  const canvas=document.createElement('canvas');canvas.width=300;canvas.height=180;const ctx=canvas.getContext('2d');
  drawPiece(ctx,source,[0,100,100,0],[[0,100],[250,180],[270,0],[0,0]],[0,100,100,0],([x,y])=>[x,180-y],100);
  const pixels=Array.from(ctx.getImageData(0,140,270,1).data);ctx.clearRect(0,0,300,180);
  drawPiece(ctx,source,[0,100,100,0],[[0,180],[270,180],[270,0],[0,0]],[0,100,100,0],([x,y])=>[.37+x*1.037,180-y],100);
  return {strips:textureStrips(270,100),pixels,fractional:Array.from(ctx.getImageData(2,140,275,1).data)};
 });
 for(const [a,b,u,v] of result.strips)expect(b-a).toBeCloseTo(Math.abs(v-u)*100,7);
 for(let i=1;i<result.strips.length;i++)expect(result.strips[i][2]).toBeCloseTo(result.strips[i-1][3],7);
 expect(result.strips[0][2]).toBe(0);expect(result.strips.at(-1)[3]).toBe(1);
 // Real pixels must have no color jump or transparent crack at a repeat.
 for(let x=1;x<265;x++){expect(result.pixels[x*4+3]).toBe(255);expect(Math.abs(result.pixels[x*4]-result.pixels[(x-1)*4])).toBeLessThanOrEqual(2);}
 for(let x=1;x<274;x++){expect(result.fractional[x*4+3]).toBe(255);expect(Math.abs(result.fractional[x*4]-result.fractional[(x-1)*4])).toBeLessThanOrEqual(2);}
});

test('Bowser fireballs turn smoothly around the apex in the preview',async({page})=>{
 await page.selectOption('#stage','Kp');await expect(page.locator('#loading')).toBeHidden();
 await page.evaluate(()=>{window.fireAngles=[];const original=CanvasRenderingContext2D.prototype.rotate;CanvasRenderingContext2D.prototype.rotate=function(angle){if(this.canvas.id==='scene')window.fireAngles.push(angle);return original.call(this,angle);};});
 const angles=async frame=>page.evaluate(f=>{window.fireAngles=[];const input=document.querySelector('#frame');input.value=String(f);input.dispatchEvent(new Event('input'));return window.fireAngles;},frame);
 expect((await angles(24))[0]).toBeCloseTo(0,5);
 expect((await angles(88))[0]).toBeCloseTo(Math.PI/2,5);
 expect((await angles(152))[0]).toBeCloseTo(Math.PI,5);
});

test('retail bumper animates both colors and keeps rectangular dimensions after reload',async({page})=>{
 await page.getByRole('button',{name:'+ Bumper',exact:true}).click();
 await page.getByLabel('Width',{exact:true}).fill('640');await page.getByLabel('Width',{exact:true}).press('Tab');
 await page.getByLabel('Height',{exact:true}).fill('640');await page.getByLabel('Height',{exact:true}).press('Tab');
 await expect(page.getByLabel('Width',{exact:true})).not.toHaveAttribute('max');
 await expect(page.getByLabel('Height',{exact:true})).not.toHaveAttribute('max');
 await expect(page.getByLabel('Bumper color')).toHaveCount(0);
 await page.reload();await expect(page.locator('#loading')).toBeHidden();
 await page.getByRole('button',{name:/Bumper bumper/}).click();
 await expect(page.getByLabel('Width',{exact:true})).toHaveValue('640');await expect(page.getByLabel('Height',{exact:true})).toHaveValue('640');
 await expect(page.locator('#test')).toBeEnabled();
 const corners=await page.evaluate(async()=>{const {loadNative,nativeImage}=await import('/editor/native-preview.js');const m=await loadNative('/editor/data/models/Fx-add-bumper.json'),c=document.createElement('canvas');c.width=c.height=384;const ctx=c.getContext('2d');return [0,1].map(frame=>{ctx.clearRect(0,0,384,384);ctx.drawImage(nativeImage(m,frame),0,0);return [[10,10],[373,10],[10,373],[373,373]].map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]);});});
 expect(corners).toEqual([[255,255,255,255],[255,255,255,255]]);
 const frames=await page.evaluate(async()=>{const {loadNative,nativeImage}=await import('/editor/native-preview.js');const m=await loadNative('/editor/data/models/Fx-add-bumper.json');return [nativeImage(m,0).toDataURL(),nativeImage(m,1).toDataURL(),nativeImage(m,2).toDataURL()];});
 expect(frames[0]).not.toBe(frames[1]);expect(frames[0]).toBe(frames[2]);
});

test('four side handles move paired corners, preserve corner editing and persist undoable changes',async({page})=>{
 const data=await page.evaluate(async()=> (await fetch('/editor/data/Pk.json')).json()),p=structuredClone(data.project);
 p.solids=[{...p.solids[0],points:[[-80,180],[-20,180],[-20,120],[-80,120]]}];
 // Keep the fixture target outside the rectangle throughout the resize.
 p.targets[3]=[-180,180];p.targetCycles=p.targetCycles.filter(c=>c.target!==3);
 await page.goto('/editor#draft='+encodeURIComponent(JSON.stringify(p)));await expect(page.locator('#loading')).toBeHidden();
 await page.getByRole('button',{name:/Power station foundation 4 vertices/}).click();
 const rect=await page.locator('#scene').boundingBox(),[l,t,r,b]=data.artBounds,scale=Math.min((rect.width-65)/(r-l),(rect.height-65)/(t-b));
 const at=([x,y])=>[rect.x+rect.width/2+(x-(l+r)/2)*scale,rect.y+rect.height/2-(y-(t+b)/2)*scale];
 const saved=()=>page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Pk')));
 const drag=async(from,to,cursor)=>{await page.mouse.move(...at(from));if(cursor)await expect(page.locator('#scene')).toHaveCSS('cursor',cursor);await page.mouse.down();await page.mouse.move(...at(to),{steps:6});await page.mouse.up();};
 await drag([-20,150],[0,157],'ew-resize');expect((await saved()).solids[0].points).toEqual([[-80,180],[0,180],[0,120],[-80,120]]);
 await drag([-40,180],[-34,200],'ns-resize');expect((await saved()).solids[0].points).toEqual([[-80,200],[0,200],[0,120],[-80,120]]);
 // Handles remain visible and usable with the collision overlay disabled.
 await page.locator('#collision-layer').uncheck();
 await drag([-80,160],[-100,167],'ew-resize');await drag([-50,120],[-45,100],'ns-resize');
 const resized=[[-100,200],[0,200],[0,100],[-100,100]];expect((await saved()).solids[0].points).toEqual(resized);
 await drag([-100,200],[-90,210]);expect((await saved()).solids[0].points).toEqual([[-90,210],[0,200],[0,100],[-100,100]]);
 await page.locator('#undo').click();expect((await saved()).solids[0].points).toEqual(resized);
 await page.locator('#undo').click();expect((await saved()).solids[0].points).toEqual([[-100,200],[0,200],[0,120],[-100,120]]);
 await page.locator('#redo').click();await page.reload();await expect(page.locator('#loading')).toBeHidden();
 const after=await saved();expect(after.solids[0].points).toEqual(resized);for(const key of ['targets','platforms','mechanisms','additions','spawn'])expect(after[key]).toEqual(p[key]);
 await page.getByRole('button',{name:/Power station foundation 4 vertices/}).click();await page.screenshot({path:'build/editor/side-handles/editor.png',fullPage:true});
});

test('Falcon accepts a saved 50-frame teleport loop and launches it unchanged',async({page})=>{
 await page.selectOption('#stage','Ca');await expect(page.locator('#loading')).toBeHidden();
 await page.getByRole('button',{name:/Target 1 moving/}).click();await page.getByLabel('Target behavior').selectOption('teleport');
 const period=page.getByLabel('Loop length (frames)',{exact:true});await period.fill('50');await period.press('Tab');
 await expect(page.locator('#validation-count')).toHaveText('Ready to test');await expect(page.locator('#test')).toBeEnabled();
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.getByRole('button',{name:/Target 1 teleport/}).click();await expect(period).toHaveValue('50');
 let sent;await page.route('**/api/editor/test',r=>{sent=r.request().postDataJSON();return r.fulfill({json:{status:'started'}});});
 await page.locator('#test').click();await expect(page.locator('#toast')).toContainText('Dolphin opened');expect(sent.targetCycles[0].period).toBe(50);expect(sent.targetCycles[0].keys.map(k=>k[0])).toEqual([0,25,50]);
 await period.fill('0');await period.press('Tab');await expect(page.locator('#validation-list')).toContainText('Target 1: loop length');await expect(page.locator('#test')).toBeDisabled();await page.locator('#undo').click();await expect(page.locator('#test')).toBeEnabled();
});

test('DK cargo barrel rolls with edited travel and pauses its spin for teleport motion',async({page})=>{
 await page.selectOption('#stage','Dk');await expect(page.locator('#loading')).toBeHidden();
 await page.evaluate(()=>{window.rollAngles=[];const old=CanvasRenderingContext2D.prototype.rotate;CanvasRenderingContext2D.prototype.rotate=function(a){if(this.canvas.id==='scene')window.rollAngles.push(a);return old.call(this,a);};});
 const angles=frame=>page.evaluate(f=>{window.rollAngles=[];const slider=document.querySelector('#frame');slider.value=f;slider.dispatchEvent(new Event('input'));return window.rollAngles;},frame);
 const first=await angles(90);expect(first).toHaveLength(1);expect(first[0]).toBeGreaterThan(1);expect((await angles(270))[0]).toBeCloseTo(0);
 await page.getByRole('button',{name:/Traversing cargo barrel bumper/}).click();await page.getByLabel('Travel X').fill('116');await page.getByLabel('Travel X').press('Tab');expect((await angles(90))[0]).toBeCloseTo(2*first[0]);
 await page.getByLabel('Movement',{exact:true}).selectOption('teleport');expect((await angles(90))[0]).toBeCloseTo(0);
});

test('Fox red bumper loads with an older palette and resizes on the canvas',async({page})=>{
 await page.route('**/editor/data/models/additions.json',async route=>{const response=await route.fetch(),catalog=await response.json();delete catalog.Fx['bumper-red'];await route.fulfill({json:catalog});});
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.selectOption('#stage','Fx');await expect(page.locator('#loading')).toBeHidden();
 await page.evaluate(async()=>{const store=(await import('/editor/storage.js')).drafts;const p=JSON.parse(await store.get('ttrc-editor-v1:Fx'));p.additions.push({kind:'bumper',variant:'red',name:'Red Fox bumper',x:0,y:100,width:32,height:32,dx:0,dy:0,period:240,hold:30});await store.set('ttrc-editor-v1:Fx',JSON.stringify(p));});await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.getByRole('button',{name:/Bumper bumper/}).click();for(const [key,value]of [['X','0'],['Y','100'],['Width','32'],['Height','32']]){await page.getByLabel(key,{exact:true}).fill(value);await page.getByLabel(key,{exact:true}).press('Tab');}
 const b=await page.evaluate(async()=> (await(await fetch('/editor/data/Fx.json')).json()).artBounds),rect=await page.locator('#scene').boundingBox(),[l,t,r,bt]=b,scale=Math.min((rect.width-65)/(r-l),(rect.height-65)/(t-bt));
 const at=([x,y])=>[rect.x+rect.width/2+(x-(l+r)/2)*scale,rect.y+rect.height/2-(y-(t+bt)/2)*scale];
 const pixel=await page.locator('#scene').evaluate((canvas,p)=>{const dpr=devicePixelRatio;return [...canvas.getContext('2d').getImageData(p[0]*dpr,p[1]*dpr,1,1).data];},[at([16,84])[0]-rect.x,at([16,84])[1]-rect.y]);
 expect(pixel[0]).toBeGreaterThan(230);expect(pixel[1]).toBeGreaterThan(230);expect(pixel[2]).toBeGreaterThan(230);expect(pixel[3]).toBe(255);
 await page.mouse.move(...at([32,84]));await page.mouse.down();await page.mouse.move(...at([56,84]),{steps:5});await page.mouse.up();await expect(page.getByLabel('Width',{exact:true})).toHaveValue('56');await expect(page.getByLabel('Height',{exact:true})).toHaveValue('32');await expect(page.getByLabel('Bumper color')).toHaveCount(0);
 await page.locator('#undo').click();await page.getByRole('button',{name:/Bumper bumper/}).click();await expect(page.getByLabel('Width',{exact:true})).toHaveValue('32');
 await page.locator('#redo').click();await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.getByRole('button',{name:/Bumper bumper/}).click();await expect(page.getByLabel('Width',{exact:true})).toHaveValue('56');
 await page.screenshot({path:'build/editor/fox-bumper/editor.png',fullPage:true});
});

test('basic bricks and wood are available for all characters, save and resize',async({page})=>{
 for(const stage of await page.locator('#stage option').evaluateAll(es=>es.map(e=>e.value))){await page.selectOption('#stage',stage);await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#piece-library button').filter({hasText:'Brick block'})).toBeVisible();await expect(page.locator('#piece-library button').filter({hasText:'Wood platform'})).toBeVisible();}
 await page.selectOption('#stage','Gw');await expect(page.locator('#loading')).toBeHidden();await page.locator('#add-solid').click();await expect(page.locator('#selection-title')).toHaveText('Brick block');await page.locator('#add-floor').click();await expect(page.locator('#selection-title')).toHaveText('Wood platform');await page.getByLabel('Width',{exact:true}).fill('150');await page.getByLabel('Width',{exact:true}).press('Tab');await page.reload();await expect(page.locator('#loading')).toBeHidden();
 const p=await page.evaluate(async()=>JSON.parse(await(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:Gw')));expect(p.solids.at(-1).asset).toBe('basic-brick');expect(p.platformAssets.at(-1)).toBe('basic-wood');expect(p.platforms.at(-1)[2]).toBe(150);
});
test('native aircraft are visible, selectable and do not mutate the saved stage',async({page})=>{
 for(const [stage,name]of [['Fx','Corneria Arwing'],['Fc','Star Wolf Wolfen']]){await page.selectOption('#stage',stage);await expect(page.locator('#loading')).toBeHidden();const before=await page.evaluate(async s=>(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:'+s),stage);await page.locator('#object-list button').filter({hasText:name}).click();await expect(page.locator('#selection-title')).toHaveText(name);await expect(page.locator('#selection-note')).toContainText('model preview');expect(await page.evaluate(async s=>(await import('/editor/storage.js')).drafts.get('ttrc-editor-v1:'+s),stage)).toBe(before);}
});

test('all-level export and Dolphin build retain changes from multiple characters',async({page})=>{
 let submitted;await page.route('**/api/editor/build-all',async r=>{submitted=r.request().postDataJSON();await r.fulfill({json:{status:'started'}});});
 const expected={};
 for(const stage of ['Fx','Mr']){await page.selectOption('#stage',stage);await expect(page.locator('#loading')).toBeHidden();await page.getByRole('button',{name:/Target 1 static/}).click();const x=page.getByLabel('X',{exact:true});expected[stage]=Number(await x.inputValue())+2;await x.fill(String(expected[stage]));await x.press('Tab');}
 const download=page.waitForEvent('download');await page.locator('#export-all').click();const file=await download;expect(file.suggestedFilename()).toBe('Custom-Melee-BTT-all-levels.json');
 await page.locator('#build-all').click();await expect(page.locator('#toast')).toContainText('26 levels built');expect(submitted.format).toBe('TTRC_STAGE_PACK');expect(submitted.projects).toHaveLength(26);
 for(const stage of ['Fx','Mr'])expect(submitted.projects.find(p=>p.stage===stage).targets[0][0]).toBe(expected[stage]);
 const all=submitted;await page.evaluate(async()=>{const store=(await import('/editor/storage.js')).drafts;for(const stage of [...document.querySelectorAll('#stage option')].map(o=>o.value))await store.remove('ttrc-editor-v1:'+stage);localStorage.clear();});await page.reload();await expect(page.locator('#loading')).toBeHidden();
 await page.locator('#project-file').setInputFiles(await file.path());await expect(page.locator('#toast')).toContainText('26 levels imported');
 await page.locator('#build-all').click();await expect(page.locator('#toast')).toContainText('26 levels built');expect(submitted.projects).toEqual(all.projects);
});
test('web all-level transfer opens a full pack in the companion without launching',async({page})=>{
 await page.unroute('**/api/editor/status');await page.route('**/api/editor/status',r=>r.fulfill({json:{available:false}}));await page.reload();await expect(page.locator('#loading')).toBeHidden();
 await page.context().route('http://localhost:4317/**',r=>r.fulfill({contentType:'text/html',body:'Companion'}));const popup=page.waitForEvent('popup');await page.locator('#build-all').click();const local=await popup;await local.waitForLoadState();const pack=JSON.parse(decodeURIComponent(new URL(local.url()).hash.slice(7)));expect(pack.format).toBe('TTRC_STAGE_PACK');expect(pack.projects).toHaveLength(26);
});
