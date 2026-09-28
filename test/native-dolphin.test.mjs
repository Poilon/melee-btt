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
 assert config['Core']['SlotB']=='10' and config['Core']['SlotA']=='1'
 first_card=profile/'GC/TTRC'/('a'*64)/'MemoryCardA.USA.raw'
 assert config['Core']['MemcardAPath']==str(first_card)
 assert not first_card.exists() # Dolphin owns creation/formatting, not the helper.
 first_card.write_bytes(b'existing card contents')
 assert config['Core']['SlippiReplayDir']==str(root/'Replays')
 assert config['Core']['AdapterRumble0']=='False'
 assert not (challenge/'runtime.json').exists() and not (root/'Games').exists()
 pads=profile/'Config/GCPadNew.ini';pads.write_text('[GCPad1]\nButtons/A = Button 7\n')
 prepare();assert read_ini(pads)['GCPad1']['Buttons/A']=='Button 7'
 assert first_card.read_bytes()==b'existing card contents'
 assert read_ini(profile/'Config/Dolphin.ini')['Core']['MemcardAPath']==str(first_card)
 # A new challenge selects an empty card without erasing the previous one.
 (challenge/'challenge.json').write_text(json.dumps({'id':'b'*64,'geckoSha256':hashlib.sha256(code).hexdigest()}))
 prepare()
 second_card=profile/'GC/TTRC'/('b'*64)/'MemoryCardA.USA.raw'
 assert read_ini(profile/'Config/Dolphin.ini')['Core']['MemcardAPath']==str(second_card)
 assert not second_card.exists() and first_card.read_bytes()==b'existing card contents'
 second_card.write_bytes(b'new challenge scores')
 # Reject malformed challenges before changing the active card/configuration.
 before=(profile/'Config/Dolphin.ini').read_bytes()
 (challenge/'challenge.json').write_text(json.dumps({'id':'../invalid','geckoSha256':hashlib.sha256(code).hexdigest()}))
 try: prepare();raise AssertionError('Accepted invalid challenge')
 except SystemExit as e: assert e.code==2
 assert (profile/'Config/Dolphin.ini').read_bytes()==before
 (challenge/'challenge.json').write_text(json.dumps({'id':'b'*64,'geckoSha256':hashlib.sha256(code).hexdigest()}))
 relocated=Path(temp)/'Moved';shutil.move(root,relocated)
 root=relocated;p.ROOT=root;exe=root/'Slippi Dolphin.exe';challenge=root/'build/challenge'
 prepare();assert read_ini(root/'User/Config/Dolphin.ini')['Core']['SlippiReplayDir']==str(root/'Replays')
 moved_card=root/'User/GC/TTRC'/('b'*64)/'MemoryCardA.USA.raw'
 assert read_ini(root/'User/Config/Dolphin.ini')['Core']['MemcardAPath']==str(moved_card)
 assert moved_card.read_bytes()==b'new challenge scores'
 # Returning to an archived challenge restores its own records.
 (challenge/'challenge.json').write_text(json.dumps({'id':'a'*64,'geckoSha256':hashlib.sha256(code).hexdigest()}))
 prepare()
 restored=root/'User/GC/TTRC'/('a'*64)/'MemoryCardA.USA.raw'
 assert read_ini(root/'User/Config/Dolphin.ini')['Core']['MemcardAPath']==str(restored)
 assert restored.read_bytes()==b'existing card contents'
`],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
});

test('release restores native card flow without changing other Slippi codes',()=>{
 execFileSync('python3',['-c',String.raw`
import sys
sys.path.insert(0,'scripts')
from patch_memory_card import restore_card_flow, SKIP_CARD
prefix='[Gecko]\r\n$Required: General Codes\r\n0415EE98 38600001 # Unlock characters\r\n'
suffix='0415D94C 4E800020\r\n$Required: Slippi Recording\r\n04000000 12345678\r\n'
hook=SKIP_CARD.copy();hook[0]+=' #External/Skip Memcard Prompt/Skip Memcard Prompt.asm'
original=prefix+'\r\n'.join(hook)+'\r\n'+suffix
assert restore_card_flow(original)==prefix+suffix
for invalid in [prefix+suffix,original+original,original.replace('2C1D000F','2C1D0010')]:
 try:restore_card_flow(invalid);raise AssertionError('Accepted an unknown upstream layout')
 except ValueError:pass
import tempfile,subprocess
from pathlib import Path
with tempfile.TemporaryDirectory() as temp:
 path=Path(temp)/'GALE01r2.ini';path.write_bytes(original.encode());path.chmod(0o444)
 subprocess.run([sys.executable,'scripts/patch_memory_card.py',str(path)],check=True)
 assert path.read_bytes()==(prefix+suffix).encode()
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
