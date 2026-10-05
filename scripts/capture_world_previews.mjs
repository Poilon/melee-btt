// Capture the published editor geometry and its actual bundled models/artwork.
// This does not synthesize illustrations or read the author's browser drafts.
import {WORLD_CHARACTERS} from '../shared/worlds.mjs';
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createApp} from '../server/app.mjs';
import {createHash} from 'node:crypto';
const pack=JSON.parse(await readFile(new URL('../web/editor/published-levels.json',import.meta.url)));
const output=new URL('../build/current-previews/',import.meta.url);await mkdir(output,{recursive:true});
const server=createApp({});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1200,height:750},deviceScaleFactor:1,bypassCSP:true});
 await page.route('**/editor/editor.js*',async route=>{
  const source=await readFile(new URL('../web/editor/editor.js',import.meta.url),'utf8');
  await route.fulfill({contentType:'text/javascript',body:source+`
window.capturePublishedPreview=()=>{
 const path=drawPath,text=ctx.fillText;selection=null;playing=false;frame=0;
 $('collision-layer').checked=false;$('snap').checked=false;
 // Hide editing guides while keeping the actual terrain, targets and actors.
 drawPath=(points,color,width,fill,dashed)=>{if(fill)path(points,color,width,fill,dashed);};ctx.fillText=()=>{};
 try{fit();draw();return {image:canvas.toDataURL('image/png'),stage:project.stage,project,character:base.character};}
 finally{drawPath=path;ctx.fillText=text;}
};`});
 });
 await page.goto(origin+'/editor');await page.locator('#loading').waitFor({state:'hidden'});
 await page.addStyleTag({content:'header,.library,.inspector,.tools,.timeline,.legend{display:none!important}main,.viewport,#canvas-wrap{position:absolute!important;inset:0!important;width:1200px!important;height:750px!important;margin:0!important;padding:0!important;border:0!important;display:block!important}body{overflow:hidden}'});
 const shots=[];
 for(const character of WORLD_CHARACTERS){
  const p=pack.projects.find(p=>p.stage===character.suffix);
  if(!p)throw Error('Missing published stage: '+character.suffix);
  await page.selectOption('#stage',p.stage,{force:true});await page.locator('#loading').waitFor({state:'hidden'});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const shot=await page.evaluate(()=>window.capturePublishedPreview());
  if(JSON.stringify(shot.project)!==JSON.stringify(p))throw Error('Preview did not use published project: '+p.stage);
  await writeFile(new URL(p.stage+'.png',output),Buffer.from(shot.image.split(',')[1],'base64'));shots.push(shot);console.log('Captured',p.stage,shot.character);
 }
 const gallery=await browser.newPage({viewport:{width:1600,height:1600},deviceScaleFactor:1});
 async function sheet(items,columns,path){
  await gallery.setContent('<style>*{box-sizing:border-box}body{margin:0;background:#101016;color:#eee;font:17px system-ui}main{padding:12px}header{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-weight:700;font-size:20px}header span{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#ffdb91;border:1px solid #b99755;border-radius:4px;padding:3px 6px}section{display:grid;gap:12px;grid-template-columns:repeat('+columns+',1fr)}figure{margin:0;overflow:hidden;border-radius:6px;background:#1b202a}img{width:100%;display:block}figcaption{padding:9px 12px}</style><main><header>Custom Melee BTT <span>Beta</span></header><section></section></main>');
  await gallery.evaluate(items=>{const root=document.querySelector('section');for(const item of items){const f=document.createElement('figure'),img=document.createElement('img'),c=document.createElement('figcaption');img.src=item.image;c.textContent=item.character;f.append(img,c);root.append(f);}},items);
  await gallery.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  await gallery.locator('main').screenshot({path});
 }
 await sheet(shots,4,'assets/custom-stages/character-worlds-all.png');
 await gallery.setViewportSize({width:1000,height:1200});
 await sheet(shots.slice(0,6),2,'assets/custom-stages/character-worlds.png');
 await writeFile('assets/custom-stages/luigis-mansion.png',Buffer.from(shots.find(s=>s.stage==='Lg').image.split(',')[1],'base64'));
 await writeFile(new URL('manifest.json',output),JSON.stringify({packSha256:createHash('sha256').update(JSON.stringify(pack)).digest('hex'),stages:shots.map(s=>s.stage),source:'Published level projects rendered with the editor terrain and native model renderer'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
