import {createHash} from 'node:crypto';
import {realpath, open, readFile, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
export async function instanceId(root) {
  let path = await realpath(root);
  if (process.platform === 'win32') path = path.toLowerCase();
  return createHash('sha256').update(path).digest('hex');
}
export async function companionRunning(root, port) {
  let response;
  try { response = await fetch(`http://127.0.0.1:${port}/api/health`, {signal: AbortSignal.timeout(1500)}); }
  catch { return false; }
  const health = await response.json().catch(() => null);
  if (!response.ok || health?.instance !== await instanceId(root)) throw new Error('Port ' + port + ' is used by another application or TTRC folder. Close that companion first.');
  return true;
}
export async function checkCompanionPort(root, port) {
  if (await companionRunning(root, port)) return;
  await new Promise((resolve, reject) => {const probe=createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
}
// The lock spans preparation and serving, so simultaneous launches share one service.
export async function claimCompanion(root) {
  const path=join(root,'.local/companion.lock');
  for(let attempt=0;attempt<2;attempt++) {
    try { const file=await open(path,'wx');await file.writeFile(String(process.pid));await file.close();return async()=>{await rm(path,{force:true});}; }
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      const pid=Number(await readFile(path,'utf8').catch(()=>''));
      if(!pid){
        // A crash between creating the file and writing its PID must not block future starts.
        const info=await stat(path).catch(()=>null);
        if(info&&Date.now()-info.mtimeMs<120000)return null;
        await rm(path,{force:true});continue;
      }
      try {process.kill(pid,0);return null;} catch(error) {if(error.code!=='ESRCH')return null;}
      await rm(path,{force:true});
    }
  }
  return null;
}
