import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {defaultPlaySettings} from '../shared/play-settings.mjs';
import {PlaySettings} from '../server/play-settings.mjs';
import {createApp} from '../server/app.mjs';

test('play settings persist, reject malformed values and require a same-origin action',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ttrc-settings-')),path=join(dir,'settings.json');
 const settings=new PlaySettings(path);await settings.initialize();
 const server=createApp({getPlaySettings:()=>settings.get(),savePlaySettings:value=>settings.save(value)});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 const post=(value,headers={Origin:origin,'X-TTRC-Action':'settings'})=>fetch(origin+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
 try{
  assert.deepEqual(settings.get(),defaultPlaySettings());
  assert.equal((await post({music:false,rumble:false},{})).status,403);
  assert.equal((await post({music:false,rumble:false},{Origin:'https://other.example','X-TTRC-Action':'settings'})).status,403);
  for(const value of [{music:0,rumble:false},{music:false},null,{music:true,rumble:true,path:'/tmp/file'}])assert.equal((await post(value)).status,400);
  const response=await post({music:false,rumble:false});assert.equal(response.status,200);assert.deepEqual((await response.json()).settings,{...defaultPlaySettings(),music:false,rumble:false});
  const restarted=new PlaySettings(path);await restarted.initialize();assert.deepEqual(restarted.get(),{...defaultPlaySettings(),music:false,rumble:false});
  await Promise.all([settings.save({music:true,rumble:false}),settings.save({music:false,rumble:true})]);
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{...defaultPlaySettings(),music:false,rumble:true});
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('Dolphin settings preserve audio, inputs, recording and restore motor strengths after repeated launches',()=>{
 execFileSync('python3',['-c',String.raw`
import sys,tempfile,json
from pathlib import Path
sys.path.insert(0,'scripts')
from play_settings import apply_preferences,read_ini,load_preferences,default_preferences
with tempfile.TemporaryDirectory() as directory:
 p=Path(directory);(p/'Config').mkdir();(p/'.ttrc-profile').write_text('test')
 (p/'Config/Dolphin.ini').write_text('[Core]\nSlippiSaveReplays = True\nSIDevice0 = 12\nSlippiJukeboxVolume = 67\n[DSP]\nVolume = 35\nBackend = XAudio2\n')
 (p/'Config/GCPadNew.ini').write_text('[GCPad1]\nRumble/Motor = Motor L\nRumble/Motor/Range = 42\nButtons/A = Button 0\n[GCPad2]\nRumble/Motor = Motor R\n')
 apply_preferences(p,{'music':False,'rumble':False});apply_preferences(p,{'music':False,'rumble':False})
 d=read_ini(p/'Config/Dolphin.ini');pads=read_ini(p/'Config/GCPadNew.ini')
 assert all(d['Core'][f'AdapterRumble{i}']=='False' for i in range(4))
 assert d['Core']['SlippiJukeboxEnabled']=='False' and d['Core']['SlippiJukeboxVolume']=='67'
 assert d['DSP']['Volume']=='35' and d['Core']['SlippiSaveReplays']=='True' and d['Core']['SIDevice0']=='12'
 assert pads['GCPad1']['Rumble/Motor/Range']=='0' and pads['GCPad2']['Rumble/Motor/Range']=='0'
 apply_preferences(p,{'music':True,'rumble':True})
 d=read_ini(p/'Config/Dolphin.ini');pads=read_ini(p/'Config/GCPadNew.ini')
 assert all(d['Core'][f'AdapterRumble{i}']=='True' for i in range(4))
 assert d['Core']['SlippiJukeboxEnabled']=='True' and d['DSP']['Volume']=='35'
 assert pads['GCPad1']['Rumble/Motor/Range']=='42' and 'Rumble/Motor/Range' not in pads['GCPad2']
 assert pads['GCPad1']['Rumble/Motor']=='Motor L' and pads['GCPad1']['Buttons/A']=='Button 0'
 assert not (p/'Challenge/rumble-ranges.json').exists()
 prefs=p/'preferences.json';assert load_preferences(prefs)==default_preferences()
 prefs.write_text(json.dumps({'music':False,'rumble':True}));assert load_preferences(prefs)['music'] is False
 prefs.write_text(json.dumps({'music':0,'rumble':True}))
 try:load_preferences(prefs);raise AssertionError('invalid preferences accepted')
 except ValueError:pass
`],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
});

test('capture accepts the music preference but rejects altered challenge or unknown patches',async()=>{
 const {verifyProfileCode}=await import('../server/profile-code.mjs');
 const {createHash}=await import('node:crypto');
 const code='04000000 00000000\n',hash=createHash('sha256').update(code).digest('hex');
 const ini=`[Gecko]\n$Target Test Randomizer Challenge\n${code}$TTRC: Music off\n04023FFC 38800000\n[Gecko_Enabled]\n$Target Test Randomizer Challenge\n$TTRC: Music off\n`;
 assert.equal(verifyProfileCode(ini,hash),true);
 assert.equal(verifyProfileCode(ini.replace('38800000','38800001'),hash),false);
 assert.equal(verifyProfileCode(ini.replace('04000000','04000001'),hash),false);
 assert.equal(verifyProfileCode(ini.replace('$TTRC: Music off','$Unknown patch'),hash),false);
});
