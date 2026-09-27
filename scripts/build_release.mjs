// Build a Windows portable ZIP from an explicit list of public source files.
import {cp,mkdir,readFile,writeFile,rm,readdir,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {generateChallenge} from '../src/challenge.mjs';
import {downloadVerified} from '../server/onboarding.mjs';
const exec=promisify(execFile),root=resolve(import.meta.dirname,'..');
const version=(process.env.TTRC_VERSION||'0.1.0').replace(/^v/,'');
if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version))throw new Error('Invalid release version.');
const output=join(root,'build/release'),app=join(output,'TTRC');
await rm(app,{recursive:true,force:true});await mkdir(app,{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex');
for(const name of ['server','shared','src','scripts','companion','web','assets','desktop'])await cp(join(root,name),join(app,name),{recursive:true,filter:source=>!source.includes('__pycache__')});
await cp(join(root,'package.json'),join(app,'package.json'));await cp(join(root,'package-lock.json'),join(app,'package-lock.json'));
const saved=JSON.parse(await readFile(join(root,'challenges/current/challenge.json'),'utf8'));
const generated=await generateChallenge(saved.rules);
if(generated.manifest.id!==saved.id||JSON.stringify(generated.manifest.assignments)!==JSON.stringify(saved.assignments))throw new Error('Release challenge does not reproduce.');
const manifest=JSON.stringify(generated.manifest,null,2)+'\n';
await mkdir(join(app,'build/challenge'),{recursive:true});
await writeFile(join(app,'build/challenge/challenge.json'),manifest);await writeFile(join(app,'build/challenge/code.txt'),generated.gecko);
await writeFile(join(app,'release.json'),JSON.stringify({version,repository:'Poilon/target-test-randomizer-challenge',challengeSha256:hash(manifest),geckoSha256:hash(generated.gecko)},null,2));
await mkdir(join(app,'Games'),{recursive:true});
await writeFile(join(app,'Games/PUT-YOUR-ISO-HERE.txt'),'Put your original Melee USA 1.02 ISO here as Melee.iso, or use Choose Melee ISO in the companion. The game is not included.\r\n');
await cp(join(root,'desktop/Start TTRC.cmd'),join(app,'Start TTRC.cmd'));
await writeFile(join(app,'READ ME.txt'),`TTRC Companion ${version}\r\n\r\n1. Extract this entire ZIP into a writable folder (not Program Files).\r\n2. Double-click Start TTRC.cmd and keep its window open.\r\n3. Choose your original Melee USA 1.02 ISO, then click Set up Dolphin.\r\n4. Create your player at https://target-test-randomizer-challenge.vercel.app and import user.json.\r\n5. Connect your controller and launch Dolphin.\r\n\r\nWindows 10/11 x64. Internet and 2 GB free space needed for first-time setup.\r\nNo WSL, Node.js, Python, or Slippi account installation required.\r\nAdapters may require their Windows driver.\r\nBack up .local, Games, build/replay-profiles and Dolphin/netplay/Replays before changing folders.\r\nUpdate: extract a newer release into the SAME folder and replace application files.\r\nYour player and recordings are not included in release ZIPs and will be kept.\r\n`);
await writeFile(join(app,'THIRD-PARTY-NOTICES.txt'),'Node.js license: runtime/node/LICENSE\r\nPython license: runtime/python/LICENSE.txt\r\nJavaScript dependency licenses: node_modules/*/LICENSE*\r\nMelee artwork: web/assets/melee/CREDITS.txt\r\nDolphin is downloaded directly from official Slippi GitHub releases during setup.\r\nSlippi source and license: https://github.com/project-slippi/Ishiiruka and https://github.com/project-slippi/Ishiiruka-Playback\r\nGenerator and Gecko credits: README.md in the source repository. No game ISO or user data is included.\r\n');
const dependencies=JSON.parse(await readFile(join(root,'desktop/dependencies.json'),'utf8'));
for(const kind of ['node','python']){
 const dependency=dependencies[kind],archive=join(root,'build/downloads',kind+'.zip');
 let valid=false;try{valid=hash(await readFile(archive))===dependency.sha256;}catch{}
 if(!valid){console.log(`Downloading ${kind}…`);await downloadVerified(dependency.url,archive,dependency.sha256);}
 const temp=join(output,kind+'-unpack');await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});
 await exec('unzip',['-q',archive,'-d',temp]);
 const target=join(app,'runtime',kind);await mkdir(target,{recursive:true});
 if(kind==='node'){
  const folder=(await readdir(temp))[0];
  for(const file of ['node.exe','LICENSE'])await cp(join(temp,folder,file),join(target,file));
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
await writeFile(join(output,'SHA256SUMS.txt'),`${hash(await readFile(zip))}  TTRC-Windows-x64.zip\n`);
console.log(zip);
