import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ScoreStore} from '../server/store.mjs';
import {AutoSubmitter} from '../server/auto-submit.mjs';
import {withPause} from './support/replay-with-pause.mjs';
const bytes=await readFile(new URL('./fixtures/BTTDK.slp',import.meta.url));
const identity={id:'a'.repeat(64),displayName:'Auto',connectCode:'TT#1'},challenge={id:'seed',assignments:{'donkey-kong':'donkey-kong'}},sha='b'.repeat(64);
function setup(t){
 const store=new ScoreStore(':memory:');t.after(()=>store.close());const uploads=[];
 const remote={status:()=>({paired:true}),enqueue:async run=>{uploads.push(run.id);store.setSubmission(run.id,'queued');}};
 const replays={savedBytes:async()=>bytes};
 const auto=new AutoSubmitter({store,replays,remote,challenge,gecko:'',getIdentity:()=>identity});
 const add=frames=>store.add({challenge,identity,character:'donkey-kong',stage:'donkey-kong',frames});
 const link=id=>store.attachReplay(id,sha,'auto.slp');return {store,uploads,auto,add,link,replays,remote};
}
test('auto-submit waits for the best replay, uploads each improvement once and leaves older runs local',async t=>{
 const f=setup(t),old=f.add(1500),best=f.add(1400);f.link(old);
 await f.auto.sync();assert.deepEqual(f.uploads,[]);
 f.link(best);await Promise.all([f.auto.sync(),f.auto.sync()]);await f.auto.sync();assert.deepEqual(f.uploads,[best]);
 const faster=f.add(1300);f.link(faster);await f.auto.sync();assert.deepEqual(f.uploads,[best,faster]);
 assert.equal(f.store.history(challenge.id,identity.id).find(r=>r.id===old).submissionStatus,'local');
});
test('auto-submit excludes pauses and stops on account changes or permanent upload failures',async t=>{
 const f=setup(t),paused=f.add(1400);f.link(paused);f.replays.savedBytes=async()=>withPause(bytes);
 await f.auto.sync();assert.equal(f.uploads.length,0);assert.match(f.store.run(paused,identity.id,challenge.id).exclusionReason,/Paused/);
 const next=f.add(1300);f.link(next);let current=identity;
 f.auto.getIdentity=()=>current;f.replays.savedBytes=async()=>{current={...identity,id:'c'.repeat(64)};return bytes;};
 await f.auto.sync();assert.equal(f.uploads.length,0);
 current=identity;f.replays.savedBytes=async()=>bytes;f.remote.enqueue=async()=>{throw Error('offline');};
 await f.auto.sync();assert.equal(f.store.history(challenge.id,identity.id).find(r=>r.id===next).submissionStatus,'upload-error');
 f.remote.enqueue=async()=>f.uploads.push('unexpected');await f.auto.sync();assert.equal(f.uploads.length,0);
});
