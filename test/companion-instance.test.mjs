import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {instanceId,companionRunning,checkCompanionPort,claimCompanion} from '../server/companion-instance.mjs';
import {createApp} from '../server/app.mjs';

test('a companion allows its own Dolphin startup but rejects another installation or service',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ttrc-instance-')),other=await mkdtemp(join(tmpdir(),'ttrc-other-'));
 t.after(()=>Promise.all([rm(root,{recursive:true,force:true}),rm(other,{recursive:true,force:true})]));
 const server=createApp({instance:await instanceId(root)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port;
 assert.equal(await companionRunning(root,port),true);
 await checkCompanionPort(root,port);
 await assert.rejects(checkCompanionPort(other,port),/another application/);
 const unrelated=createServer((req,res)=>res.end('unrelated'));
 await new Promise(resolve=>unrelated.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>unrelated.close(resolve)));
 await assert.rejects(checkCompanionPort(root,unrelated.address().port),/another application/);
});

test('simultaneous companion starters have one owner and can restart after quitting',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ttrc-lock-'));await mkdir(join(root,'.local'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const claims=await Promise.all([claimCompanion(root),claimCompanion(root),claimCompanion(root)]);
 assert.equal(claims.filter(Boolean).length,1);
 await claims.find(Boolean)();
 const release=await claimCompanion(root);assert.equal(typeof release,'function');await release();
 // Recover a lock left behind by a terminated process.
 await writeFile(join(root,'.local/companion.lock'),'2147483647');
 const recovered=await claimCompanion(root);assert.equal(typeof recovered,'function');await recovered();
 await writeFile(join(root,'.local/companion.lock'),'');await utimes(join(root,'.local/companion.lock'),new Date(0),new Date(0));
 const empty=await claimCompanion(root);assert.equal(typeof empty,'function');await empty();
});

test('quit requires a same-origin explicit action and runs after the response is sent',async t=>{
 let quits=0;const server=createApp({quit:()=>{quits++;}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 for(const headers of [{},{Origin:'https://example.com','X-TTRC-Action':'quit'},{Origin:origin}])assert.equal((await fetch(origin+'/api/quit',{method:'POST',headers})).status,403);
 assert.equal(quits,0);
 const response=await fetch(origin+'/api/quit',{method:'POST',headers:{Origin:origin,'X-TTRC-Action':'quit'}});
 assert.deepEqual(await response.json(),{ok:true});assert.equal(quits,1);
});
