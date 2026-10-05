import {verifyIso} from '../server/onboarding.mjs';
try{
 const path=process.env.CUSTOM_MELEE_ISO_PATH;
 if(!path)throw Error('Select your Melee ISO.');
 await verifyIso(path);console.log(JSON.stringify({valid:true}));
}catch(error){
 const message=error.code==='ENOENT'?'The selected ISO is no longer available. Choose it again.':error.code==='EACCES'?'This file cannot be read. Choose an accessible ISO.':error.message;
 console.log(JSON.stringify({valid:false,error:message}));process.exitCode=1;
}
