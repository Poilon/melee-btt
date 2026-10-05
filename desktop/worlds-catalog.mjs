import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {WORLD_CHARACTERS,worldCourseId,worldRulesHash} from '../shared/worlds.mjs';
// Same file order and name collision rules as Dolphin's GeckoCodeConfig.
export function geckoList(global,local){
 const parse=text=>{const codes=[],enabled=[],disabled=[];let section='',current;
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();if(line.startsWith('[')){section=line.slice(1,line.indexOf(']'));continue;}
   if(section==='Gecko'){
    if(line.startsWith('$')){current={name:line.slice(1).split('[')[0].trim(),lines:[]};codes.push(current);}
    else if(/^[a-f0-9]{8}\s+[a-f0-9]{8}(?:\s|$)/i.test(line)&&current)current.lines.push(line.match(/^[a-f0-9]{8}\s+[a-f0-9]{8}/i)[0].replace(/\s/g,''));
   }else if(line.startsWith('$')&&section==='Gecko_Enabled')enabled.push(line.slice(1));
   else if(line.startsWith('$')&&section==='Gecko_Disabled')disabled.push(line.slice(1));
  }return {codes,enabled,disabled};
 };
 const g=parse(global),l=parse(local),codes=[...g.codes,...l.codes.filter(c=>!g.codes.some(o=>o.name===c.name))];
 const enabled=new Set([...g.enabled,...l.enabled]);for(const name of l.disabled)enabled.delete(name);
 return Buffer.from(codes.filter(c=>enabled.has(c.name)).flatMap(c=>c.lines).join(''),'hex');
}
export async function makeWorldCatalog(bundle,manifest){
 const global=await readFile(join(bundle,'Sys/GameSettings/GALE01r2.ini'),'utf8'),local=await readFile(join(bundle,'User/GameSettings/GALE01.ini'),'utf8');
 const rulesSha256=worldRulesHash(geckoList(global,local));
 return {format:'ttrc-worlds-v1',courses:WORLD_CHARACTERS.map(c=>{
  const stageFile=`GrT${c.suffix}.dat`,stage=manifest.courses.find(s=>s.stageFile===stageFile);
  const course={character:c.id,suffix:c.suffix,stageId:c.stageId,name:stage?.name||c.name,stageSha256:manifest.stageHashes[stageFile],dolSha256:manifest.dolSha256,rulesSha256};
  return {...course,id:worldCourseId(course)};
 })};
}
