import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AccountSession,SITE_ORIGIN} from '../shared/account-session.mjs';
import {WorldsClient} from '../desktop/worlds-online.mjs';
import {CompanionAccount} from '../server/account.mjs';
const player=(n='a',origin=SITE_ORIGIN)=>({format:'target-test-player-v1',origin,id:n.repeat(64),token:'f'.repeat(64),displayName:'player_'+n,slug:'player_'+n,connectCode:'TT#12345'});
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'btt-account-'));t.after(()=>rm(root,{recursive:true,force:true}));return {root,path:join(root,'.local/account.json')};}
test('game and companion share sign-in, account switching and logout across restarts',async t=>{
 const {root,path}=await fixture(t),session=new AccountSession(path);
 const game=new WorldsClient({root,course:{accountFile:path},fetcher:async()=>new Response('{}')});
 await game.saveIdentity(player());assert.deepEqual(await session.load(),player());
 // Use the actual companion approval consumer with its shared-session callback.
 const id='b'.repeat(64),deviceSecret='c'.repeat(64),key='d'.repeat(64);
 const companion=new CompanionAccount({origin:SITE_ORIGIN,accept:file=>session.save(file),signOut:()=>session.clear(),fetcher:async url=>new Response(JSON.stringify(url.endsWith('/start')?{id,deviceSecret,url:SITE_ORIGIN+'/login.html#request='+id+'&key='+key,expires:Date.now()+60000}:url.endsWith('/poll')?{status:'connected',playerFile:player('b')}:{ok:true}))});
 await companion.start();await companion.poll();await game.load();assert.deepEqual(game.identity,player('b'));
 const restarted=new WorldsClient({root,course:{accountFile:path}});await restarted.load();assert.deepEqual(restarted.identity,player('b'));
 await companion.logout();await game.load();assert.equal(game.identity,null);
 await game.saveIdentity(player());await game.handle({op:5});assert.equal(await session.load(),null);
 assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{signedOut:true});
});
test('migration keeps an existing game login from the old domain, and logout cannot resurrect it',async t=>{
 const {root,path}=await fixture(t),legacy=join(root,'legacy.json');
 await writeFile(legacy,JSON.stringify(player('a','https://target-test-randomizer-challenge.vercel.app')));
 const session=new AccountSession(path,{legacy:[legacy]});
 assert.deepEqual(await session.load(),player());assert.equal(JSON.parse(await readFile(path,'utf8')).origin,SITE_ORIGIN);
 await session.clear();assert.equal(await new AccountSession(path,{legacy:[legacy]}).load(),null);
});
test('session does not migrate foreign domains or overwrite a present invalid session',async t=>{
 const {root,path}=await fixture(t),legacy=join(root,'legacy.json');
 await writeFile(legacy,JSON.stringify(player('a','https://untrusted.example')));
 const session=new AccountSession(path,{legacy:[legacy]});assert.equal(await session.load(),null);
 await assert.rejects(session.save(player('a','https://untrusted.example')),/Invalid account/);
 await writeFile(legacy,JSON.stringify(player()));await mkdir(join(root,'.local'),{recursive:true});await writeFile(path,'broken');
 assert.equal(await session.load(),null);
});

test('native companion action requires the shared login and only opens the configured installation',async t=>{
 const {root,path}=await fixture(t),course={accountFile:path,companionRoot:root,companionPort:44319},opened=[];
 const game=new WorldsClient({root,course,fetcher:async()=>{throw Error('Companion action must stay local');},openCompanion:async value=>opened.push(value)});
 const q={op:10,address:0x81000000,sequence:1,url:'https://untrusted.example'};
 let reply=Buffer.from((await game.handle(q)).bytes,'base64');assert.equal(reply.readUInt32BE(0),1);assert.equal(opened.length,0);
 await game.saveIdentity(player());reply=Buffer.from((await game.handle(q)).bytes,'base64');assert.equal(reply.readUInt32BE(0),0);assert.deepEqual(opened,[course]);
 game.openCompanion=async()=>{throw Error('Private system error');};reply=Buffer.from((await game.handle(q)).bytes,'base64');assert.equal(reply.readUInt32BE(0),1);assert.match(reply.toString('ascii'),/Companion could not open/);assert.ok(!reply.includes(Buffer.from('Private system error')));
});
