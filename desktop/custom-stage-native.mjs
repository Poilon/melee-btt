// Standalone helper for the isolated native Dolphin launched by Custom stages.
// Online worlds start their own mailbox bridge; old challenge services stay separate.
import {readFile,open,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export async function verifyCourseIso(path,expected,dolHash){
 const hashes=typeof expected==='string'?{'GrTFx.dat':expected}:expected;
 if(!hashes||!Object.keys(hashes).length)throw Error('Missing course hashes');
 const missing=new Set(Object.keys(hashes));
 const file=await open(path,'r');
 try{
  const header=Buffer.alloc(0x430);await file.read(header,0,header.length,0);
  if(!header.subarray(0,8).equals(Buffer.from([71,65,76,69,48,49,0,2])))throw Error('Wrong game');
  const offset=header.readUInt32BE(0x424),size=header.readUInt32BE(0x428);
  if(size<12||size>4*1024*1024)throw Error('Invalid file table');
  const fst=Buffer.alloc(size);await file.read(fst,0,size,offset);
  const count=fst.readUInt32BE(8);if(count*12>size)throw Error('Invalid file count');
  for(let i=1;i<count;i++){
   const row=i*12;if(fst[row]!==0)continue;
   const nameOffset=count*12+(fst.readUInt32BE(row)&0xffffff);
   const end=fst.indexOf(0,nameOffset);
   if(nameOffset>=size||end<0)throw Error('Invalid file name');
   const name=fst.toString('utf8',nameOffset,end);
   if(!Object.hasOwn(hashes,name))continue;
   const length=fst.readUInt32BE(row+8);if(length>8*1024*1024)throw Error('Invalid stage size');
   const stage=Buffer.alloc(length);await file.read(stage,0,length,fst.readUInt32BE(row+4));
   if(createHash('sha256').update(stage).digest('hex')!==hashes[name])throw Error('Wrong custom stage');
   missing.delete(name);
  }
  if(missing.size)throw Error('Custom stage missing');
  if(dolHash){
   const base=header.readUInt32BE(0x420),dh=Buffer.alloc(0x100);await file.read(dh,0,dh.length,base);
   let length=0;for(let i=0;i<18;i++)length=Math.max(length,dh.readUInt32BE(i*4)+dh.readUInt32BE(0x90+i*4));
   if(length<256||length>16*1024*1024)throw Error('Invalid executable size');
   const dol=Buffer.alloc(length);await file.read(dol,0,length,base);
   if(createHash('sha256').update(dol).digest('hex')!==dolHash)throw Error('Wrong course executable');
  }
 }finally{await file.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const course=JSON.parse(await readFile(join(root,'course.json'),'utf8'));
  if(!['grassland-1','character-worlds'].includes(course.id))throw Error('Unknown course');
  await access(join(root,'User/.ttrc-custom-stage'));
  if(process.argv.includes('--iso')){
   const path=resolve(process.argv[process.argv.indexOf('--iso')+1]);
   if(path.toLowerCase()!==resolve(course.iso).toLowerCase())throw Error('Wrong ISO');
   await verifyCourseIso(path,course.menuHashes?{...course.stageHashes,...course.menuHashes}:course.stageHashes||course.stageSha256,course.dolSha256);
  }else if(process.argv.includes('--serve')&&course.onlineVersion===1){
   const pid=Number(process.argv[process.argv.indexOf('--parent')+1]);
   const {serveWorlds}=await import('./worlds-online.mjs');
   const {createWorldPlayback}=await import('./worlds-playback.mjs');
   await serveWorlds({root,course,pid,playReplay:createWorldPlayback(root,course,pid)});
  }else if(!process.argv.includes('--prepare')&&!process.argv.includes('--serve'))throw Error('Unknown action');
 }catch{process.exitCode=1;}
}
