import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PlaySettings} from '../server/play-settings.mjs';
import {defaultPlaySettings,validPlaySettings} from '../shared/play-settings.mjs';
import {peachCode,validPeachCode,approvedPreferenceCodes} from '../shared/gameplay-codes.mjs';
import {verifyProfileCode} from '../server/profile-code.mjs';
import {validateGecko} from '../src/challenge.mjs';

test('legacy settings migrate; edits preserve character options and reject arbitrary codes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ttrc-options-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'settings.json');await writeFile(path,JSON.stringify({music:false,rumble:true}));
 const store=new PlaySettings(path);await store.initialize();
 assert.deepEqual(store.get(),{...defaultPlaySettings(),music:false});
 const all={...store.get(),iceClimbers:true,luigiMisfire:true,peachItems:['beam-sword',...Array(9).fill('random')]};
 await store.save(all);await store.save({music:true,rumble:false});
 const again=new PlaySettings(path);await again.initialize();assert.deepEqual(again.get(),{...all,music:true,rumble:false});
 const copy=again.get();copy.peachItems[0]='random';assert.equal(again.get().peachItems[0],'beam-sword');
 for(const bad of [{...all,ucf:1},{...all,peachItems:Array(9).fill('random')},{...all,peachItems:['0411D0A4 38C0000C',...Array(9).fill('random')]},{...all,iceClimbers:'yes'},{...all,code:'custom'}])assert.equal(validPlaySettings(bad),false);
});

test('Peach generator matches the supplied generator and branches by targets remaining',()=>{
 const items=['beam-sword',...Array(9).fill('random')];
 assert.equal(peachCode(items),'C211D0A4 00000005\n3E608049 6273ED9D\n8A930000 2C14000A\n41820008 4800000C\n38C0000C 48000008\n7FE6FB78 00000000');
 const variants=[Array(10).fill('random'),items,Array(10).fill('bob-omb'),['random','turnip','beam-sword','bob-omb','mr-saturn','random','turnip','mr-saturn','beam-sword','bob-omb']];
 const python=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts');from play_settings import peach_code;print(json.dumps([peach_code(items) for items in json.loads(sys.stdin.read())]))"],{input:JSON.stringify(variants),encoding:'utf8'}));
 assert.deepEqual(python,variants.map(peachCode));
 for(const items of variants){
  const code=peachCode(items);if(!code)continue;validateGecko(code);assert.equal(validPeachCode(code),true);
  const words=code.split(/\s+/).map(w=>parseInt(w,16));
  // Execute only the generator's compare/branch/load instructions: no game or memory writes.
  for(let remaining=0;remaining<=10;remaining++){
   let pc=5,equal=false,item='random',steps=0;
   while(pc<words.length&&steps++<100){
    const word=words[pc]>>>0;
    if((word>>>16)===0x2C14){equal=(word&0xffff)===remaining;pc++;}
    else if((word>>>16)===0x4182)pc+=equal?(word&0xffff)/4:1;
    else if((word>>>16)===0x4800)pc+=(word&0xffff)/4;
    else if((word>>>16)===0x38C0){item={99:'turnip',12:'beam-sword',6:'bob-omb',7:'mr-saturn'}[word&0xffff];pc++;}
    else break;
   }
   assert.equal(item,remaining===0?'random':items[10-remaining]);
  }
  assert.equal(validPeachCode(code.replace('6273ED9D','6273ED9C')),false);
  assert.equal(validPeachCode(code.replace('00000000','00000001')),false);
 }
});

test('prepared profiles apply the exact approved optional codes with UCF in the required order',()=>{
 const prefs={...defaultPlaySettings(),music:false,iceClimbers:true,luigiMisfire:true,removeGo:true,fixedCamera:true,peachItems:Array(10).fill('mr-saturn')};
 const patches=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts');from play_settings import preference_codes;print(json.dumps(preference_codes(json.loads(sys.stdin.read()))))"],{input:JSON.stringify(prefs),encoding:'utf8'}));
 assert.deepEqual(patches.map(([name])=>name),['TTRC: Music off','TTRC: UCF','TTRC: Both Ice Climbers','TTRC: Always Luigi misfire','TTRC: Remove GO','TTRC: Fixed camera','TTRC: Peach items']);
 const ucf=patches.find(([name])=>name==='TTRC: UCF')[1];
 assert.ok(ucf.indexOf('C20C9A44 00000022')<ucf.indexOf('C20C9A44 0000002F'));validateGecko(ucf);
 const challenge='04000000 00000000\n',hash=createHash('sha256').update(challenge).digest('hex');
 const ini='[Gecko]\n$Target Test Randomizer Challenge\n'+challenge+patches.map(([name,code])=>'$'+name+'\n'+code+'\n').join('');
 assert.equal(verifyProfileCode(ini,hash),true);
 assert.equal(patches.find(([name])=>name==='TTRC: Fixed camera')[1],'04452C6C 00000004\n042F6508 4E800020');
 assert.match(patches.find(([name])=>name==='TTRC: Remove GO')[1],/^C22F6EA8 00000002\n7C6E1B78 2C030008/);
 assert.equal(verifyProfileCode(ini.replace('04452C6C 00000004','04452C6C 00000005'),hash),false);
 assert.equal(verifyProfileCode(ini.replace('7C6E1B78 2C030008','7C6E1B78 2C030007'),hash),false);
 assert.equal(patches.find(([name])=>name==='TTRC: Always Luigi misfire')[1],'04142AF8 38000001');
 assert.equal(verifyProfileCode(ini.replace('04142AF8 38000001','04142AF8 38000002'),hash),false);
 assert.equal(verifyProfileCode(ini.replace('04142AF8 38000001','00142AFB 00000001'),hash),true);
 assert.equal(verifyProfileCode(ini.replace('04142AF8 38000001','00142AFB 00000002'),hash),false);
 assert.equal(verifyProfileCode(ini.replace('0A0B0000','0A0C0000'),hash),false);
 for(const code of approvedPreferenceCodes.values())validateGecko(code);
 const off={...defaultPlaySettings(),ucf:false};
 assert.deepEqual(JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts');from play_settings import preference_codes;print(json.dumps(preference_codes(json.loads(sys.stdin.read()))))"],{input:JSON.stringify(off),encoding:'utf8'})),[]);
});

test('optional patches use code types supported by the Slippi bootloader',()=>{
 for(const code of [...approvedPreferenceCodes.values(),peachCode(Array(10).fill('turnip'))]){
  const lines=code.split('\n');
  for(let i=0;i<lines.length;i++){
   const [address,value]=lines[i].split(' '),type=address.slice(0,2);
   assert.ok(['04','06','C2'].includes(type),`unsupported Gecko type ${type}`);
   if(type==='C2')i+=parseInt(value,16);
   else if(type==='06')i+=Math.ceil(parseInt(value,16)/8);
   assert.ok(i<lines.length,'truncated Gecko payload');
  }
 }
});

test('six-field preferences migrate and older tabs preserve display options',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ttrc-display-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {removeGo,fixedCamera,...legacy}=defaultPlaySettings(),path=join(dir,'settings.json');
 await writeFile(path,JSON.stringify({...legacy,luigiMisfire:true}));
 const store=new PlaySettings(path);await store.initialize();assert.equal(store.get().luigiMisfire,true);assert.equal(store.get().removeGo,false);assert.equal(store.get().fixedCamera,false);
 await store.save({...store.get(),removeGo:true,fixedCamera:true});await store.save(legacy);
 assert.equal(store.get().removeGo,true);assert.equal(store.get().fixedCamera,true);
 const migrated=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts');from play_settings import normalize_preferences;print(json.dumps(normalize_preferences(json.loads(sys.stdin.read()))))"],{input:JSON.stringify(legacy),encoding:'utf8'}));
 assert.deepEqual(migrated,defaultPlaySettings());
 for(const invalid of [{...store.get(),removeGo:1},{...store.get(),fixedCamera:'true'},{...legacy,removeGo:true}])assert.equal(validPlaySettings(invalid),false);
});
