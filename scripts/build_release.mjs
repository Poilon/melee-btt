// Build a Windows portable ZIP from an explicit list of public source files.
import {cp,mkdir,readFile,writeFile,rm,readdir,rename,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {inventory} from '../desktop/update-files.mjs';
import {generateChallenge} from '../src/challenge.mjs';
import {readSources} from '../src/upstream.mjs';
import {downloadVerified} from '../server/onboarding.mjs';
const exec=promisify(execFile),root=resolve(import.meta.dirname,'..');
const version=(process.env.TTRC_VERSION||'0.9.4').replace(/^v/,'');
if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version))throw new Error('Invalid release version.');
const output=join(root,'build/release'),app=join(output,'TTRC');
const nativeBuild=resolve(process.env.TTRC_DOLPHIN_BUILD||join(root,'build/dolphin-build'));
// A release must contain the genuine compiled native integration, not a renamed launcher.
const nativeExe=await readFile(join(nativeBuild,'Slippi Dolphin.exe'));
if(nativeExe.subarray(0,2).toString()!=='MZ')throw new Error('Native Dolphin build missing.');
await rm(app,{recursive:true,force:true});await mkdir(app,{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex');
function publicRuntimeFile(source){
 if(source.includes('__pycache__')||source.endsWith('Start TTRC.cmd')||source.endsWith('desktop/start.mjs'))return false;
 // Authoring PNGs duplicate the encoded game textures and the editor's own
 // images. Keep those originals in GitHub, not in every portable installation.
 const stageArt=join(root,'assets/custom-stages')+'/';
 if(source.startsWith(stageArt)&&source.endsWith('.png')){
  const relative=source.slice(stageArt.length);
  if(relative.includes('/')&&!relative.startsWith('background-textures/'))return false;
 }
 return true;
}
for(const name of ['server','shared','src','scripts','companion','web','assets','desktop'])await cp(join(root,name),join(app,name),{recursive:true,filter:publicRuntimeFile});
await mkdir(join(app,'generator-sources'),{recursive:true});
for(const [name,source] of Object.entries(await readSources()))await writeFile(join(app,'generator-sources',name),source);
await cp(join(root,'desktop/companion.vbs'),join(app,'TTRC Companion.vbs'));
await cp(join(root,'package.json'),join(app,'package.json'));await cp(join(root,'package-lock.json'),join(app,'package-lock.json'));
const saved=JSON.parse(await readFile(join(root,'challenges/current/challenge.json'),'utf8'));
const generated=await generateChallenge(saved.rules);
if(generated.manifest.id!==saved.id||JSON.stringify(generated.manifest.assignments)!==JSON.stringify(saved.assignments))throw new Error('Release challenge does not reproduce.');
const manifest=JSON.stringify(generated.manifest,null,2)+'\n';
await mkdir(join(app,'build/challenge'),{recursive:true});
await writeFile(join(app,'build/challenge/challenge.json'),manifest);await writeFile(join(app,'build/challenge/code.txt'),generated.gecko);
await writeFile(join(app,'release.json'),JSON.stringify({version,channel:'beta',repository:'Poilon/target-test-randomizer-challenge',challengeSha256:hash(manifest),geckoSha256:hash(generated.gecko),native:true,dolphinSha256:hash(nativeExe),dolphinUpstream:'e7711b104b339a99385f2bb12b472d46140a7bc7'},null,2));
await writeFile(join(app,'READ ME.txt'),`TTRC Dolphin Beta ${version}\r\n\r\nThis is a beta version.\r\n\r\n1. Extract the entire ZIP into a writable folder.\r\n2. Open Slippi Dolphin.exe. On first launch, choose your original Melee USA 1.02 ISO in Dolphin.\r\n3. TTRC builds the 26 published levels and opens the game. Your original ISO is unchanged. Later launches open TTRC directly.\r\n4. In Stadium, choose Log in. Sign in or create a username/password account in your browser; the game connects automatically.\r\n5. Choose Target Test to play, or Leaderboard to see records and watch replays. Start in the leaderboard opens Total time (all 26 characters required).\r\n\r\nTTRC Companion.vbs opens settings and the level editor. Launch Dolphin plays the same published levels. Editor drafts are separate playtests.\r\nController setup: Dolphin > Controllers. Close the game before changing music or rumble.\r\nThe companion stays open after Dolphin closes. Use Quit companion to stop it.\r\nUpdates download in the background and install after Dolphin closes. Accounts, ISOs, settings and replays are preserved.\r\nReplays of the published levels are saved beside their Dolphin in .local/custom-stages/character-worlds/Dolphin/Replays.\r\nThe original Melee ISO is not included or uploaded. Windows 10/11 x64.\r\nThis is a TTRC modification of Slippi Dolphin, not an official Slippi release.\r\n`);
await writeFile(join(app,'THIRD-PARTY-NOTICES.txt'),`Dolphin: GPL-2.0-or-later, see LICENSE-Dolphin.txt.\r\nComplete matching source, including the TTRC modifications and bundled submodules:\r\nhttps://github.com/Poilon/target-test-randomizer-challenge/releases/download/v${version}/TTRC-Dolphin-Source.tar.gz\r\nBased on project-slippi/Ishiiruka e7711b104b339a99385f2bb12b472d46140a7bc7.\r\nNode.js license: runtime/node/LICENSE\r\nPython license: runtime/python/LICENSE.txt\r\nJavaScript dependency licenses: node_modules/*/LICENSE*\r\nMelee artwork: web/assets/melee/CREDITS.txt\r\nPlayback Dolphin is downloaded from the official Slippi release when first needed.\r\nNo game ISO or user data is included.\r\n`);
const dependencies=JSON.parse(await readFile(join(root,'desktop/dependencies.json'),'utf8'));
for(const kind of ['node','python','netplay']){
 const dependency=dependencies[kind],archive=join(root,'build/downloads',kind+'.zip');
 let valid=false;try{valid=hash(await readFile(archive))===dependency.sha256;}catch{}
 if(!valid){console.log(`Downloading ${kind}…`);await downloadVerified(dependency.url,archive,dependency.sha256);}
 const temp=join(output,kind+'-unpack');await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});
 await exec('unzip',['-q',archive,'-d',temp]);
 const target=kind==='netplay'?app:join(app,'runtime',kind);await mkdir(target,{recursive:true});
 if(kind==='node'){
  const folder=(await readdir(temp))[0];
  for(const file of ['node.exe','LICENSE'])await cp(join(temp,folder,file),join(target,file));
 }else if(kind==='netplay'){
  await cp(temp,target,{recursive:true});
  await rm(join(app,'User'),{recursive:true,force:true});
  // This is our staging copy, never the player's separate Slippi installation.
  await exec('python3',[join(root,'scripts/patch_memory_card.py'),join(app,'Sys/GameSettings/GALE01r2.ini')]);
  await writeFile(join(app,'Slippi Dolphin.exe'),nativeExe);
  await cp(join(nativeBuild,'LICENSE-Dolphin.txt'),join(app,'LICENSE-Dolphin.txt'));
  await writeFile(join(app,'portable.txt'),'');
 }else{
  await cp(temp,target,{recursive:true});
  const pth=(await readdir(target)).find(f=>f.endsWith('._pth'));
  await writeFile(join(target,pth),(await readFile(join(target,pth),'utf8'))+'\n../../scripts\n');
 }
 await rm(temp,{recursive:true,force:true});
}
await exec('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:app,maxBuffer:1024*1024});
// npm's POSIX command symlinks are not used by the portable Windows app.
await rm(join(app,'node_modules/.bin'),{recursive:true,force:true});
async function audit(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()){if(['.local','.git','.cache'].includes(entry.name))throw new Error('Private directory in release');await audit(path);}else if(/\.(iso|gcm|rvz|slp|sqlite|db)$/i.test(entry.name)||/^(user.*\.json|\.env.*|reviewer\.key)$/i.test(entry.name))throw new Error('Private file in release: '+entry.name);}}
await audit(app);
await writeFile(join(app,'update-manifest.json'),JSON.stringify({format:1,version,files:await inventory(app)}));
const zip=join(output,'TTRC-Windows-x64.zip');await rm(zip,{force:true});
await exec('zip',['-qr',zip,'TTRC'],{cwd:output,maxBuffer:1024*1024});
if((await stat(zip)).size>500_000_000)throw Error('Release exceeds the download limit of existing TTRC updaters.');
const source=join(output,'TTRC-Dolphin-Source.tar.gz');
await cp(join(nativeBuild,'TTRC-Dolphin-Source.tar.gz'),source);
const versionedName=`TTRC-Dolphin-v${version}-Beta-Windows-x64.zip`;
await cp(zip,join(output,versionedName));
await writeFile(join(output,'SHA256SUMS.txt'),`${hash(await readFile(zip))}  TTRC-Windows-x64.zip\n${hash(await readFile(zip))}  ${versionedName}\n${hash(await readFile(source))}  TTRC-Dolphin-Source.tar.gz\n`);
console.log(zip);
