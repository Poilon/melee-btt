import test from 'node:test';import assert from 'node:assert/strict';
import {ensureGameIso} from '../desktop/iso-setup.mjs';
test('every launch hashes the remembered ISO, with no trust in its previous validation',async()=>{
 let checks=0;const options={root:'test',remembered:'melee.iso',verify:async path=>{assert.equal(path,'melee.iso');checks++;},select:async()=>{throw Error('Unexpected prompt');}};
 assert.equal(await ensureGameIso(options),'melee.iso');assert.equal(await ensureGameIso(options),'melee.iso');assert.equal(checks,2);
});
test('missing or changed saved ISO blocks launch until a selected replacement passes verification',async()=>{
 const checked=[];
 const iso=await ensureGameIso({root:'test',remembered:'gone.iso',verify:async path=>{checked.push(path);if(path==='gone.iso')throw Error('Wrong checksum');},select:async()=> 'new.iso'});
 assert.equal(iso,'new.iso');assert.deepEqual(checked,['gone.iso','new.iso']);
 await assert.rejects(ensureGameIso({root:'test',select:async()=> 'fake.iso',verify:async()=>{throw Error('Wrong checksum');}}),/checksum/);
});
test('cancelling initial or missing-file setup never launches or saves an ISO',async()=>{
 assert.equal(await ensureGameIso({root:'test',select:async()=>null,verify:async()=>{throw Error('Should not verify');}}),null);
 assert.equal(await ensureGameIso({root:'test',remembered:'missing.iso',select:async()=>null,verify:async()=>{throw Error('Missing');}}),null);
});
