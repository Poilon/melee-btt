import {makeWorldCatalog} from '../desktop/worlds-catalog.mjs';
import {validateProject,validateStagePack} from '../web/editor/model.js';
const customEditorStageIds=['Ca','Dk','Fx','Gw','Kb','Kp','Lk','Lg','Mr','Ms','Mt','Ns','Pe','Pk','Ic','Pr','Ss','Ys','Zd','Sk','Fc','Cl','Dr','Fe','Pc','Gn'];
import {readFile,writeFile,mkdir,stat,access,readdir,link,copyFile,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pythonExecutable,windowsPath,localPath} from './platform.mjs';
import {verifyIso} from './onboarding.mjs';
const exec=promisify(execFile);
export const customStageCatalog=Object.freeze([
 {id:'character-worlds',name:'Character Worlds',builder:'build_character_worlds.py',character:'All characters',targets:10,preview:'/assets/custom-stages/character-worlds-all.png',thumbnail:'/assets/custom-stages/character-worlds.png',description:'26 worlds with moving platforms, hazards and target cycles. Choose your character in Target Test. For Sheik, select Zelda and hold A while starting.'},
 {id:'stage-editor',name:'Editor Playtest',builder:'build_character_worlds.py',character:'Selected character',targets:10},
 {id:'stage-editor-all',name:'TTRC Edited Worlds',builder:'build_character_worlds.py',character:'All characters',targets:10},
 {id:'grassland-1',name:'Grassland 1',builder:'build_grassland.py',character:'Fox',targets:10,preview:'/assets/custom-stages/grassland-1.png',description:'Pipes, coloured blocks and a route through the hills.'},
]);
export class CustomStageError extends Error {}
const exists=async p=>access(p).then(()=>true,()=>false);
// Hard links share immutable application bytes, never the player's User directory.
// Updates replace files with rename(), so a running course keeps its original build.
async function shareFile(source,target){
 const [src,dst]=await Promise.all([stat(source),stat(target).catch(()=>null)]);
 if(dst&&src.ino===dst.ino&&src.dev===dst.dev)return;
 await mkdir(dirname(target),{recursive:true});await rm(target,{force:true});
 try{await link(source,target);}catch(e){if(!['EXDEV','EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;await copyFile(source,target);}
}
async function shareTree(source,target){
 await mkdir(target,{recursive:true});
 for(const entry of await readdir(source,{withFileTypes:true})){
  if(entry.isDirectory())await shareTree(join(source,entry.name),join(target,entry.name));
  else if(entry.isFile())await shareFile(join(source,entry.name),join(target,entry.name));
 }
}
export class CustomStages {
 constructor({root,getRuntime,run=exec}){this.root=root;this.getRuntime=getRuntime;this.run=run;this.busy=false;this.message='';this.activeId=null;}
 directory(id='grassland-1'){if(!customStageCatalog.some(s=>s.id===id))throw new CustomStageError('Unknown custom stage.');return join(this.root,'.local/custom-stages',id);}
 async list(){
  const available=Boolean(this.getRuntime()?.native);
  return Promise.all(customStageCatalog.filter(stage=>!stage.id.startsWith('stage-editor')).map(async stage=>({...stage,available,busy:this.busy,message:stage.id===this.activeId?this.message:'',
   prepared:await exists(join(this.directory(stage.id),'prepared.json'))})));
 }
 async running(){
  for(const course of customStageCatalog){
  const executable=join(this.directory(course.id),'Dolphin/Slippi Dolphin.exe');
  if(!await exists(executable))continue;
  const {stdout}=await this.run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',await windowsPath(join(this.root,'scripts/launch_custom_stage.ps1')),'-Executable',await windowsPath(executable),'-CheckOnly'],{windowsHide:true,timeout:15000});
  if(JSON.parse(stdout.trim()).status==='already-running')return true;
  }
  return false;
 }
 async launch(id,project=null){
  const dir=this.directory(id),runtime=this.getRuntime(),course=customStageCatalog.find(s=>s.id===id);
  if(!runtime?.native)throw new CustomStageError('TTRC stages require TTRC Dolphin.');
  if(this.busy)throw new CustomStageError('A custom stage is already being prepared.');
  if(await this.running())return {status:'already-running'};
  this.busy=true;this.activeId=id;this.message='Checking Melee ISO…';
  try{
   // Re-read the native selection, which can change without restarting the companion.
   const latest=JSON.parse(await readFile(join(this.root,'build/challenge/runtime.json'),'utf8'));
   if(!latest.iso)throw new CustomStageError('Open your Melee ISO once in TTRC Dolphin, then try again.');
   const source=await localPath(latest.iso);
   const info=await stat(source).catch(()=>{throw new CustomStageError('Your Melee ISO is unavailable. Select it again in TTRC Dolphin.');});
   const online=id==='character-worlds'||id==='stage-editor-all';
   const builder=join(this.root,'scripts',course.builder);
   const hash=createHash('sha256').update(await readFile(builder)).update(await readFile(join(this.root,'scripts/build_grassland.py')));
   if(id==='character-worlds'||id.startsWith('stage-editor')){
    for(const name of ['character_mansion.py','character_fire.py','character_layouts.py','character_routes.py','target_encounters.py','character_encounters.py','world_props.py','stage_access.py','painted_surfaces.py','stage_texture.py','world_mechanics.py','world_gameplay.py','world_challenge.py','doc_chemicals.py','stage_entities.py','retail_actors.py'])hash.update(await readFile(join(this.root,'scripts',name)));
    hash.update(await readFile(join(this.root,'assets/custom-stages/mechanisms/corneria-access.json')));
    const actors=join(this.root,'assets/custom-stages/retail-actors');
    for(const name of ['modular_stage.py','floor_gaps.py','solid_readability.py','native_encounters.py','native/world-retail.s','native/world-retail.bin','native_props.py','roster_mechanisms.py','native/world-wind.s','native/world-wind.bin'])hash.update(await readFile(join(this.root,'scripts',name)));
    const modular=join(this.root,'assets/custom-stages/modular');
    for(const stage of (await readdir(modular)).sort()){
     const dir=join(modular,stage);
     for(const file of (await readdir(dir)).filter(n=>n.endsWith('.json')||n.endsWith('.cmpr')||n.endsWith('.rgba8')).sort())hash.update(stage+'/'+file).update(await readFile(join(dir,file)));
    }
    for(const key of ['brick','wood','manor-floor'])for(const file of ['scene.json','texture.cmpr'])hash.update(key+'/'+file).update(await readFile(join(this.root,'assets/custom-stages/basic',key,file)));
    const props=join(this.root,'assets/custom-stages/native-props');
    for(const entry of (await readdir(props,{withFileTypes:true})).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
     for(const name of ['model.dat','model.json'])hash.update(entry.name+'/'+name).update(await readFile(join(props,entry.name,name)));
    }
    hash.update(await readFile(join(this.root,'scripts/adventure_mechanisms.py')));
    for(const name of ['corneria_arwings.py','native/world-arwing.bin','native/world-arwing.s','native/world-arwing-symbols.json','world_chest.py','native/world-chest.bin','native/world-chest.s','native/world-chest-symbols.json'])hash.update(await readFile(join(this.root,'scripts',name)));
    for(const kind of ['plant','ghost','fireball','arwing','wolfen','beamos','beam','octorok','rock','deku','wallmaster','chest']){
     for(const name of (await readdir(join(actors,kind))).sort())hash.update(kind+'/'+name).update(await readFile(join(actors,kind,name)));
    }
    const art=join(this.root,'assets/custom-stages/manor');
    for(const name of (await readdir(art)).filter(name=>name==='scene.json'||name.endsWith('.cmpr')).sort())hash.update(await readFile(join(art,name)));
    const worlds=join(this.root,'assets/custom-stages/worlds');
    const housing=join(worlds,'Pk/solid-housing');
    for(const name of (await readdir(housing)).filter(name=>name==='scene.json'||name.endsWith('.cmpr')).sort())hash.update('Pk/solid-housing/'+name).update(await readFile(join(housing,name)));
    hash.update(await readFile(join(worlds,'movement.json')));
    for(const entry of (await readdir(worlds,{withFileTypes:true})).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
     const dir=join(worlds,entry.name);
     for(const name of (await readdir(dir)).filter(name=>name==='scene.json'||name==='chemicals.json'||name==='props.json'||name.endsWith('.cmpr')||name.endsWith('.rgba8')).sort())hash.update(entry.name+'/'+name).update(await readFile(join(dir,name)));
    }
   }
   let editorProject;
   if(id==='stage-editor-all'||id==='character-worlds'){
    if(id==='character-worlds')project=JSON.parse(await readFile(join(this.root,'web/editor/published-levels.json'),'utf8'));
    const bases=await Promise.all(customEditorStageIds.map(s=>readFile(join(this.root,'web/editor/data',s+'.json'),'utf8').then(JSON.parse)));
    const errors=validateStagePack(project,bases);if(errors.length)throw new CustomStageError(errors.join(' '));
    editorProject=JSON.stringify(project);
    hash.update(await readFile(join(this.root,'scripts/stage_project.py'))).update(editorProject).update(JSON.stringify(bases));
   }
   if(id==='stage-editor'){
    if(!project||!customEditorStageIds.includes(project.stage))throw new CustomStageError('Choose a supported editor stage.');
    const base=JSON.parse(await readFile(join(this.root,'web/editor/data',project.stage+'.json'),'utf8'));
    const {errors}=validateProject(project,base);if(errors.length)throw new CustomStageError(errors.join(' '));
    editorProject=JSON.stringify(project);
    hash.update(await readFile(join(this.root,'scripts/stage_project.py'))).update(editorProject).update(JSON.stringify(base));
   }
   if(online)for(const name of ['online_menu.py','native/online-menu.bin','native/online-menu-hook.bin','native/online-menu.json','native/leaderboard-label.ia4'])hash.update(await readFile(join(this.root,'scripts',name)));
   const builderHash=hash.digest('hex');
   const fingerprint=JSON.stringify({source:resolve(source),size:info.size,modified:info.mtimeMs,
    builder:builderHash});
   const iso=join(dir,course.name+'.iso'),stamp=join(dir,'prepared.json');
   let cached;try{cached=JSON.parse(await readFile(stamp,'utf8'));}catch{}
   if(cached?.fingerprint!==fingerprint||!await exists(iso)){
    await verifyIso(source).catch(()=>{throw new CustomStageError('Use an original Melee USA 1.02 ISO to prepare this course.');});
    this.message=`Building ${course.name}… First launch only.`;
    await mkdir(dir,{recursive:true});
    const args=[builder,'--iso',source,'--output',iso,'--no-preview'];
    if(online)args.push('--online');
    if(editorProject){const projectFile=join(dir,'project.json');await writeFile(projectFile,editorProject);args.push('--editor-project',projectFile);}
    // The embedded Windows Python expects Windows paths; development uses local Python.
    try{await this.run(pythonExecutable(this.root),args,{timeout:300000,windowsHide:true});}
    catch(error){const match=String(error.stderr||'').match(/ProjectError: ([^\r\n]+)/);if(match)throw new CustomStageError(match[1]);throw error;}
    await writeFile(stamp,JSON.stringify({fingerprint}));
   }
   this.message='Preparing Dolphin…';
   const bundle=join(dir,'Dolphin');await mkdir(bundle,{recursive:true});
   for(const entry of await readdir(this.root,{withFileTypes:true})){
    if(entry.isFile()&&(entry.name==='Slippi Dolphin.exe'||entry.name.endsWith('.dll')||entry.name==='release.json'))
     await shareFile(join(this.root,entry.name),join(bundle,entry.name));
   }
   await shareTree(join(this.root,'Sys'),join(bundle,'Sys'));
   await shareFile(join(this.root,'runtime/node/node.exe'),join(bundle,'runtime/node/node.exe'));
   await mkdir(join(bundle,'desktop'),{recursive:true});
   await copyFile(join(this.root,'desktop/custom-stage-native.mjs'),join(bundle,'desktop/native.mjs'));
   await writeFile(join(bundle,'portable.txt'),'');
   const stage=JSON.parse(await readFile(join(dir,course.name+'.json'),'utf8'));

   await this.run(pythonExecutable(this.root),[join(this.root,'scripts/prepare_custom_stage.py'),'--bundle',bundle,
    '--source-profile',runtime.profile,'--iso',iso,'--course-id',id.startsWith('stage-editor')?'character-worlds':id,'--name',course.name,...(online?['--online']:[]),...(id==='stage-editor'?['--character',String(customEditorStageIds.indexOf(project.stage))]:[])],{timeout:30000,windowsHide:true});
   let catalog;
   if(online){
    for(const name of ['custom-stage-native.mjs','worlds-online.mjs','worlds-capture.mjs','worlds-playback.mjs'])await copyFile(join(this.root,'desktop',name),join(bundle,'desktop',name));
    for(const name of ['worlds.mjs','replay.mjs','characters.mjs'])await shareFile(join(this.root,'shared',name),join(bundle,'shared',name));
    for(const name of ['watch_online.ps1','watch_world_replay.ps1','OnlineMemory.cs','DolphinReader.cs'])await shareFile(join(this.root,'scripts',name),join(bundle,'scripts',name));
    await shareTree(join(this.root,'node_modules'),join(bundle,'node_modules'));
    if(await exists(join(this.root,'Dolphin/playback')))await shareTree(join(this.root,'Dolphin/playback'),join(bundle,'Playback'));
    catalog=await makeWorldCatalog(bundle,stage);
   }
   await writeFile(join(bundle,'course.json'),JSON.stringify({id:id.startsWith('stage-editor')?'character-worlds':id,iso:await windowsPath(iso),stageSha256:stage.stageSha256,stageHashes:stage.stageHashes,dolSha256:stage.dolSha256,onlineVersion:stage.onlineVersion,menuHashes:stage.menuHashes,courses:catalog?.courses}));
   this.message=`Opening ${course.name}…`;
   const {stdout}=await this.run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    await windowsPath(join(this.root,'scripts/launch_custom_stage.ps1')),'-Executable',await windowsPath(join(bundle,'Slippi Dolphin.exe')),
    '-Iso',await windowsPath(iso),...(id.startsWith('stage-editor')?['-SecondaryDisplay']:[])],{timeout:30000,windowsHide:true});
   const result=JSON.parse(stdout.trim());this.message=id==='grassland-1'?'Choose Fox in Target Test.':'Choose any character in Target Test.';return result;
  }catch(error){
   this.message='';
   if(error instanceof CustomStageError)throw error;
   throw new CustomStageError('Could not prepare the course. Check free disk space and close its Dolphin window, then retry.');
  }finally{this.busy=false;}
 }
}
