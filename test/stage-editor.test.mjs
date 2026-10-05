import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createApp} from '../server/app.mjs';import {createStagePack,validateStagePack,validateProject,moveSelection,History,clone,motion,setPlatformMotion,retimeMotion,randomizeTargets,appendTargetStop} from '../web/editor/model.js';
const data=async s=>JSON.parse(await readFile(new URL(`../web/editor/data/${s}.json`,import.meta.url)));
test('all 26 original projects validate with original behavior and geometry',async()=>{const c=JSON.parse(await readFile(new URL('../web/editor/data/catalog.json',import.meta.url)));assert.equal(c.length,26);for(const {stage}of c){const b=await data(stage);assert.deepEqual(validateProject(b.project,b).errors,[],stage);}});
test('moving a target preserves its entire animation and undo history',async()=>{const b=await data('Pk'),p=clone(b.project),original=clone(p);p.targetCycles=[{target:0,kind:'moving',period:240,keys:[[0,...p.targets[0]],[120,p.targets[0][0]+10,p.targets[0][1]],[240,...p.targets[0]]]}];const h=new History(p);moveSelection(p,{type:'target',index:0},4,8,b);h.push(p);assert.deepEqual(p.targetCycles[0].keys[0].slice(1),p.targets[0]);assert.deepEqual(p.targetCycles[0].keys[2].slice(1),p.targets[0]);assert.deepEqual(h.undo().targets,original.targets);assert.deepEqual(h.redo(),p);});
test('chest movement carries its target, detached or animated chest targets are rejected',async()=>{const b=await data('Cl'),p=clone(b.project),i=b.mechanisms.findIndex(m=>m.opensTarget!==undefined),t=b.mechanisms[i].opensTarget;moveSelection(p,{type:'mechanism',index:i},10,5,b);assert.equal(p.targets[t][0],b.project.targets[t][0]+10);assert.equal(p.targets[t][1],b.project.targets[t][1]+5);assert.ok(!validateProject(p,b).errors.some(e=>e.includes('chest')));p.targets[t][0]+=2;assert.ok(validateProject(p,b).errors.some(e=>e.includes('chest')));});
test('invalid revisions, buried targets, nonfinite coordinates and excessive mechanisms block playtest',async()=>{const b=await data('Pk');for(const mutate of [p=>p.revision='old',p=>p.targets.pop(),p=>p.targets[0][0]=Infinity,p=>p.spawn=[NaN,2],p=>p.mechanisms.push(...Array.from({length:11},()=>clone(p.mechanisms[0])))]){const p=clone(b.project);mutate(p);assert.ok(validateProject(p,b).errors.length);}const p=clone(b.project),s=p.solids.at(-1).points;p.targets[0]=[s.reduce((a,v)=>a+v[0],0)/s.length,s.reduce((a,v)=>a+v[1],0)/s.length];assert.ok(validateProject(p,b).errors.some(e=>e.includes('solid wall')));});
test('preview uses authored half-amplitude orbit and retimed explicit motion keys',()=>{const m={x:0,y:10,dx:100,dy:40,period:400,hold:0,orbit:true};assert.deepEqual(motion(m,m,100),[49.99999999999999,30]);const original={x:5,y:0,xKeys:[[0,5],[100,15]],period:100},edited={x:25,y:0,dx:0,dy:0,period:200,hold:0};assert.equal(motion(edited,original,100)[0],30);});
test('editor serves only bundled data and launch requires local origin, header and bounded JSON',async t=>{let calls=0;const app=createApp({customStages:{list:async()=>[{available:true}]},launchCustomStage:async(id,p)=>{assert.equal(id,'stage-editor');assert.equal(p.stage,'Pk');calls++;return {status:'started'};}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const origin=`http://127.0.0.1:${app.address().port}`;assert.equal((await fetch(origin+'/editor')).status,200);assert.equal((await fetch(origin+'/editor/data/Pk.json')).status,200);assert.equal((await fetch(origin+'/editor/data/user.json')).status,404);for(const headers of [{},{Origin:'https://foreign.example','X-TTRC-Action':'launch'}])assert.equal((await fetch(origin+'/api/editor/test',{method:'POST',headers,body:'{}'})).status,403);const headers={Origin:origin,'X-TTRC-Action':'launch','Content-Type':'application/json'};assert.equal((await fetch(origin+'/api/editor/test',{method:'POST',headers,body:'['})).status,400);assert.equal((await fetch(origin+'/api/editor/test',{method:'POST',headers,body:' '.repeat(512*1024+1)})).status,413);assert.equal(calls,0);assert.equal((await fetch(origin+'/api/editor/test',{method:'POST',headers,body:JSON.stringify((await data('Pk')).project)})).status,200);assert.equal(calls,1);});

test('platform custom routes interpolate, teleport, stop and move with their anchors',async()=>{const b=await data('Pk'),p=clone(b.project),m=p.mechanisms[0],original=b.mechanisms[0];setPlatformMotion(m,original,'teleport');assert.deepEqual(motion(m,original,m.period/2-1),[m.x,m.y]);assert.deepEqual(motion(m,original,Math.ceil(m.period/2)),m.motion.keys[1].slice(1));moveSelection(p,{type:'mechanism',index:0},5,10,b);assert.deepEqual(m.motion.keys[0].slice(1),[m.x,m.y]);retimeMotion(m,240);assert.equal(m.motion.keys.at(-1)[0],240);assert.deepEqual(validateProject(p,b).errors,[]);setPlatformMotion(m,original,'static');assert.deepEqual(motion(m,original,120),[m.x,m.y]);m.motion.keys[1][0]=0;assert.ok(validateProject(p,b).errors.length);});
test('randomize changes only targets and their paths on all 26 worlds, leaving chest anchors intact',async()=>{const catalog=JSON.parse(await readFile(new URL('../web/editor/data/catalog.json',import.meta.url)));for(const {stage}of catalog){const b=await data(stage),p=clone(b.project);const result=randomizeTargets(p,b,12345);assert.ok(result.moved>0,stage);assert.deepEqual(result,randomizeTargets(p,b,12345));for(const key of ['platforms','solids','mechanisms','additions','spawn'])assert.deepEqual(result.project[key],p[key],stage+' '+key);assert.deepEqual(validateProject(result.project,b).errors,[],stage);for(const m of b.mechanisms.filter(m=>m.opensTarget!==undefined))assert.deepEqual(result.project.targets[m.opensTarget],p.targets[m.opensTarget]);for(const c of result.project.targetCycles){assert.deepEqual(c.keys[0].slice(1),result.project.targets[c.target]);assert.deepEqual(c.keys.at(-1).slice(1),result.project.targets[c.target]);}const h=new History(p);h.push(result.project);assert.deepEqual(h.undo(),p);}});
test('added boosts accept both signed directions but reject moving zones and excessive speed',async()=>{const b=await data('Pk'),p=clone(b.project);for(const speed of [-5.8,5.8]){p.additions=[{kind:'boost',name:'Speed arrow',x:-180,y:20,width:46,dx:0,dy:0,period:240,hold:0,impulseX:speed}];assert.deepEqual(validateProject(p,b).errors,[]);}p.additions[0].dx=20;assert.ok(validateProject(p,b).errors.length);p.additions[0].dx=0;p.additions[0].impulseX=100;assert.ok(validateProject(p,b).errors.length);});

test('map stops close both target loop types, have distinct integer times and respect native limits',()=>{
 for(const kind of ['moving','teleport']){
  const c={kind,period:240,keys:[[0,2,4],[240,2,4]]};appendTargetStop(c,[20,30]);appendTargetStop(c,[-10,80]);
  assert.deepEqual(c.keys,[[0,2,4],[80,20,30],[160,-10,80],[240,2,4]]);
  for(let i=c.keys.length;i<65;i++)appendTargetStop(c,[i,0]);assert.equal(c.keys.length,65);assert.ok(c.keys.every((k,i)=>!i||k[0]>c.keys[i-1][0]));
  const before=clone(c);assert.throws(()=>appendTargetStop(c,[3,8]),/63 destination/);assert.deepEqual(c,before);
 }
 const c={period:60,keys:Array.from({length:61},(_,i)=>[i,0,0])},before=clone(c);assert.throws(()=>appendTargetStop(c,[20,30]),/Lengthen/);assert.deepEqual(c,before);
});

test('Zapdos and its clone accept routes, preserve stops across modes and translate the entire loop',async()=>{
 const b=await data('Pk'),p=clone(b.project),m=p.mechanisms[1],original=b.mechanisms[1];setPlatformMotion(m,original,'moving');const keys=clone(m.motion.keys);assert.ok(keys.length>3);setPlatformMotion(m,original,'teleport');assert.deepEqual(m.motion.keys,keys);moveSelection(p,{type:'mechanism',index:1},10,12,b);assert.deepEqual(m.motion.keys[0],[0,m.x,m.y]);assert.deepEqual(validateProject(p,b).errors,[]);
 p.additions.push({...clone(m),kind:'template',template:1,name:'Another Zapdos',width:original.width});assert.deepEqual(validateProject(p,b).errors,[]);
 setPlatformMotion(m,original,'authored');assert.equal(m.motion,undefined);
 const chest=await data('Cl'),c=clone(chest.project),i=chest.mechanisms.findIndex(m=>m.opensTarget!==undefined);setPlatformMotion(c.mechanisms[i],chest.mechanisms[i],'moving');assert.ok(validateProject(c,chest).errors.some(s=>s.includes('Chest')));
});

test('side handles resize paired corners on one axis and prevent rectangle inversion',async()=>{
 const {solidEdgeHandles,resizeSolidEdge}=await import('../web/editor/model.js');
 const p=[[0,40],[60,40],[60,0],[0,0]],original=clone(p);
 assert.deepEqual(solidEdgeHandles(p).map(h=>[h.point,h.axis]),[[[30,40],1],[[60,20],0],[[30,0],1],[[0,20],0]]);
 assert.deepEqual(resizeSolidEdge(p,0,10),[[0,50],[60,50],[60,0],[0,0]]);
 assert.deepEqual(resizeSolidEdge(p,1,10),[[0,40],[70,40],[70,0],[0,0]]);
 assert.deepEqual(resizeSolidEdge(p,2,-10),[[0,40],[60,40],[60,-10],[0,-10]]);
 assert.deepEqual(resizeSolidEdge(p,3,-10),[[-10,40],[60,40],[60,0],[-10,0]]);
 assert.deepEqual(resizeSolidEdge(p,1,-200),[[0,40],[2,40],[2,0],[0,0]]);
 assert.deepEqual(resizeSolidEdge(p,0,-200),[[0,2],[60,2],[60,0],[0,0]]);
 assert.deepEqual(p,original);
});

test('Falcon target loops under one second are valid and bad durations name the target',async()=>{
 const b=await data('Ca');
 for(const kind of ['moving','teleport'])for(const period of [2,50,59]){
  const p=clone(b.project),c=p.targetCycles[0];c.kind=kind;c.period=period;c.keys[1][0]=Math.floor(period/2);c.keys.at(-1)[0]=period;
  assert.deepEqual(validateProject(p,b).errors,[]);
 }
 for(const period of [0,1,50.5,3601]){const p=clone(b.project);p.targetCycles[0].period=period;assert.ok(validateProject(p,b).errors.some(e=>e.includes('Target 1: loop length')&&e.includes(String(period))));}
});

test('bumper dimensions accept thin and large rectangles with clear errors for nonpositive sizes',async()=>{
 const b=await data('Fx'),p=clone(b.project);
 p.additions=[{kind:'bumper',name:'Bumper',x:0,y:100,width:2,height:640,dx:0,dy:0,period:240,hold:0}];
 for(const size of [.5,2,400,401,800,2400]){p.additions[0].width=p.additions[0].height=size;assert.deepEqual(validateProject(p,b).errors,[]);}
 for(const axis of ['width','height'])for(const value of [0,-1,NaN,Infinity]){p.additions[0].width=2;p.additions[0].height=640;p.additions[0][axis]=value;assert.deepEqual(validateProject(p,b).errors,[`Bumper ${axis} must be a number greater than zero.`]);}
});

test('all-level packs preserve every draft, include untouched stages and reject invalid or missing levels',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../web/editor/data/catalog.json',import.meta.url))),bases=await Promise.all(catalog.map(c=>data(c.stage)));
 const fox=clone(bases.find(b=>b.stage==='Fx').project),mario=clone(bases.find(b=>b.stage==='Mr').project);fox.targets[0][0]+=1;mario.targets[0][0]+=2;
 const pack=createStagePack(bases,{Fx:fox,Mr:mario},'Fx');assert.equal(pack.projects.length,26);assert.deepEqual(pack.projects.find(p=>p.stage==='Fx'),fox);assert.deepEqual(pack.projects.find(p=>p.stage==='Mr'),mario);assert.deepEqual(validateStagePack(pack,bases),[]);
 const broken=clone(pack);broken.projects.pop();assert.match(validateStagePack(broken,bases).join(' '),/Missing stage/);
 broken.projects.push(clone(broken.projects[0]));assert.match(validateStagePack(broken,bases).join(' '),/Duplicate stage/);
 fox.revision='old';assert.throws(()=>createStagePack(bases,{Fx:fox},'Fx'),/Fox.*revision/);
});
test('building all levels forwards the complete pack through the protected local endpoint',async t=>{
 let received;const app=createApp({launchCustomStage:async(id,p)=>{received={id,p};return {status:'started'};}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const origin=`http://127.0.0.1:${app.address().port}`,url=origin+'/api/editor/build-all',pack={format:'TTRC_STAGE_PACK',version:1,projects:[(await data('Fx')).project,(await data('Mr')).project]};
 assert.equal((await fetch(url,{method:'POST',body:JSON.stringify(pack)})).status,403);assert.equal(received,undefined);
 const headers={Origin:origin,'X-TTRC-Action':'launch','Content-Type':'application/json'};
 assert.equal((await fetch(url,{method:'POST',headers,body:'['})).status,400);
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(pack)})).status,200);assert.deepEqual(received,{id:'stage-editor-all',p:pack});
});
