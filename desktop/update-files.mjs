// Portable release files only. Player data and the active challenge are never update targets.
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readdir,readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
export const repository='Poilon/melee-btt';
export const releaseRepositories=new Set([repository,'Poilon/target-test-randomizer-challenge']);
export const managedDirectories=new Set(['server','shared','src','scripts','companion','web','assets','desktop','generator-sources','runtime','node_modules','Sys','Languages']);
export const managedFiles=new Set(['Slippi Dolphin.exe','OpenAL32.dll','WebView2Loader.dll','slippi_rust_extensions.dll','slippi_rust_extensions.dll.lib','TTRC Companion.vbs','Custom Melee BTT Companion.vbs','package.json','package-lock.json','release.json','READ ME.txt','THIRD-PARTY-NOTICES.txt','LICENSE-Dolphin.txt','license.txt','FIX-VCRUNTIME140-ERROR.txt']);
export function allowedPath(path){
 if(typeof path!=='string'||path.includes('\\')||path.includes(':')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)))return false;
 if(/(?:^|\/)(?:\.local|\.git|user.*\.json|\.env.*|reviewer\.key)$/i.test(path)||/\.(?:iso|gcm|rvz|slp|sqlite|db)$/i.test(path))return false;
 return managedFiles.has(path)||path.includes('/')&&managedDirectories.has(path.split('/')[0]);
}
export async function fileHash(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export async function inventory(root){
 const files={};
 async function walk(dir,prefix=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   const name=prefix+entry.name,path=join(dir,entry.name);
   if(entry.isSymbolicLink())throw Error('Links are not allowed in an update.');
   if(entry.isDirectory()){if(prefix||managedDirectories.has(name))await walk(path,name+'/');}
   else if(allowedPath(name)){const info=await lstat(path);files[name]={size:info.size,sha256:await fileHash(path)};}
  }
 }
 await walk(root);return files;
}
export async function verifyUpdate(root,version){
 const manifest=JSON.parse(await readFile(join(root,'update-manifest.json'),'utf8'));
 const release=JSON.parse(await readFile(join(root,'release.json'),'utf8'));
 if(manifest.format!==1||manifest.version!==version||release.version!==version||!releaseRepositories.has(release.repository)||!release.native)throw Error('Update version does not match the release.');
 const files=manifest.files;if(!files||Object.keys(files).length>20000)throw Error('Invalid update manifest.');
 for(const required of ['release.json','Slippi Dolphin.exe','desktop/native.mjs','server/main.mjs','runtime/node/node.exe'])if(!files[required])throw Error('Incomplete update.');
 const actual=await inventory(root);
 if(Object.keys(actual).length!==Object.keys(files).length)throw Error('Unexpected update files.');
 for(const [name,expected]of Object.entries(files)){
  if(!allowedPath(name)||!actual[name]||actual[name].sha256!==expected.sha256||actual[name].size!==expected.size)throw Error('Update file verification failed.');
 }
 return manifest;
}
