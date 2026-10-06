"""Execute the hosting adapter; retail flight and shot code are never replaced."""
import json,struct
from pathlib import Path
from unicorn import Uc,UC_ARCH_PPC,UC_MODE_PPC32,UC_MODE_BIG_ENDIAN,UC_HOOK_CODE
from unicorn.ppc_const import *
cpu=Uc(UC_ARCH_PPC,UC_MODE_PPC32|UC_MODE_BIG_ENDIAN);cpu.mem_map(0x80000000,0x1800000)
code=Path('scripts/native/world-arwing.bin').read_bytes();assert len(code)<=0x3d0
cpu.mem_write(0x80221930,code);symbols=json.loads(Path('scripts/native/world-arwing-symbols.json').read_text())
cpu.mem_write(0x80221368,Path('scripts/native/world-wind.bin').read_bytes())
stop=0x81000000;table=0x81500000;config=table+0x100;native=table+0x200;gobj=table+0x400;gp=table+0x600
W=lambda a,v:cpu.mem_write(a,struct.pack('>I',v))
R=lambda a:struct.unpack('>I',cpu.mem_read(a,4))[0]
W(0x8049ed88,table);W(table,config);W(config,0x434e4152);W(config+4,native);W(gobj+0x2c,gp)
cpu.mem_write(gp,bytes([0xa5])*0x200)
events=[]
def hook(cpu,address,size,unused):
    arg=lambda n:cpu.reg_read(UC_PPC_REG_0+n)
    if address in (0x8021fc64,0x801dce1c):
        events.append(('boost' if address==0x8021fc64 else 'native_schedule',));cpu.reg_write(UC_PPC_REG_PC,stop);return
    if address==0x80220b84:events.append(('target_init',));result=0
    elif address==0x801dccfc:
        assert R(0x804d69a0)==native and R(0x804d69ac)==0
        events.append(('native_reset',));result=0
    elif address==0x801c14d0:events.append(('load',arg(3)));result=gobj
    elif address==0x80057bc0:events.append(('disable',arg(3)));result=0
    else:return
    for i in range(4,13):cpu.reg_write(UC_PPC_REG_0+i,0xdead0000+i)
    cpu.reg_write(UC_PPC_REG_3,result);cpu.reg_write(UC_PPC_REG_PC,cpu.reg_read(UC_PPC_REG_LR))
cpu.hook_add(UC_HOOK_CODE,hook)
def run(symbol,r3=0):
    for i in range(13,32):cpu.reg_write(UC_PPC_REG_0+i,0x12340000+i)
    cpu.reg_write(UC_PPC_REG_MSR,0x2000);cpu.reg_write(UC_PPC_REG_LR,stop);cpu.reg_write(UC_PPC_REG_1,0x81700000);cpu.reg_write(UC_PPC_REG_3,r3)
    cpu.emu_start(symbols[symbol],stop,count=600)
    assert cpu.reg_read(UC_PPC_REG_PC)==stop and cpu.reg_read(UC_PPC_REG_LR)==stop
    assert cpu.reg_read(UC_PPC_REG_1)==0x81700000
    for i in range(13,32):assert cpu.reg_read(UC_PPC_REG_0+i)==0x12340000+i
run('world_arwing_init')
assert R(config+12)==0xffffffff
assert events==[('target_init',),('native_reset',),('load',3),('load',8)]+[('disable',i) for i in range(8)]
assert R(gp+0xc0)==0xa5a5a5a5 and R(gp+0x134)==0xa5a5a5a5
assert bytes(cpu.mem_read(gp+0xc4,28*4))==bytes(28*4)
run('world_arwing_tick');assert events[-1]==('native_schedule',)
for p,value in ((config,0),(table,0),(0x8049ed88,0)):
    W(p,value);run('world_arwing_tick');assert events[-1]==('boost',)
W(0x8049ed88,table);W(table,config);W(config,0x434e4152)
for stage in (0x0e,0x16,0x2c,0x2d,0x2e,0x2f):
    W(0x8049e750,stage)
    for group in range(19):
        run('world_arwing_load',group)
        assert events[-1]==('load',group+19 if stage in (0x2d,0x2e) and group<3 else group)
print('PPC host: native init/scheduler delegation, isolated origin, 8 collision islands, 114 ID mappings, stock-stage guard, boost fallback and ABI passed')
# The native Wolfen is group 4, and only Falco's hosted factory selects it.
W(0x803e1d80,1);W(0x8049e750,0x2d);run('world_arwing_load',1);assert R(0x803e1d80)==4
W(config+12,0xffffffff);W(0x8049e750,0x2e)
for i in range(12):
 W(0x803e1d80,4);W(0x803e1d74,13);run('world_arwing_load',1)
 assert R(0x803e1d80)==1 and R(0x803e1d74)==4 and R(config+12)==i%4
# Native damage callback hook: real hit victim only, never shield/miss/stock.
fighter=table+0x900;fp=table+0xb00;laser=table+0x1000;ip=table+0x1200
W(fighter+0x2c,fp);W(laser+0x2c,ip);W(0x80453130,fighter)
hits=[]
def damage_hook(cpu,address,size,unused):
 if address==0x8006cc7c:
  assert cpu.reg_read(UC_PPC_REG_3)==fp
  assert struct.unpack('>d',struct.pack('>Q',cpu.reg_read(UC_PPC_REG_FPR1)))[0]==15.0
  hits.append(cpu.reg_read(UC_PPC_REG_3));cpu.reg_write(UC_PPC_REG_PC,cpu.reg_read(UC_PPC_REG_LR))
 elif address==0x802e8390:
  assert cpu.reg_read(UC_PPC_REG_3)==laser
  cpu.reg_write(UC_PPC_REG_PC,stop)
cpu.hook_add(UC_HOOK_CODE,damage_hook)
for stage,magic,enabled,victim,state,kill in [(0x2d,0x434e4152,1,fighter,14,True),(0xe,0x434e4152,1,fighter,14,False),(0x2e,0x434e4152,1,fighter,14,False),(0x2d,0,1,fighter,14,False),(0x2d,0x434e4152,0,fighter,14,False),(0x2d,0x434e4152,1,0,14,False),(0x2d,0x434e4152,1,fighter,0,False),(0x2d,0x434e4152,1,laser,14,False)]:
 W(0x8049e750,stage);W(0x8049ed88,table);W(table,config);W(config,magic);W(config+8,enabled);W(ip+0xcf4,victim);W(ip+0xc34,12);W(fp+0x10,state)
 before=len(hits);run('world_arwing_laser_hit',laser);assert len(hits)-before==int(kill)
print('Wolfen selection, 15-damage real-hit callback and stock/shield/dead-fighter guards passed')
W(0x8049e750,0x2d);W(ip+0xcf4,fighter);W(ip+0xc34,0);W(config,0x434e4152);W(config+8,1);before=len(hits);run("world_arwing_laser_hit",laser);assert len(hits)==before
assert "world_arwing_wolfen_tick" not in symbols

# Execute the mid-function hooks with the real native register/stack contract.
import math
root=table+0x1600;stack=0x81700000;sda=0x80400000
F=lambda a,v:cpu.mem_write(a,struct.pack('>f',v))
RF=lambda a:struct.unpack('>f',cpu.mem_read(a,4))[0]
cpu.reg_write(UC_PPC_REG_2,sda)
F(sda-18492,-math.pi/2);F(sda-18440,-1);F(sda-18544,0)
for stage in (0xe,0x2d,0x2e):
 for phase in range(4):
  for old,new in ((-40,-35),(40,35),(8,8)):
   W(0x8049e750,stage);W(config+12,phase);F(root+0x38,old);F(root+0x20,-math.pi/2);F(stack+0x7c,new);F(stack+0x80,180)
   cpu.reg_write(UC_PPC_REG_1,stack);cpu.reg_write(UC_PPC_REG_28,root);cpu.reg_write(UC_PPC_REG_LR,stop)
   cpu.emu_start(symbols['world_arwing_heading'],0x801df1a4,count=80)
   x=-new if stage==0x2e and phase%2 else new
   right=stage in (0x2d,0x2e) and x>old
   assert math.isclose(RF(root+0x20),(1 if right else -1)*math.pi/2,rel_tol=1e-6)
   assert RF(root+0x38)==old and RF(stack+0x7c)==x
   assert RF(stack+0x80)==(180-[-60,100,-60,100][phase] if stage==0x2e else 180)
   W(gobj+0x28,root);cpu.reg_write(UC_PPC_REG_29,gobj)
   for symbol,resume in [('world_arwing_shot_heading',0x801df500),('world_arwing_fox_shot_heading',0x801df52c)]:
    cpu.emu_start(symbols[symbol],resume,count=50)
    facing=struct.unpack('>d',struct.pack('>Q',cpu.reg_read(UC_PPC_REG_FPR1)))[0]
    assert facing==(1 if right else -1)
    assert cpu.reg_read(UC_PPC_REG_LR)==stop
print('Both muzzle directions, Fox alternating high/low native passes, Falco heading and stock guards passed')
path_calls=[]
def path_hook(cpu,address,size,unused):
 if address not in (0x801c8138,0x801c7a04):return
 path_calls.append(address)
 if address==0x801c7a04:
  assert cpu.reg_read(UC_PPC_REG_3)==gobj and cpu.reg_read(UC_PPC_REG_4)==0 and cpu.reg_read(UC_PPC_REG_5)==7
  rate=struct.unpack('>d',struct.pack('>Q',cpu.reg_read(UC_PPC_REG_FPR1)))[0]
  assert math.isclose(rate,1.6,rel_tol=1e-6)
 for i in range(4,13):cpu.reg_write(UC_PPC_REG_0+i,0xdead0000+i)
 cpu.reg_write(UC_PPC_REG_PC,cpu.reg_read(UC_PPC_REG_LR))
cpu.hook_add(UC_HOOK_CODE,path_hook)
for stage in (0xe,0x2d,0x2e):
 W(0x8049e750,stage);path_calls.clear();run('world_arwing_start_path',gobj)
 assert path_calls==([0x801c8138,0x801c7a04] if stage==0x2e else [0x801c8138])
print('Fox native playback at 1.6x; Falco/stock speed preserved, reset and ABI checks passed')

# Run the original Melee RNG machine code, not a mocked return value. Falco
# must repeat across arbitrary global seeds/interleaved fighter RNG calls;
# Fox and stock Corneria must retain their normal shared RNG behavior.
from build_character_worlds import dol_sections
with Path('Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso').open('rb') as f:retail=f.read(0x500000)
_,sections=dol_sections(retail)
for address,offset,size in sections:
 cpu.mem_write(address,retail[offset:offset+size])
cpu.mem_write(0x80221930,code)
seed_address=table+0x2000
def random_call(symbol,limit=13):
 cpu.reg_write(UC_PPC_REG_MSR,0x2000)
 cpu.reg_write(UC_PPC_REG_2,0x804df9e0)
 cpu.reg_write(UC_PPC_REG_13,0x804db6a0)
 cpu.reg_write(UC_PPC_REG_1,stack)
 cpu.reg_write(UC_PPC_REG_LR,stop)
 cpu.reg_write(UC_PPC_REG_3,limit)
 cpu.emu_start(symbols[symbol] if isinstance(symbol,str) else symbol,stop,count=200)
 assert cpu.reg_read(UC_PPC_REG_PC)==stop
 assert cpu.reg_read(UC_PPC_REG_1)==stack and cpu.reg_read(UC_PPC_REG_LR)==stop
 assert R(0x804d5f94)==seed_address
 return (cpu.reg_read(UC_PPC_REG_3) if symbol!='world_arwing_randf' else cpu.reg_read(UC_PPC_REG_FPR1))
W(0x804d5f94,seed_address);W(0x8049ed88,table);W(table,config);W(config,0x434e4152)
sequences=[]
for attempt in range(3):
 W(0x8049e750,0x2d);run('world_arwing_init')
 assert R(config+12)==0xffffffff
 sequence=[]
 for frame in range(600):
  W(seed_address,(frame*7919+attempt*0x1234567)&0xffffffff)
  for _ in range(attempt):random_call(0x80380580)
  before=R(seed_address)
  sequence.append(random_call('world_arwing_randi',9))
  sequence.append(random_call('world_arwing_randf'))
  assert R(seed_address)==before
 sequences.append(sequence)
assert sequences[0]==sequences[1]==sequences[2]
for stage in (0xe,0x16,0x2e):
 W(0x8049e750,stage);W(config+12,99)
 for symbol,original in [('world_arwing_randi',0x80380580),('world_arwing_randf',0x80380528)]:
  W(seed_address,0x12345678)
  result=random_call(symbol);after=R(seed_address)
  W(seed_address,0x12345678)
  if symbol.endswith('randf'):
   random_call(original);expected=cpu.reg_read(UC_PPC_REG_FPR1)
  else:expected=random_call(original)
  assert result==expected and after==R(seed_address) and R(config+12)==99
print('Falco: 3 identical 600-frame random sequences across different global seeds/fighter RNG; reset, engine RNG preservation and stock/Fox parity passed')
