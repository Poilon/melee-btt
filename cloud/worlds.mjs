import {createRequire} from 'node:module';
import {inspectReplay,MAX_REPLAY_BYTES} from '../shared/replay.mjs';
import {validateWorldCatalog,isHash,sha256,worldRulesHash,WORLD_CHARACTERS,totalWorldStandings} from '../shared/worlds.mjs';
const {SlippiGame}=createRequire(import.meta.url)('@slippi/slippi-js');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function createWorlds({store,catalog={format:'ttrc-worlds-v1',courses:[]},challenges=[],bearer,json,now=Date.now}){
 validateWorldCatalog(catalog);
 for(const challenge of challenges){
  if(!/^[a-z0-9-]+$/.test(challenge.id)||!Number.isFinite(Date.parse(challenge.startsAt))||!Number.isFinite(Date.parse(challenge.endsAt))||Date.parse(challenge.startsAt)>=Date.parse(challenge.endsAt))throw Error('Invalid worlds challenge.');
  validateWorldCatalog({format:'ttrc-worlds-v1',courses:challenge.courses});
 }
 const allCourses=[...catalog.courses,...challenges.flatMap(c=>c.courses)];
 const send=(res,status,data)=>{json(res,status,data);return true;};
 const getCourse=id=>catalog.courses.find(c=>c.id===id);
 const courseIds=new Set(allCourses.map(c=>c.id));
 let recordsCache,cacheUntil=0;
 async function records(){
  if(recordsCache&&now()<cacheUntil)return recordsCache;
  cacheUntil=now()+5000;
  const pending=(async()=>{
   const files=(await store.list('worlds/records/')).filter(f=>courseIds.has(f.pathname.split('/')[2]));
   return (await Promise.all(files.map(f=>store.get(f.pathname)))).filter(Boolean);
  })();
  recordsCache=pending;
  try{return await pending;}catch(e){if(recordsCache===pending)recordsCache=null;throw e;}
 }
 async function readBody(req){
  const max=3*1024*1024;
  let text='';
  if(req.body!==undefined)text=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else for await(const chunk of req){text+=chunk;if(text.length>max)throw Error('Request too large.');}
  if(text.length>max)throw Error('Request too large.');return JSON.parse(text||'{}');
 }
 async function immutable(path,value,digest){
  try{await store.put(path,value);}catch(e){if((await store.get(path))?.digest!==digest)throw e;}
 }
 return async(path,req,res,url)=>{
  if(!path.startsWith('worlds/'))return false;
  const event=url.searchParams.get('event'),challenge=event&&challenges.find(c=>c.id===event);
  if(event&&!challenge)return send(res,404,{error:'Challenge not found.'});
  const selectedCourses=challenge?challenge.courses:catalog.courses;
  const deadline=challenge?Date.parse(challenge.endsAt):Infinity;
  const eligible=r=>!challenge||Date.parse(r.createdAt)>=Date.parse(challenge.startsAt)&&Date.parse(r.createdAt)<deadline&&Date.parse(r.startedAt)>=Date.parse(challenge.startsAt)&&Date.parse(r.startedAt)<deadline;
  const selectedRecords=async()=>(await records()).filter(eligible);
  if(path==='worlds/catalog'&&req.method==='GET'){
   if(!challenge)return send(res,200,catalog);
   const {courses,...details}=challenge;
   return send(res,200,{format:catalog.format,courses,challenge:{...details,phase:now()>=deadline?'closed':'open'}});
  }
  if(path==='worlds/total'&&req.method==='GET'){
   const board=totalWorldStandings(await selectedRecords(),selectedCourses);
   const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset'))||0)));
   return send(res,200,{...board,kind:'total',courseIds:selectedCourses.map(c=>c.id),total:board.rows.length,rows:board.rows.slice(offset,offset+100),inProgress:board.inProgress.slice(0,100),offset});
  }
  const course=selectedCourses.find(c=>c.id===url.searchParams.get('course'));
  if(path==='worlds/leaderboard'&&req.method==='GET'){
   if(!course)return send(res,404,{error:'This level version is not published.'});
   const courseRecords=(await selectedRecords()).filter(r=>r.courseId===course.id)
    .sort((a,b)=>a.frames-b.frames||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
   const seen=new Set();let rank=0,last;
   const rows=courseRecords.filter(r=>{if(seen.has(r.playerId))return false;seen.add(r.playerId);return true;}).map((r,index)=>{
    if(r.frames!==last){rank=index+1;last=r.frames;}
    return {rank,id:r.id,playerId:r.playerId,username:r.username,frames:r.frames,createdAt:r.createdAt,hasReplay:true};
   });
   const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset'))||0)));
   return send(res,200,{course,rows:rows.slice(offset,offset+100),total:rows.length,offset});
  }
  if(path==='worlds/replay'&&req.method==='GET'){
   const id=url.searchParams.get('id'),player=url.searchParams.get('player');
   if(!course||!uuid.test(id||'')||!isHash(player))return send(res,404,{error:'Replay not found.'});
   // Only the new public worlds namespace is exposed here. Old challenge evidence stays sealed.
   const record=await store.get(`worlds/records/${course.id}/${player}/${id}.json`);
   if(!record||!eligible(record))return send(res,404,{error:'Replay not found.'});
   const evidence=await store.get(`worlds/replays/${course.id}/${player}/${id}.json`);
   if(!evidence||sha256(Buffer.from(evidence.base64,'base64'))!==record.replay.sha256)return send(res,404,{error:'Replay unavailable.'});
   res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="Custom-Melee-BTT-${course.character}-${id}.slp"`,'X-TTRC-Course':course.id,'X-TTRC-SHA256':record.replay.sha256});
   res.end(Buffer.from(evidence.base64,'base64'));return true;
  }
  if(path==='worlds/submit'&&req.method==='POST'){
   const player=await bearer(req);if(!player?.username)return send(res,401,{error:'Sign in in Custom Melee BTT Dolphin.'});
   let input,bytes,replay,course,startedAt;
   try{
    input=await readBody(req);course=getCourse(input.courseId);
    if(!course||!uuid.test(input.id||'')||!Number.isInteger(input.frames)||input.frames<1||input.frames>216000||typeof input.replay!=='string'||input.replay.length>Math.ceil(MAX_REPLAY_BYTES/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.replay))throw Error();
    bytes=Buffer.from(input.replay,'base64');
    // Sheik has her own authored world; legacy randomizer records intentionally combine Zelda/Sheik.
    replay=inspectReplay(bytes,{character:course.character==='sheik'?'zelda':course.character,stage:course.character},'');
    const game=new SlippiGame(bytes),settings=game.getSettings(),code=game.getGeckoList()?.contents;
    startedAt=game.getMetadata()?.startAt||null;
    const external=WORLD_CHARACTERS.find(c=>c.id===course.character).externalId;
    if(settings.stageId!==course.stageId||!settings.players.some(p=>p.characterId===external||(external===14&&p.characterId===32))||!code||worldRulesHash(Buffer.from(code))!==course.rulesSha256||replay.gameEndMethod!==6||replay.pauseFrames>0||input.frames!==replay.lastFrame)throw Error();
   }catch{return send(res,400,{error:'Incomplete, paused or incompatible replay for this level version.'});}
   const digest=sha256(JSON.stringify([course.id,input.frames,replay.sha256]));
   const key=`${course.id}/${player.id}/${input.id}.json`;
   const existing=await store.get(`worlds/claims/${key}`);
   if(existing&&existing.digest!==digest)return send(res,409,{error:'Run ID already used.'});
   try{await immutable(`worlds/claims/${key}`,{digest},digest);}catch{return send(res,409,{error:'Run ID already used.'});}
   await immutable(`worlds/replays/${key}`,{base64:bytes.toString('base64'),digest},digest);
   await immutable(`worlds/records/${key}`,{id:input.id,courseId:course.id,playerId:player.id,username:player.username,frames:input.frames,startedAt,createdAt:new Date(now()).toISOString(),replay,digest},digest);
   recordsCache=null;
   return send(res,202,{ok:true,id:input.id});
  }
  return send(res,404,{error:'Not found.'});
 };
}
