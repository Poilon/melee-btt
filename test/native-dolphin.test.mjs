import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Onboarding} from '../server/onboarding.mjs';

test('native Dolphin can prepare before choosing an ISO, preserves inputs and relocates recording paths',()=>{
 execFileSync('python3',['-c',String.raw`
import sys,tempfile,json,hashlib,shutil
from pathlib import Path
sys.path.insert(0,'scripts')
import prepare_dolphin as p
from play_settings import read_ini
with tempfile.TemporaryDirectory() as temp:
 root=Path(temp)/'Dolphin with spaces';root.mkdir()
 p.ROOT=root;p.windows_path=lambda x:str(x.resolve());p.load_preferences=lambda:{'music':True,'rumble':False}
 assets=root/'assets/dolphin';assets.mkdir(parents=True)
 shutil.copyfile('assets/dolphin/tex1_96x40_ce455ca08d511f27_0.png',assets/'tex1_96x40_ce455ca08d511f27_0.png')
 code=b'04000000 00000000\n';challenge=root/'build/challenge';challenge.mkdir(parents=True)
 (challenge/'challenge.json').write_text(json.dumps({'id':'a'*64,'geckoSha256':hashlib.sha256(code).hexdigest()}))
 (challenge/'code.txt').write_bytes(code)
 exe=root/'Slippi Dolphin.exe';exe.write_bytes(b'test')
 settings=root/'Sys/GameSettings';settings.mkdir(parents=True)
 (settings/'GALE01r2.ini').write_text('[Gecko_Enabled]\n$Required: General Codes\n$Required: Slippi Recording\n$Online\n[Gecko]\n')
 def prepare():
  sys.argv=['prepare','--challenge',str(challenge),'--dolphin',str(exe),'--controller-config',str(root/'User/Config'),'--record-replays','--portable','--configure-only']
  p.main()
 prepare()
 profile=root/'User';config=read_ini(profile/'Config/Dolphin.ini')
 assert config['Core']['EXIDevice1']=='10' and config['Core']['SlippiSaveReplays']=='True'
 assert config['Core']['SlippiReplayDir']==str(root/'Replays')
 assert config['Core']['AdapterRumble0']=='False'
 assert not (challenge/'runtime.json').exists() and not (root/'Games').exists()
 pads=profile/'Config/GCPadNew.ini';pads.write_text('[GCPad1]\nButtons/A = Button 7\n')
 prepare();assert read_ini(pads)['GCPad1']['Buttons/A']=='Button 7'
 relocated=Path(temp)/'Moved';shutil.move(root,relocated)
 root=relocated;p.ROOT=root;exe=root/'Slippi Dolphin.exe';challenge=root/'build/challenge'
 prepare();assert read_ini(root/'User/Config/Dolphin.ini')['Core']['SlippiReplayDir']==str(root/'Replays')
`],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
});

test('native companion skips legacy ISO import even before the first game selection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ttrc-native-'));
 try{
  const profile=join(root,'User');await mkdir(join(profile,'GameSettings'),{recursive:true});
  await writeFile(join(profile,'GameSettings/GALE01.ini'),'prepared');
  const dolphin=join(root,'Slippi Dolphin.exe');await writeFile(dolphin,'fixture');
  const setup=new Onboarding({root,challengeDir:join(root,'build/challenge')});
  await setup.initialize({profile,dolphin,native:true,iso:null});
  assert.equal(setup.get().ready,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
