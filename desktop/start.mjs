import {execFile} from 'node:child_process';
const port=Number(process.env.PORT||4317),url=`http://localhost:${port}`;
function open(){execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process '${url}'`],{windowsHide:true});}
try{
 const response=await fetch(url+'/api/dashboard',{signal:AbortSignal.timeout(1000)});
 const value=await response.json();
 if(value.scope==='local'&&value.challenge?.format==='ttrc-challenge-v1'){open();process.exit(0);}
 throw new Error('This port is already used by another app.');
}catch(error){if(error.message==='This port is already used by another app.')throw error;}
await import('../server/main.mjs');
for(let attempt=0;attempt<60;attempt++){
 try{const response=await fetch(url+'/api/dashboard',{signal:AbortSignal.timeout(1000)});if(response.ok){open();break;}}catch{}
 await new Promise(resolve=>setTimeout(resolve,500));
}
