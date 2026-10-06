import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createWorlds} from '../cloud/worlds.mjs';
import {worldCourseId,sha256,worldRulesHash} from '../shared/worlds.mjs';
import {parseMailbox,encodeReply,WorldsClient} from '../desktop/worlds-online.mjs';
const {SlippiGame}=createRequire(import.meta.url)('@slippi/slippi-js');
const replay=await readFile(new URL('fixtures/BTTDK.slp',import.meta.url));
function fixture(){
 const data=new Map();const course={character:'donkey-kong',name:'Jungle Boardwalk',stageSha256:'a'.repeat(64),dolSha256:'b'.repeat(64),rulesSha256:worldRulesHash(Buffer.from(new SlippiGame(replay).getGeckoList().contents)),stageId:36};course.id=worldCourseId(course);
 const store={async get(p){return data.get(p)||null;},async put(p,v){if(data.has(p))throw Error('Exists');data.set(p,v);},async list(prefix){return [...data.keys()].filter(p=>p.startsWith(prefix)).map(pathname=>({pathname}));}};
 const handler=createWorlds({store,catalog:{format:'ttrc-worlds-v1',courses:[course]},bearer:async r=>r.headers.authorization?{id:'c'.repeat(64),username:'player'}:null,json:(r,status,body)=>{r.status=status;r.data=body;}});
 async function req(path,{method='GET',body,auth=false}={}){const result={writeHead(status,headers){this.status=status;this.headers=headers;},end(bytes){this.bytes=bytes;}};const url=new URL('https://test/api/'+path);await handler(url.pathname.slice(5),{method,body,headers:auth?{authorization:'test'}:{}},result,url);return result;}
 return {req,course,data};
}
test('world leaderboards separate exact level/rule revisions, keep best runs, serve attached evidence',async()=>{
 const {req,course,data}=fixture(),id='00000000-0000-0000-0000-000000000001';
 const input={id,courseId:course.id,frames:1066,replay:replay.toString('base64')};
 assert.equal((await req('worlds/submit',{method:'POST',body:input})).status,401);
 assert.equal((await req('worlds/submit',{method:'POST',auth:true,body:{...input,courseId:'d'.repeat(64)}})).status,400);
 assert.equal((await req('worlds/submit',{method:'POST',auth:true,body:input})).status,202);
 assert.equal((await req('worlds/submit',{method:'POST',auth:true,body:input})).status,202);
 assert.equal((await req('worlds/submit',{method:'POST',auth:true,body:{...input,frames:90}})).status,400);
 assert.equal((await req('worlds/submit',{method:'POST',auth:true,body:{...input,id:'00000000-0000-0000-0000-000000000002',frames:1066}})).status,202);
 const board=(await req('worlds/leaderboard?course='+course.id)).data;
 assert.equal(board.rows.length,1);assert.equal(board.rows[0].frames,1066);assert.equal(board.rows[0].username,'player');
 const download=await req(`worlds/replay?course=${course.id}&id=${id}&player=${'c'.repeat(64)}`);
 assert.equal(download.status,200);assert.deepEqual(download.bytes,replay);assert.equal(download.headers['X-TTRC-Course'],course.id);
 data.set(`evidence/old-challenge/${'c'.repeat(64)}/${id}.json`,{base64:replay.toString('base64')});
 assert.equal((await req(`worlds/replay?course=old-challenge&id=${id}&player=${'c'.repeat(64)}`)).status,404);
 assert.equal((await req('worlds/leaderboard?course=../../profiles')).status,404);
});
test('course IDs change with geometry, executable and rules',()=>{
 const c={character:'fox',stageSha256:'a'.repeat(64),dolSha256:'b'.repeat(64),rulesSha256:'c'.repeat(64)};
 for(const field of ['stageSha256','dolSha256','rulesSha256'])assert.notEqual(worldCourseId(c),worldCourseId({...c,[field]:'d'.repeat(64)}));
 assert.throws(()=>worldCourseId({...c,character:'constructor'}));
});
test('native mailbox has bounded replies and no credentials in response',()=>{
 assert.equal(parseMailbox('nonsense'),null);const b=Buffer.alloc(860);b.writeUInt32BE(0x5454524f);b.writeUInt32BE(1,4);b.writeUInt32BE(3,64);b.writeUInt32BE(1,68);b.write('player',84);b.write('secret-password',112);
 const q=parseMailbox('2160000000:'+b.toString('base64'));assert.equal(q.username,'player');assert.equal(q.password,'secret-password');
 const response=Buffer.from(encodeReply({signedIn:true,identity:'player',rows:[{username:'example',frames:1234,rank:1}],total:1}),'base64');
 assert.equal(response.length,596);assert.equal(response.readUInt32BE(4),1);assert.equal(response.readUInt32BE(236+28),1234);assert.ok(!response.includes(Buffer.from('secret-password')));
});
test('replay selection refuses stale leaderboard and never fetches an arbitrary replay URL',async()=>{
 let calls=0;const client=new WorldsClient({root:'/tmp/not-written',course:{},fetcher:async()=>{calls++;throw Error('unexpected');}});
 const result=await client.handle({address:0x81000000,sequence:1,op:4,character:0,offset:0,row:0});
 assert.equal(calls,0);assert.match(Buffer.from(result.bytes,'base64').toString('ascii'),/Refresh this leaderboard first/);
});

test('Gecko fingerprints ignore relocation and music, retain gameplay modifications',()=>{
 const source=Buffer.from('0400000038600001C2000010000000013860000100000000','hex');
 const runtime=Buffer.from(source);runtime.writeUInt32BE(0x4bff0000,runtime.length-4);
 assert.equal(worldRulesHash(source),worldRulesHash(runtime));
 assert.equal(worldRulesHash(source),worldRulesHash(Buffer.concat([Buffer.from('00d0c0de00d0c0de','hex'),source,Buffer.from('04023ffc38800000ff00000000000000','hex')])));
 runtime[7]^=1;assert.notEqual(worldRulesHash(source),worldRulesHash(runtime));
 assert.throws(()=>worldRulesHash(source.subarray(0,-8)),/Truncated/);
});

import {WorldRunDetector} from '../desktop/worlds-capture.mjs';
import {geckoList} from '../desktop/worlds-catalog.mjs';
test('world clear detection rejects aborts, handles restart, separates Sheik, and saves one finish',()=>{
 const results=[],player={id:'player'},courses=[{id:'sheik',character:'sheik',stageId:53},{id:'ic',character:'ice-climbers',stageId:40}];
 const detector=new WorldRunDetector(courses,r=>results.push(r),()=>1000);
 const s={pid:1,major:15,minor:1,characterId:19,stageId:60,frame:1,seconds:0,timerFrame:0,remaining:10,result:0};
 detector.sample(s,player);detector.sample({...s,frame:100,seconds:1,remaining:5,result:7},player);
 detector.sample({...s,frame:101,seconds:1,remaining:0,result:6},player);detector.sample({...s,frame:102,seconds:1,remaining:0,result:6},player);assert.equal(results.length,0);
 detector.sample(s,player);for(let i=0;i<4;i++)detector.sample({...s,frame:110+i,seconds:2,timerFrame:4,remaining:0,result:6},player);
 assert.equal(results.length,1);assert.equal(results[0].character,'sheik');assert.equal(results[0].frames,124);
 detector.sample({...s,characterId:32,stageId:47},player);for(let i=0;i<3;i++)detector.sample({...s,characterId:32,stageId:47,frame:50+i,seconds:3,remaining:0,result:6},player);
 assert.equal(results.length,2);assert.equal(results[1].character,'ice-climbers');
 detector.sample(s,player);detector.sample({...s,frame:20,seconds:1,remaining:0,result:6},{id:'other'});detector.sample({...s,frame:21,seconds:1,remaining:0,result:6},{id:'other'});assert.equal(results.length,2);
});
test('offline Gecko compilation keeps Dolphin global order and local overrides',()=>{
 const global='[Gecko_Enabled]\n$General\n$Online\n[Gecko]\n$General [A]\n04000000 00000001 # note\n$Online\n04000008 00000003\n';
 const local='[Gecko]\n$General\n04000000 000000FF\n$World\n04000004 00000002\n[Gecko_Enabled]\n$World\n[Gecko_Disabled]\n$Online\n';
 assert.equal(geckoList(global,local).toString('hex'),'04000000000000010400000400000002');
});

test('Dolphin opens a bound browser link, polls, persists the account and cancels pairing',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'ttrc-browser-')),origin='https://test.invalid',id='1'.repeat(64),deviceSecret='2'.repeat(64),key='3'.repeat(64),calls=[];
 const file={origin,id:'4'.repeat(64),token:'5'.repeat(64),slug:'browser_player'};let approved=false,opened='';
 const fetcher=async(url,init)=>{calls.push({url,body:JSON.parse(init.body||'{}')});if(url.endsWith('/start'))return Response.json({id,deviceSecret,expires:Date.now()+600000,url:origin+'/login.html#request='+id+'&key='+key});if(url.endsWith('/poll'))return Response.json(approved?{status:'connected',playerFile:file}:{status:'pending'});return Response.json({ok:true});};
 try{
  const client=new WorldsClient({root,course:{},origin,fetcher,openBrowser:async url=>{opened=url;}}),query=op=>client.handle({op,address:0x81000000,sequence:op});
  await query(7);assert.ok(opened.includes(key));assert.ok(!opened.includes(deviceSecret));assert.equal(client.identity,null);
  await query(8);assert.equal(client.identity,null);approved=true;
  const reply=await query(8);assert.equal(Buffer.from(reply.bytes,'base64').readUInt32BE(4),1);assert.equal(client.pendingLogin,null);
  const restarted=new WorldsClient({root,course:{},origin,fetcher});await restarted.load();assert.equal(restarted.identity.slug,'browser_player');
  assert.equal(calls.at(-1).url,origin+'/api/game/connect/cancel');
  await query(5);await query(7);await query(9);assert.equal(client.identity,null);assert.equal(client.pendingLogin,null);
  assert.equal(Buffer.from((await query(8)).bytes,'base64').readUInt32BE(0),1);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Dolphin refuses an external browser URL and reports a browser launch failure',async()=>{
 const origin='https://test.invalid';let opened=0;
 const pending={id:'1'.repeat(64),deviceSecret:'2'.repeat(64),expires:Date.now()+600000,url:'https://evil.test/login.html#request='+'1'.repeat(64)+'&key='+'3'.repeat(64)};
 const client=new WorldsClient({root:'/tmp/not-written',course:{},origin,fetcher:async()=>Response.json(pending),openBrowser:async()=>{opened++;throw Error('Missing browser');}});
 const q={op:7,address:0x81000000,sequence:7};
 assert.equal(Buffer.from((await client.handle(q)).bytes,'base64').readUInt32BE(0),1);assert.equal(opened,0);
 pending.url=pending.url.replace('https://evil.test',origin);
 assert.match(Buffer.from((await client.handle(q)).bytes,'base64').toString('ascii'),/Browser did not open/);assert.equal(client.pendingLogin,null);
});

import {totalWorldStandings} from '../shared/worlds.mjs';
test('UCF controller history is mutable but code and constants remain verified',()=>{
 const code=Buffer.alloc(8+0x54*8);code.writeUInt32BE(0xc206b460);code.writeUInt32BE(0x54,4);code.writeUInt32BE(0x480000b1,8);code.writeUInt32BE(0xbf1c0000,60);code.writeUInt32BE(0x38d1b717,64);code.writeUInt32BE(0x42a00000,68);
 const runtime=Buffer.from(code);runtime.fill(0x61,12,60);assert.equal(worldRulesHash(code),worldRulesHash(runtime));
 for(const offset of [8,60,64,68,72]){const changed=Buffer.from(runtime);changed[offset]^=1;assert.notEqual(worldRulesHash(code),worldRulesHash(changed));}
});
test('total time sums only current PBs, excludes partial sets, and shares tied ranks',()=>{
 const courses=[{id:'fox-new',character:'fox'},{id:'luigi-new',character:'luigi'}];
 const record=(playerId,courseId,frames)=>({playerId,username:playerId,courseId,frames});
 const b=totalWorldStandings([record('a','fox-new',90),record('a','fox-new',100),record('a','luigi-new',110),record('b','fox-new',1),record('b','luigi-old',1),record('c','fox-new',80),record('c','luigi-new',120),record('d','fox-new',110),record('d','luigi-new',110)],courses);
 assert.deepEqual(b.rows.map(r=>[r.playerId,r.frames,r.rank]),[['a',200,1],['c',200,1],['d',220,3]]);assert.equal(b.inProgress[0].completed,1);assert.equal(b.inProgress[0].frames,null);assert.equal(b.requiredCharacters,2);
});
test('total API counts only records from the published set and invalidates after upload',async()=>{
 const {req,course}=fixture();assert.equal((await req('worlds/total')).data.total,0);
 await req('worlds/submit',{method:'POST',auth:true,body:{id:'00000000-0000-0000-0000-000000000001',courseId:course.id,frames:1066,replay:replay.toString('base64')}});
 const b=(await req('worlds/total')).data;assert.equal(b.total,1);assert.equal(b.rows[0].frames,1066);assert.deepEqual(b.courseIds,[course.id]);
});
test('leaderboard reads cancel, cache, refresh, and reject mismatched total versions',async()=>{
 const courses=[{character:'dr-mario',id:'a'.repeat(64)},{character:'mario',id:'b'.repeat(64)}];let calls=0,resolveFirst;
 const fetcher=async url=>{calls++;if(calls===1)return new Promise(r=>{resolveFirst=r;});if(url.includes('/total'))return Response.json({kind:'total',courseIds:courses.map(c=>c.id),total:0,rows:[]});return Response.json({course:courses[1],total:0,rows:[]});};
 const client=new WorldsClient({root:'/tmp/not-written',course:{courses},fetcher});const q={op:3,address:0x81000000,sequence:1,character:0,offset:0,row:0},abort=new AbortController();
 const first=client.handle(q,{signal:abort.signal});abort.abort();await client.handle({...q,character:1,sequence:2});resolveFirst(Response.json({course:courses[0],rows:[],total:0}));await assert.rejects(first);assert.equal(client.board.character,1);
 await client.handle({...q,character:1});assert.equal(calls,2);await client.handle({...q,character:1,row:1});assert.equal(calls,3);
 await client.handle({...q,character:26});assert.equal(client.board.kind,'total');const reply=await client.handle({...q,op:4,character:26});assert.equal(Buffer.from(reply.bytes,'base64').readUInt32BE(0),1);
 client.boardCache.clear();client.course={courses:[]};const bad=await client.handle({...q,character:26});assert.match(Buffer.from(bad.bytes,'base64').toString('ascii'),/Update your levels/);
});

import {WorldCapture} from '../desktop/worlds-capture.mjs';
test('capture retries previously rejected settings and continues after a transient upload error',async t=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'ttrc-recover-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'Replays'));await writeFile(join(root,'Replays/run.slp'),replay);
 const {course}=fixture(),client={identity:{id:'player'},boardCache:new Map([['old',{}]]),request:async()=>{throw Error('Temporary outage');}},capture=new WorldCapture({root,course:{courses:[course]},client,scoreCutoff:0});
 const run={id:'00000000-0000-0000-0000-000000000003',playerId:'player',character:'donkey-kong',courseId:course.id,frames:1066,startedAt:Date.parse(new SlippiGame(replay).getMetadata().startAt),excluded:'Different game settings'};
 await capture.save(run);await capture.sync();let saved=JSON.parse(await readFile(join(capture.directory,run.id+'.json')));assert.equal(saved.excluded,undefined);assert.equal(saved.lastError,'Temporary outage');assert.ok(!saved.submitted);
 saved.lastAttemptAt=0;await capture.save(saved);client.request=async(path,options)=>{assert.equal(path,'worlds/submit');assert.equal(options.body.frames,1066);assert.equal(options.authenticated,true);};await capture.sync();
 saved=JSON.parse(await readFile(join(capture.directory,run.id+'.json')));assert.equal(saved.submitted,true);assert.equal(saved.lastError,undefined);assert.equal(client.boardCache.size,0);
});

test('reviewed optional item host preserves unchanged courses but never hides stage or rules changes',()=>{
 const old={character:'fox',stageSha256:'a'.repeat(64),dolSha256:'ace7da8155ac496bef68c096da04c07607429110194b3d4725715a757e01c0a6',rulesSha256:'b'.repeat(64)};
 const next={...old,dolSha256:'3282b4f53589c1dea328dff85b1bb3a069a675e094712f58476af599c9a1dd8f'};
 assert.equal(worldCourseId(old),worldCourseId(next));
 for(const field of ['stageSha256','rulesSha256','dolSha256'])assert.notEqual(worldCourseId(old),worldCourseId({...next,[field]:'d'.repeat(64)}));
});

test('deterministic Falco engine resets only Falco, preserving every other published world',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../cloud/worlds-catalog.json',import.meta.url)));
 for(const course of catalog.courses){
  const old={...course,dolSha256:'3282b4f53589c1dea328dff85b1bb3a069a675e094712f58476af599c9a1dd8f'};
  const fixed={...course,dolSha256:'bb0768f6ea4e0c4dc6bb565e3baabf357bee50b9589395de0f1fed4fa159a3d1'};
  if(course.character==='falco')assert.notEqual(worldCourseId(old),worldCourseId(fixed));
  else assert.equal(worldCourseId(old),worldCourseId(fixed),course.character);
  assert.notEqual(worldCourseId({...fixed,dolSha256:'f'.repeat(64)}),worldCourseId(fixed));
 }
});
