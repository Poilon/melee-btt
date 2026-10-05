import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export const SITE_ORIGIN='https://www.melee-btt.com';
const officialOrigins=new Set([SITE_ORIGIN,'https://melee-btt.com','https://target-test-randomizer-challenge.vercel.app']);
export function normalizeAccount(file,origin=SITE_ORIGIN){
 if(!file||!(file.origin===origin||(officialOrigins.has(origin)&&officialOrigins.has(file.origin)))||!/^[a-f0-9]{64}$/.test(file.id)||!/^[a-f0-9]{64}$/.test(file.token))return null;
 return {...file,origin};
}
// One credential per installation, shared by the game and companion. A logout
// is a persistent empty session so old profile files cannot sign the user back in.
export class AccountSession{
 constructor(path,{origin=SITE_ORIGIN,legacy=[]}={}){this.path=path;this.origin=origin;this.legacy=legacy;}
 async load(){
  try{const value=JSON.parse(await readFile(this.path,'utf8'));return value.signedOut?null:normalizeAccount(value,this.origin);}
  catch(error){if(error.code!=='ENOENT')return null;}
  for(const path of this.legacy){
   try{const player=normalizeAccount(JSON.parse(await readFile(path,'utf8')),this.origin);if(player){await this.save(player);return player;}}catch{}
  }
  return null;
 }
 async write(value){
  await mkdir(dirname(this.path),{recursive:true});const temp=this.path+'.'+randomUUID()+'.tmp';
  await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,this.path);
 }
 async save(value){const player=normalizeAccount(value,this.origin);if(!player)throw Error('Invalid account response.');await this.write(player);return player;}
 async clear(){await this.write({signedOut:true});}
}
