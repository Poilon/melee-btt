import {test,expect} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {WorldHistory} from '../server/world-history.mjs';
import {ScoreStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {generateChallenge} from '../src/challenge.mjs';
import {defaultPlaySettings} from '../shared/play-settings.mjs';
import {sha256} from '../shared/worlds.mjs';
test('companion displays actual authored runs, Sheik history, tabs, replay actions and 26-character progress',async({page})=>{
 const root=await mkdtemp(join(tmpdir(),'btt-browser-worlds-')),bundle=join(root,'bundle'),playerId='a'.repeat(64),courseId='b'.repeat(64),calls=[];
 let server,store;
 try{
  await mkdir(join(bundle,'.local/world-runs'),{recursive:true});await mkdir(join(bundle,'Replays'));
  await writeFile(join(bundle,'course.json'),JSON.stringify({courses:[{id:courseId,character:'sheik'}]}));
  const bytes=Buffer.from('fixture replay');await writeFile(join(bundle,'Replays/test.slp'),bytes);
  const bestId=randomUUID();let i=0;
  for(const override of [{id:bestId,frames:600},{frames:1200},{status:'aborted',frames:undefined,reason:'Reset or changed run'}]){
   const r={id:randomUUID(),playerId,courseId,character:'sheik',startedAt:Date.now()-60000+i++,finishedAt:Date.now()-50000+i,submitted:true,replaySha256:sha256(bytes),...override};await writeFile(join(bundle,'.local/world-runs',r.id+'.json'),JSON.stringify(r));
  }
  const generated=await generateChallenge({seed:20260989}),identity={id:playerId,displayName:'fixture_player',slug:'fixture_player'};store=new ScoreStore(':memory:');
  server=createApp({challenge:generated.manifest,gecko:generated.gecko,store,getIdentity:async()=>identity,getCapture:()=>({status:'waiting',native:true,replayEnabled:true}),getPlaySettings:defaultPlaySettings,replays:{},remote:{status:()=>({available:true,paired:true,pending:0})},worldHistory:new WorldHistory({root,bundle,openReplay:async(...args)=>calls.push(args)})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await expect(page.locator('#total-attempts')).toHaveText('3');await expect(page.locator('#finished-attempts')).toHaveText('2');await expect(page.locator('#progress-count')).toContainText('/ 26 cleared');
  await page.getByRole('button',{name:'Sheik: show run history'}).click();await expect(page.locator('.attempt-history .run')).toHaveCount(3);
  await expect(page.locator('.attempt-history')).toContainText('Aborted');await expect(page.locator('.attempt-history')).toContainText('Reset or changed run');
  await page.locator('.best-attempt').getByRole('button',{name:'Watch replay'}).click();await expect.poll(()=>calls.length).toBe(1);expect(calls[0][1].id).toBe(courseId);
  await expect(page.getByRole('button',{name:'Share Sheik run'})).toHaveCount(0);
  await page.locator('#tab-ready').click();await expect(page.locator('#empty-title')).toHaveText('No runs in this tab.');await expect(page.locator('#empty-description')).not.toContainText('Sign in');
  await page.locator('#tab-sent').click();await expect(page.getByRole('button',{name:'Sheik: hide run history'})).toBeVisible();
  const invalid=await page.request.post(origin+'/api/runs/replay/launch',{headers:{Origin:origin,'X-TTRC-Action':'launch'},data:{id:randomUUID()}});expect(invalid.status()).toBe(400);
  const dashboard=await(await page.request.get(origin+'/api/dashboard?character=sheik')).json();expect(dashboard.personalBest.frames).toBe(600);expect(dashboard.scope).toBe('worlds');expect(dashboard.history).toHaveLength(2);
  expect(errors).toEqual([]);
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}store?.close();await rm(root,{recursive:true,force:true});}
});
