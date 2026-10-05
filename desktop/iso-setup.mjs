import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {verifyIso} from '../server/onboarding.mjs';
const exec=promisify(execFile);
export async function ensureGameIso({root,remembered,verify=verifyIso,select,onPhase=async()=>{}}){
 if(remembered){await onPhase('verify');try{await verify(remembered);return remembered;}catch{}}
 await onPhase('select');
 const choose=select||(async()=>{
  const {stdout}=await exec('powershell.exe',['-NoProfile','-STA','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'scripts/iso_setup.ps1'),'-Root',root,...(remembered?['-MissingSavedIso']:[])],{windowsHide:true,encoding:'utf8',maxBuffer:65536});
  return stdout.trim().replace(/^\uFEFF/,'')||null;
 });
 const selected=await choose();
 if(!selected)return null;
 // Recheck the actual file before preparing or launching the game.
 await onPhase('verify');
 await verify(selected);return selected;
}
