// Authored worlds use a separate namespace from the sealed randomizer challenges.
import {createHash} from 'node:crypto';
export const WORLD_CHARACTERS = [
 ['dr-mario','Dr. Mario',22,'Dr'],['mario','Mario',8,'Mr'],['luigi','Luigi',7,'Lg'],
 ['bowser','Bowser',5,'Kp'],['peach','Peach',12,'Pe'],['yoshi','Yoshi',17,'Ys'],
 ['donkey-kong','Donkey Kong',1,'Dk'],['captain-falcon','Captain Falcon',0,'Ca'],
 ['ganondorf','Ganondorf',25,'Gn'],['falco','Falco',20,'Fc'],['fox','Fox',2,'Fx'],
 ['ness','Ness',11,'Ns'],['ice-climbers','Ice Climbers',14,'Ic'],['kirby','Kirby',4,'Kb'],
 ['samus','Samus',16,'Ss'],['zelda','Zelda',18,'Zd'],['sheik','Sheik',19,'Sk'],
 ['link','Link',6,'Lk'],['young-link','Young Link',21,'Cl'],['pichu','Pichu',24,'Pc'],
 ['pikachu','Pikachu',13,'Pk'],['jigglypuff','Jigglypuff',15,'Pr'],['mewtwo','Mewtwo',10,'Mt'],
 ['game-and-watch','Mr. Game & Watch',3,'Gw'],['marth','Marth',9,'Ms'],['roy','Roy',23,'Fe'],
].map(([id,name,externalId,suffix])=>({id,name,externalId,suffix,stageId:33+['Mr','Ca','Cl','Dk','Dr','Fc','Fx','Ic','Kb','Kp','Lk','Lg','Ms','Mt','Ns','Pe','Pc','Pk','Pr','Ss','Sk','Ys','Zd','Gw','Fe','Gn'].indexOf(suffix)}));
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const isHash = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
export const WORLD_RULES_VALIDATION_VERSION = 3;
// The Warp Star host is a no-op unless the archive opts in. Pin the exact
// reviewed executable so unchanged levels retain records; ISO verification
// still uses the real dolSha256. Any other executable gets a new revision.
const compatibleEngines = new Map([
 ['3282b4f53589c1dea328dff85b1bb3a069a675e094712f58476af599c9a1dd8f','ace7da8155ac496bef68c096da04c07607429110194b3d4725715a757e01c0a6'],
]);
// Exact Falco-only aircraft RNG patch. All other stages take the original
// RNG path, so their existing records remain on the same level revision.
const falcoDeterministicEngine='bb0768f6ea4e0c4dc6bb565e3baabf357bee50b9589395de0f1fed4fa159a3d1';
export function worldCourseId({character,stageSha256,dolSha256,rulesSha256}) {
 if(!WORLD_CHARACTERS.some(c=>c.id===character)||![stageSha256,dolSha256,rulesSha256].every(isHash))throw Error('Invalid world revision.');
 const engine=character!=='falco'&&dolSha256===falcoDeterministicEngine?'ace7da8155ac496bef68c096da04c07607429110194b3d4725715a757e01c0a6':compatibleEngines.get(dolSha256)||dolSha256;
 return sha256(JSON.stringify(['ttrc-world-v1',character,stageSha256,engine,rulesSha256]));
}
export function validateWorldCatalog(catalog) {
 if(catalog?.format!=='ttrc-worlds-v1'||!Array.isArray(catalog.courses))throw Error('Invalid world catalog.');
 const ids=new Set();
 for(const c of catalog.courses){
  if(c.id!==worldCourseId(c)||ids.has(c.id)||typeof c.name!=='string'||c.name.length>80||c.stageId!==WORLD_CHARACTERS.find(w=>w.id===c.character)?.stageId)throw Error('Invalid world course.');
  ids.add(c.id);
 }
 return catalog;
}

// Total time uses one personal best per currently published character/world.
// Partial sets show progress only and never outrank a completed set.
export function totalWorldStandings(records,courses){
 const versions=new Map(courses.map(c=>[c.id,c.character])),required=new Set(courses.map(c=>c.character)).size,players=new Map();
 for(const r of records){
  const character=versions.get(r.courseId);if(!character||!Number.isInteger(r.frames)||r.frames<1)continue;
  if(!players.has(r.playerId))players.set(r.playerId,{playerId:r.playerId,username:r.username,best:new Map()});
  const p=players.get(r.playerId),old=p.best.get(character);if(old===undefined||r.frames<old)p.best.set(character,r.frames);
 }
 const all=[...players.values()].map(p=>({playerId:p.playerId,username:p.username,completed:p.best.size,frames:p.best.size===required&&required?[...p.best.values()].reduce((a,b)=>a+b,0):null}));
 let rank=0,last;
 const rows=all.filter(p=>p.frames!==null).sort((a,b)=>a.frames-b.frames||a.playerId.localeCompare(b.playerId)).map((p,i)=>{if(p.frames!==last){rank=i+1;last=p.frames;}return {...p,rank};});
 return {rows,inProgress:all.filter(p=>p.frames===null).sort((a,b)=>b.completed-a.completed||a.username.localeCompare(b.username)||a.playerId.localeCompare(b.playerId)),requiredCharacters:required,participants:all.length};
}

// Slippi relocates the final branch of each C2 hook when loading it into RAM.
// Normalize only that relocation and the documented music mute write. Everything
// else, including gameplay preferences and extra codes, remains part of the hash.
export function worldRulesHash(input){
 const b=Buffer.from(input),parts=[];
 if(!b.length||b.length%8)throw Error('Invalid Gecko list.');
 let p=b.length>=8&&b.readUInt32BE(0)===0x00d0c0de&&b.readUInt32BE(4)===0x00d0c0de?8:0;
 while(p<b.length){
  const address=b.readUInt32BE(p),value=b.readUInt32BE(p+4),type=(address>>>24)&0xfe;
  if(address===0xff000000&&value===0){if(p+8!==b.length)throw Error('Trailing Gecko data.');break;}
  let length=8;
  if(type===0xc0||type===0xc2)length+=value*8;
  else if(type===0x06)length+=Math.ceil(value/8)*8;
  else if(type===0x08)length=16;
  if(p+length>b.length||length>1024*1024)throw Error('Truncated Gecko code.');
  const code=Buffer.from(b.subarray(p,p+length));
  if(type===0xc2){
   if(!value)throw Error('Empty assembly hook.');
   const tail=code.readUInt32BE(code.length-4);
   if(tail!==0&&((tail>>>26)!==18||(tail&3)!==0))throw Error('Invalid assembly return.');
   code.writeUInt32BE(0,code.length-4);
  }
  // Slippi Common/AllocSceneBuffer.asm stores its one-time initialization flag inline.
  if(address===0xc21a4cb4&&value===13&&code.readUInt32BE(8)===0x4800000c&&code.readUInt32BE(12)===0x4e800021&&code.readUInt32BE(16)<=0x01000000){
   if(code.readUInt32BE(16)!==0&&code.readUInt32BE(16)!==0x01000000)throw Error('Invalid Slippi initialization flag.');
   code.writeUInt32BE(0,16);
  }
  // UCF 0.84 Pad Buffer + 1.0 Cardinals: four 12-byte controller histories
  // follow the initial branch. Slippi records their current RAM contents.
  // Only this data buffer is mutable; keep all instructions/constants hashed.
  // project-slippi/slippi-ssbm-asm: External/UCF 0.84/UCF/UCF Pad Buffer + 1.0 Cardinals.asm
  if(address===0xc206b460&&value===0x54&&code.readUInt32BE(8)===0x480000b1&&code.readUInt32BE(60)===0xbf1c0000&&code.readUInt32BE(64)===0x38d1b717&&code.readUInt32BE(68)===0x42a00000)code.fill(0,12,60);
  // UCF 0.84 DBOOC SquatRv Fix: stfd f1, 0xC(r4) writes an eight-byte
  // conversion scratch slot after the three constants. This is runtime data,
  // not a setting. Only normalize the exact reviewed hook (return relocated
  // above); all instructions, constants and the hook address must still match.
  // project-slippi/slippi-ssbm-asm: External/UCF 0.84/UCF/UCF DBOOC SquatRv Fix.asm
  if(address===0xc20d65ec&&value===0x10){
   const canonical=Buffer.from(code);canonical.fill(0,24,32);
   if(sha256(canonical)==='014235f6065f41ac570cf823df159eaef8985da2b590831b3e869d7effee8c3c')canonical.copy(code);
  }
  if(address!==0x04023ffc||value!==0x38800000)parts.push(code);
  p+=length;
 }
 return sha256(Buffer.concat(parts));
}
