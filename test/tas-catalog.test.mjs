import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseBttReplay} from '../shared/browser-btt-replay.mjs';
const entries=JSON.parse(await readFile(new URL('../web/tas-replays/catalog.json',import.meta.url))).entries;
test('curated TAS references remain distinct and only publish checksum-validated complete practice replays',async()=>{
  assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
  for(const entry of entries){
    assert.match(entry.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(entry.label,'TAS');assert.ok(entry.frames>0);assert.match(entry.source,/^https:\/\/www.youtube.com\//);
    if(!entry.replay)continue;
    const r=entry.replay;assert.match(r.sha256,/^[a-f0-9]{64}$/);
    assert.equal(r.downloadUrl,`/tas-replays/${r.sha256}.slp`);
    const bytes=await readFile(new URL('../web'+r.downloadUrl,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);
    const parsed=parseBttReplay(bytes);assert.equal(parsed.fighter,entry.fighter);assert.equal(parsed.frames,entry.frames);
    assert.equal(parsed.engine,r.engine);assert.equal(parsed.complete,true);assert.equal(parsed.practice,true);
    if(entry.kind==='optimization'){
      const baseline=entries.find(candidate=>candidate.id===entry.basedOn);
      assert.ok(baseline?.replay,'Optimization must retain its playable baseline');
      assert.equal(entry.fighter,baseline.fighter);
      assert.equal(r.engine,baseline.replay.engine);
      assert.ok(entry.frames<baseline.frames);
      assert.equal(entry.improvementFrames,baseline.frames-entry.frames);
    }
  }
});
test('site gives TAS references a separate table body and labels playback as TAS',async()=>{
 const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');assert.match(html,/<tbody id="tas-rows"><\/tbody>/);
 const js=await readFile(new URL('../web/browser-board.js',import.meta.url),'utf8');
 assert.match(js,/Watch TAS reconstruction/);assert.match(js,/\/play\?tas=/);assert.match(js,/if \(replay &&/);
});
