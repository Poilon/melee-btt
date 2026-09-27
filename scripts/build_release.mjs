// Build a Windows portable ZIP from an explicit list of public source files.
import {cp,mkdir,readFile,writeFile,rm,readdir,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {generateChallenge} from '../src/challenge.mjs';
import {downloadVerified} from '../server/onboarding.mjs';
const exec=promisify(execFile),root=resolve(import.meta.dirname,'..');
const version=(process.env.TTRC_VERSION||'0.6.0').replace(/^v/,'');
if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version))throw new Error('Invalid release version.');
const output=join(root,'build/release'),app=join(output,'TTRC');
const nativeBuild=resolve(process.env.TTRC_DOLPHIN_BUILD||join(root,'build/dolphin-build'));
// A release must contain the genuine compiled native integration, not a renamed launcher.
const nativeExe=await readFile(join(nativeBuild,'Slippi Dolphin.exe'));
if(nativeExe.subarray(0,2).toString()!=='MZ')throw new Error('Native Dolphin build missing.');
await rm(app,{recursive:true,force:true});await mkdir(app,{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex');
for(const name of ['server','shared','src','scripts','companion','web','assets','desktop'])await cp(join(root,name),join(app,name),{recursive:true,filter:source=>!source.includes('__pycache__')&&!source.endsWith('Start TTRC.cmd')&&!source.endsWith('desktop/start.mjs')});
await cp(join(root,'desktop/companion.vbs'),join(app,'TTRC Companion.vbs'));
await cp(join(root,'package.json'),join(app,'package.json'));await cp(join(root,'package-lock.json'),join(app,'package-lock.json'));
const saved=JSON.parse(await readFile(join(root,'challenges/current/challenge.json'),'utf8'));
const generated=await generateChallenge(saved.rules);
if(generated.manifest.id!==saved.id||JSON.stringify(generated.manifest.assignments)!==JSON.stringify(saved.assignments))throw new Error('Release challenge does not reproduce.');
const manifest=JSON.stringify(generated.manifest,null,2)+'\n';
await mkdir(join(app,'build/challenge'),{recursive:true});
await writeFile(join(app,'build/challenge/challenge.json'),manifest);await writeFile(join(app,'build/challenge/code.txt'),generated.gecko);
await writeFile(join(app,'release.json'),JSON.stringify({version,repository:'Poilon/target-test-randomizer-challenge',challengeSha256:hash(manifest),geckoSha256:hash(generated.gecko),native:true,dolphinSha256:hash(nativeExe),dolphinUpstream:'e7711b104b339a99385f2bb12b472d46140a7bc7'},null,2));
await writeFile(join(app,'READ ME.txt'),`TTRC Dolphin ${version}\r\n\r\n1. Extract this entire ZIP into a writable folder.\r\n2. Open TTRC Companion.vbs. Sign in and set music and controller rumble before launching Dolphin.\r\n3. Click Launch Dolphin in the companion, then Open in Dolphin and select your original Melee USA 1.02 ISO. It stays where it is.\r\n4. Your runs and replay history stay in the companion. Tools > TTRC Companion reopens it.\r\n5. Click Sign in in the companion, create an account with a unique username and password, and confirm the matching connection code before a scored run.\r\n\r\nThe companion stays open when Dolphin closes. Use Quit companion to stop it. Music and rumble changes apply the next time Dolphin starts. Replays are saved in Replays next to Dolphin.\r\nPlayback Dolphin downloads from the official Slippi release the first time you watch a replay.\r\nWindows 10/11 x64. Your controller can be configured in Dolphin > Controllers.\r\nThe ISO is not included and is never uploaded.\r\nClose Dolphin and Quit companion, then back up .local, User and Replays before updating. Extract updates into the same folder.\r\nThis is a TTRC modification of Slippi Dolphin, not an official Slippi release.\r\n`);
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
async function audit(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()){if(['.local','.git','.cache'].includes(entry.name))throw new Error('Private directory in release');await audit(path);}else if(/\.(iso|gcm|rvz|slp|sqlite|db)$/i.test(entry.name)||/^(user.*\.json|\.env.*|reviewer\.key)$/i.test(entry.name))throw new Error('Private file in release: '+entry.name);}}
await audit(app);
const zip=join(output,'TTRC-Windows-x64.zip');await rm(zip,{force:true});
await exec('zip',['-qr',zip,'TTRC'],{cwd:output,maxBuffer:1024*1024});
const source=join(output,'TTRC-Dolphin-Source.tar.gz');
await cp(join(nativeBuild,'TTRC-Dolphin-Source.tar.gz'),source);
await writeFile(join(output,'SHA256SUMS.txt'),`${hash(await readFile(zip))}  TTRC-Windows-x64.zip\n${hash(await readFile(source))}  TTRC-Dolphin-Source.tar.gz\n`);
console.log(zip);
