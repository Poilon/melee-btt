"""PPC ABI and full native spawn delegation, including a fresh restart."""
import struct
from pathlib import Path
from unicorn import Uc,UC_ARCH_PPC,UC_MODE_PPC32,UC_MODE_BIG_ENDIAN,UC_HOOK_CODE
from unicorn.ppc_const import *
c=Uc(UC_ARCH_PPC,UC_MODE_PPC32|UC_MODE_BIG_ENDIAN);c.mem_map(0x80000000,0x1800000)
c.mem_write(0x802228b4,Path('scripts/native/world-retail.bin').read_bytes())
W=lambda a,v:c.mem_write(a,struct.pack('>I',v))
R=lambda a:struct.unpack('>I',c.mem_read(a,4))[0]
stop=0x81000000;table=0x81500000;config=table+0x100;rows=table+0x200;gobj=table+0x400;gp=table+0x500
W(0x8049ed88,table);W(table,config);W(config,0x4e415456);W(config+12,rows);W(gobj+0x2c,gp)
events=[];fail_factory=False
def hook(c,a,size,unused):
 arg=lambda n:c.reg_read(UC_PPC_REG_0+n)
 if a==0x80220b84:events.append(('targets',));ret=0
 elif a==0x801e37f4:
  assert arg(3)==3 and R(0x804d69c0)==0x81501000
  events.append(('cars',));ret=0 if fail_factory else gobj
 elif a==0x8027b5b0:
  assert (arg(5),arg(6),arg(7))==(0,0,1)
  events.append(('enemy',arg(3),bytes(c.mem_read(arg(4),12))));ret=gobj
 else:return
 for i in range(4,13):c.reg_write(UC_PPC_REG_0+i,0xdead0000+i)
 c.reg_write(UC_PPC_REG_3,ret);c.reg_write(UC_PPC_REG_PC,c.reg_read(UC_PPC_REG_LR))
c.hook_add(UC_HOOK_CODE,hook)
def run():
 for i in range(13,32):c.reg_write(UC_PPC_REG_0+i,0x12340000+i)
 c.reg_write(UC_PPC_REG_MSR,0x2000);c.reg_write(UC_PPC_REG_LR,stop);c.reg_write(UC_PPC_REG_1,0x81700000)
 c.emu_start(0x802228b4,stop,count=600)
 assert c.reg_read(UC_PPC_REG_PC)==stop and c.reg_read(UC_PPC_REG_1)==0x81700000
 for i in range(13,32):assert c.reg_read(UC_PPC_REG_0+i)==0x12340000+i
W(config+4,0x81501000);W(config+8,0);run()
assert events==[('targets',),('cars',)] and c.mem_read(gp+0x119,1)==bytes([7])
fail_factory=True;run();fail_factory=False
W(config+4,0);W(config+8,3)
expected=[]
for i,kind in enumerate((0x2e,0x2e,0xd9)):
 W(rows+16*i,kind);xyz=struct.pack('>3f',i*20.,100.+i*50.,0.);c.mem_write(rows+16*i+4,xyz);expected.append(('enemy',kind,xyz))
for retry in range(3):
 events.clear();run();assert events==[('targets',)]+expected
print('Retail PPC: target init, native Onett factory, one-way lane, null factory, exact enemy arguments, three fresh inits and ABI passed')
