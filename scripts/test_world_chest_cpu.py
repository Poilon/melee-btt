"""Execute the shipped chest hooks: opening cannot consume a BTT target."""
import json,struct
from pathlib import Path
from unicorn import Uc,UC_ARCH_PPC,UC_MODE_PPC32,UC_MODE_BIG_ENDIAN,UC_HOOK_CODE
from unicorn.ppc_const import *
cpu=Uc(UC_ARCH_PPC,UC_MODE_PPC32|UC_MODE_BIG_ENDIAN);cpu.mem_map(0x80000000,0x1800000)
symbols=json.loads(Path('scripts/native/world-chest-symbols.json').read_text());cpu.mem_write(0x802243f8,Path('scripts/native/world-chest.bin').read_bytes())
W=lambda a,v:cpu.mem_write(a,struct.pack('>I',v));R=lambda a:struct.unpack('>I',cpu.mem_read(a,4))[0]
F=lambda a,v:cpu.mem_write(a,struct.pack('>f',v));RF=lambda a:struct.unpack('>f',cpu.mem_read(a,4))[0]
stop=0x81000000;table=0x81500000;cfg=table+0x100;gobj=table+0x200;item=table+0x400;stage=table+0x1500;wrapper=table+0x1600;root=table+0x1700;nodes=[table+0x2000+128*i for i in range(14)];visual=table+0x3000;body=visual+128;lid=body+128;display=lid+128
W(0x8049e750,0x2a);W(0x8049ed88,table);W(table,cfg);W(gobj+0x2c,item);W(item+0xdd4,nodes[5]);W(item+0xdd8,display)
W(0x8049e850,stage);W(stage+0x28,wrapper);W(wrapper+0x10,root);W(root+0x10,nodes[0])
for a,b in zip(nodes,nodes[1:]):W(a+8,b)
W(nodes[13]+0x10,visual);W(visual+0x10,body);W(body+8,lid)
cpu.mem_write(cfg,struct.pack('>4I6f2I',0x43485354,5,13,0,0.,268.,34/24,-1.48/24,-1.48,302.,24,32));F(nodes[5]+0x3c,268)
events=[]
def hook(cpu,address,size,unused):
 if address not in (0x80220b84,0x80371d9c,0x80371f9c,0x803732e8,0x801c4338):return
 a=cpu.reg_read(UC_PPC_REG_3);events.append((address,a))
 if address==0x80371d9c:W(a+0x14,R(a+0x14)|16)
 if address==0x80371f9c:W(a+0x14,R(a+0x14)&~16)
 for i in range(3,13):cpu.reg_write(UC_PPC_REG_0+i,0xdead0000+i)
 cpu.reg_write(UC_PPC_REG_PC,cpu.reg_read(UC_PPC_REG_LR))
cpu.hook_add(UC_HOOK_CODE,hook)
def run(name):
 for i in range(13,32):cpu.reg_write(UC_PPC_REG_0+i,0x12340000+i)
 cpu.reg_write(UC_PPC_REG_1,0x81700000);cpu.reg_write(UC_PPC_REG_MSR,0x2000);cpu.reg_write(UC_PPC_REG_LR,stop);cpu.reg_write(UC_PPC_REG_3,gobj)
 cpu.emu_start(symbols[name],stop,count=1200)
 assert cpu.reg_read(UC_PPC_REG_PC)==stop
 assert cpu.reg_read(UC_PPC_REG_1)==0x81700000 and cpu.reg_read(UC_PPC_REG_LR)==stop
 for i in range(13,32):assert cpu.reg_read(UC_PPC_REG_0+i)==0x12340000+i
 return cpu.reg_read(UC_PPC_REG_3)
assert run('world_chest_anim')==0 and R(display+0x14)&16
assert run('world_chest_hit')==0 and R(cfg+12)==1
assert not any(a==0x801c4338 for a,_ in events)
for frame in range(1,33):
 assert run('world_chest_anim')==0
 if frame<31:assert run('world_chest_hit')==0
assert R(cfg+12)==32 and not R(display+0x14)&16
assert abs(RF(nodes[5]+0x3c)-302)<.001
assert abs(RF(lid+0x1c)+1.48)<.001
assert run('world_chest_hit')==1
assert sum(a==0x801c4338 for a,_ in events)==1
# Retry retains the archive/config address, but creates fresh model joints.
# Reuse the exact descriptor after a complete opening and after an interruption.
for stale_state in (32,1,12,24):
 W(cfg+12,stale_state);F(cfg+16,-1.48)
 run('world_chest_init')
 assert R(cfg+12)==0 and RF(cfg+16)==0
 F(nodes[5]+0x3c,268);F(lid+0x1c,0)
 count=sum(a==0x801c4338 for a,_ in events)
 assert run('world_chest_anim')==0 and R(display+0x14)&16
 assert run('world_chest_hit')==0 and R(cfg+12)==1
 assert sum(a==0x801c4338 for a,_ in events)==count
 for _ in range(32):run('world_chest_anim')
 assert abs(RF(nodes[5]+0x3c)-302)<.001
 assert abs(RF(lid+0x1c)+1.48)<.001
 assert run('world_chest_hit')==1
for index in (0,1,4,6,9):
 W(item+0xdd4,nodes[index]);assert run('world_chest_hit')==1
W(item+0xdd4,nodes[5])
for stage_id in (0x0e,0x2d,0x2e,0x32):
 W(0x8049e750,stage_id);assert run('world_chest_hit')==1
print('PPC chest: first hit preserves count; opening hits ignored; native reveal/hinge motion; second hit breaks; unrelated targets/stages and ABI preserved')
