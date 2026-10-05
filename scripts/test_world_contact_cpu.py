"""Execute the shipped contact callback on a PowerPC CPU (Unicorn, developer only)."""
import sys,struct
from pathlib import Path
from unicorn import Uc,UC_ARCH_PPC,UC_MODE_PPC32,UC_MODE_BIG_ENDIAN
from unicorn.ppc_const import UC_PPC_REG_0,UC_PPC_REG_1,UC_PPC_REG_3,UC_PPC_REG_LR
from world_mechanics import patch_hazard_callback
address=0x80220e5c;memory=bytearray(struct.pack('>I',0x7c0802a6)+bytes(168))
patch_hazard_callback(memory,lambda _:0)
cpu=Uc(UC_ARCH_PPC,UC_MODE_PPC32|UC_MODE_BIG_ENDIAN);cpu.mem_map(0x80000000,0x1800000)
cpu.mem_write(address,bytes(memory));stack=0x81700000;stop=0x81000000;table=0x81500000;descriptor=0x81501000
cpu.mem_write(0x8049ed88,struct.pack('>I',table))
cpu.mem_write(table+8,struct.pack('>I',descriptor))
count=0
for stage in (0,0xe,0x2d,0x2e):
 cpu.mem_write(0x8049e750,struct.pack('>I',stage))
 for line in (-1,0,12):
  for group in (-1,0,1,2,8,9,10,11,18,19):
   for direction,index in [(1,0),(2,1),(4,2),(8,3)]:
    # Only the two pre-existing engine helpers are stubbed. Run the actual
    # emitted callback, including its two BL instructions and stack handling.
    cpu.mem_write(0x80056b6c,struct.pack('>2I',0x38600000|(group&65535),0x4e800020))
    cpu.mem_write(0x80054c6c,struct.pack('>2I',0x38600000|direction,0x4e800020))
    cpu.ctl_remove_cache(0x80054000,0x80057000)
    for r in range(13,32):cpu.reg_write(UC_PPC_REG_0+r,0x12340000+r)
    cpu.reg_write(UC_PPC_REG_1,stack);cpu.reg_write(UC_PPC_REG_LR,stop);cpu.reg_write(UC_PPC_REG_3,line&0xffffffff)
    cpu.emu_start(address,stop,count=100)
    expected=descriptor+36*index if line!=-1 and (group-8 if stage in (0x2d,0x2e) else group)==2 else 0
    assert cpu.reg_read(UC_PPC_REG_3)==expected,(line,group,direction,hex(cpu.reg_read(UC_PPC_REG_3)))
    assert cpu.reg_read(UC_PPC_REG_1)==stack
    assert cpu.reg_read(UC_PPC_REG_LR)==stop
    for r in range(13,32):assert cpu.reg_read(UC_PPC_REG_0+r)==0x12340000+r
    count+=1
print(f'{count} PowerPC contact callback cases passed')
