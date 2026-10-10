import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const origin=process.env.TEST_URL || 'http://localhost:4331';
const browser=await chromium.connectOverCDP(process.env.RECONSTRUCTION_CDP || 'http://localhost:9333', {timeout:60000});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
try {
 const page=await context.newPage(), errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/#mario');
 const watch=page.locator('#world-record-rows a[href="/play?worldRecord=8"]');
 await watch.waitFor();
 assert.match(await page.locator('#world-record-rows').textContent(),/sockdude1.*00:07.78.*Watch reconstruction/);
 const file=page.locator('#world-record-rows a[download]');
 assert.match(await file.getAttribute('href'),/^\/world-record-replays\/[a-f0-9]{64}\.slp$/);
 await watch.click();
 await page.waitForFunction(()=>globalThis.meleeDebug?.state?.[8]===0,null,{timeout:120000});
 const state=await page.evaluate(()=>({frame:meleeDebug.frame,state:meleeDebug.state}));
 assert.equal(state.state[10],467);
 assert.match(await page.locator('#scoring-status').textContent(),/Video reconstruction/);
 assert.deepEqual(errors,[]);
 console.log('WR leaderboard → Watch reconstruction → all 10 targets in 7.78, no page errors.');
 await page.screenshot({path:'.local/world-record-mario-replay.png',fullPage:true});
} finally { await context.close(); await browser.close(); }
