import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {isHash} from '../shared/worlds.mjs';
import {verifyCourseIso} from './custom-stage-native.mjs';
import {ensurePlayback} from '../server/playback-install.mjs';
import {LaunchProgress} from './launch-progress.mjs';
const section=(ini,name)=>ini.match(new RegExp('\\['+name+'\\]([^]*?)(?=\\n\\[|$)'))?.[1]||'';
const value=(ini,name,key,fallback)=>section(ini,name).match(new RegExp('(?:^|\\n)'+key+' *= *([^\\r\\n]*)'))?.[1]?.trim()||fallback;
export function createWorldPlayback(root,course,parentPid){
 let running=null,opening=false;
 return async(path,recorded)=>{
  if(running||opening)throw Error('Close the current replay first.');
  opening=true;
  const progress=new LaunchProgress(root,{heading:'Opening your replay',detail:'The replay player is installed once, then reused.'});
  try{
  const local=course.courses?.find(c=>c.id===recorded.id);
  if(!local||!isHash(recorded.id)||local.dolSha256!==course.dolSha256||local.stageSha256!==course.stageHashes?.[`GrT${local.suffix}.dat`])throw Error('This replay needs another level version.');
  await progress.show('Checking the replay level version...');
  await verifyCourseIso(course.iso,{[`GrT${local.suffix}.dat`]:local.stageSha256},local.dolSha256);
  await ensurePlayback(root,{directory:'Playback',onProgress:message=>progress.show(message)});
  const exe=join(root,'Playback/Slippi Dolphin.exe');
  await progress.show('Opening the replay...');
  const profile=join(root,'.local/worlds-playback',recorded.id);
  await mkdir(join(profile,'Config'),{recursive:true});await mkdir(join(profile,'GameSettings'),{recursive:true});
  const original=await readFile(join(root,'User/Config/Dolphin.ini'),'utf8');
  const x=value(original,'Display','RenderWindowXPos','20'),y=value(original,'Display','RenderWindowYPos','20');
  const w=value(original,'Display','RenderWindowWidth','1280'),h=value(original,'Display','RenderWindowHeight','960');
  const volume=value(original,'DSP','Volume','100');
  await writeFile(join(profile,'Config/Dolphin.ini'),`[Core]\nEnableCheats = True\nEXIDevice1 = 10\nSlippiSaveReplays = False\nSlippiRegenerateReplays = False\nSIDevice0 = 6\nSIDevice1 = 0\nSIDevice2 = 0\nSIDevice3 = 0\nGFXBackend = ${value(original,'Core','GFXBackend','D3D')}\n[Interface]\nConfirmStop = False\nPauseOnFocusLost = False\n[Display]\nFullscreen = False\nRenderToMain = False\nRenderWindowXPos = ${x}\nRenderWindowYPos = ${y}\nRenderWindowWidth = ${w}\nRenderWindowHeight = ${h}\n[DSP]\nVolume = ${volume}\n[Analytics]\nEnabled = False\nPermissionAsked = True\n`);
  await copyFile(join(root,'User/Config/GFX.ini'),join(profile,'Config/GFX.ini')).catch(()=>{});
  // Playback applies the recording's own Gecko list. It never enables live online/recording codes.
  await writeFile(join(profile,'GameSettings/GALE01.ini'),`[Gecko]\n$Custom Melee BTT Playback Stage Context\n044D49E8 ${recorded.stageId.toString(16).padStart(8,'0').toUpperCase()}\n[Gecko_Enabled]\n$Custom Melee BTT Playback Stage Context\n$Required: General Codes\n$Required: Slippi Playback\n[Gecko_Disabled]\n$Recommended: Slippi Recording\n$Optional: Show Player Names\n`);
  const command=join(profile,'replay.json');await writeFile(command,JSON.stringify({mode:'normal',replay:path,commandId:randomUUID(),shouldResync:true,rollbackDisplayMethod:'off'}));
  const child=spawn(exe,['--user',profile,'--exec',course.iso,'-i',command,'--batch'],{cwd:root,windowsHide:false,stdio:'ignore'});running=child;
  child.once('exit',()=>{running=null;});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>{running=null;reject(Error('Replay player could not start.'));});});
  const watcher=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'scripts/watch_world_replay.ps1'),'-Root',root,'-ReplayPid',String(child.pid),'-ParentPid',String(parentPid||0)],{windowsHide:true,stdio:'ignore'});
  watcher.on('error',()=>{});
  }finally{opening=false;await progress.close();}
 };
}
