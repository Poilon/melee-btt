import {writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {generateChallenge} from '../src/challenge.mjs';
export async function verifyChallengePackage(pack){
  if(!pack?.manifest?.rules||typeof pack.gecko!=='string')throw new Error('Invalid challenge download.');
  const generated=await generateChallenge(pack.manifest.rules);
  if(JSON.stringify(pack.manifest)!==JSON.stringify(generated.manifest)||pack.gecko!==generated.gecko)throw new Error('Challenge does not match the verified generator.');
  return generated;
}
export async function saveChallengePackage(directory,generated){
  await mkdir(directory,{recursive:true});
  const pack=JSON.stringify({manifest:generated.manifest,gecko:generated.gecko});
  // Commit one complete snapshot first; startup can repair an interrupted pair of files.
  await writeFile(join(directory,'online.json.tmp'),pack);await rename(join(directory,'online.json.tmp'),join(directory,'online.json'));
  await writeFile(join(directory,'challenge.json'),JSON.stringify(generated.manifest,null,2)+'\n');
  await writeFile(join(directory,'code.txt'),generated.gecko);
}
export class OnlineChallenge {
  constructor(origin,currentId,fetcher=fetch){this.origin=origin;this.currentId=currentId;this.fetcher=fetcher;}
  status(){return {available:Boolean(this.pending),seed:this.pending?.manifest.rules.seed,error:this.error||null};}
  check(){
    if(this.checking)return this.checking;
    this.checking=(async()=>{
    try{
      const response=await this.fetcher(`${this.origin}/api/challenge/current`,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error();
      const body=await response.text();if(body.length>1024*1024)throw new Error();
      const pack=JSON.parse(body);if(!/^[a-f0-9]{64}$/.test(pack?.manifest?.id||'')||!Number.isSafeInteger(pack.manifest.rules?.seed))throw new Error();
      this.pending=pack.manifest.id===this.currentId?null:pack;this.error=null;
    }catch{this.error='Could not check for a new challenge. Your local challenge is still available.';}
    finally{this.checking=null;}
    })();return this.checking;
  }
  async prepare(){if(!this.pending)return null;return verifyChallengePackage(this.pending);}
}
