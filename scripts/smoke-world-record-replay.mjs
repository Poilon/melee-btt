import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import records from '../shared/ntsc-world-records.json' with { type: 'json' };
import { browserBttCatalog } from '../shared/browser-btt-catalog.mjs';
const origin=process.env.TEST_URL || 'http://localhost:4331';
const browser=await chromium.connectOverCDP(process.env.RECONSTRUCTION_CDP || 'http://localhost:9333', {timeout:60000});
try {
for (const record of records.records.filter(r => r.reconstruction)) {
const context=await browser.newContext({viewport:{width:1440,height:1100}});
try {
 const page=await context.newPage(), errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const character=browserBttCatalog.find(c => c.fighter === record.stage);
 await page.goto(origin+'/#'+character.slug);
 const watch=page.locator(`#world-record-rows a[href="/play?worldRecord=${record.stage}"]`);
 await watch.waitFor();
 const text=await page.locator('#world-record-rows').textContent();
 assert.ok(text.includes(records.holders[record.holders[0]].name));
 assert.ok(text.includes(record.time));
 assert.ok(text.includes('Watch reconstruction'));
 const file=page.locator('#world-record-rows a[download]');
 assert.match(await file.getAttribute('href'),/^\/world-record-replays\/[a-f0-9]{64}\.slp$/);
 await watch.click();
 await page.waitForFunction(()=>globalThis.meleeDebug?.state?.[8]===0,null,{timeout:120000});
 const state=await page.evaluate(()=>({frame:meleeDebug.frame,state:meleeDebug.state}));
 assert.equal(state.state[10],record.frames);
 assert.match(await page.locator('#scoring-status').textContent(),/Video reconstruction/);
 assert.deepEqual(errors,[]);
 console.log(`${character.name}: WR leaderboard → Watch reconstruction → all 10 targets in ${record.time}, no page errors.`);
 await page.screenshot({path:`.local/world-record-${character.slug}-replay.png`,fullPage:true});
} finally { await context.close(); }
}
} finally { await browser.close(); }
