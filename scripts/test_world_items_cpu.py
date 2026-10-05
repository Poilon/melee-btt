"""Execute the shipped PPC host: retail factory arguments, ABI and retries."""
import struct
from pathlib import Path
from unicorn import Uc,UC_ARCH_PPC,UC_MODE_PPC32,UC_MODE_BIG_ENDIAN,UC_HOOK_CODE
from unicorn.ppc_const import *
c=Uc(UC_ARCH_PPC,UC_MODE_PPC32|UC_MODE_BIG_ENDIAN);c.mem_map(0x80000000,0x1800000)
c.mem_write(0x80221648,Path('scripts/native/world-items.bin').read_bytes())
W=lambda a,v:c.mem_write(a,struct.pack('>I',v))
R=lambda a:struct.unpack('>I',c.mem_read(a,4))[0]
stop=0x81000000;table=0x81500000;cfg=table+0x100;rows=table+0x200
events=[]
def hook(c,a,size,unused):
    if a==0x801c42ac:events.append('native-init')
    elif a==0x80268b18:
        p=c.reg_read(UC_PPC_REG_3);raw=bytes(c.mem_read(p,0x4c));events.append(raw)
        assert R(p+8)==29 and R(p+0x44)==0x80000000
        assert raw[0x14:0x20]==raw[0x20:0x2c]
        assert raw[:8]==bytes(8) and raw[0x2c:0x38]==bytes(12)
        assert struct.unpack_from('>f',raw,0x38)[0]==1
    else:return
    for i in range(3,13):c.reg_write(UC_PPC_REG_0+i,0xdead0000+i)
    c.reg_write(UC_PPC_REG_PC,c.reg_read(UC_PPC_REG_LR))
c.hook_add(UC_HOOK_CODE,hook)
def run():
    for i in range(13,32):c.reg_write(UC_PPC_REG_0+i,0x12340000+i)
    c.reg_write(UC_PPC_REG_1,0x81700000);c.reg_write(UC_PPC_REG_MSR,0x2000);c.reg_write(UC_PPC_REG_LR,stop)
    c.emu_start(0x80221648,stop,count=4000)
    assert c.reg_read(UC_PPC_REG_PC)==stop and c.reg_read(UC_PPC_REG_1)==0x81700000
    for i in range(13,32):assert c.reg_read(UC_PPC_REG_0+i)==0x12340000+i
    result=events[:];events.clear();return result
W(0x8049ed88,0);assert run()==['native-init']
W(0x8049ed88,table)
for pointer in (0,0xffffffff,0x3f800000,0x81500001,cfg):
    W(table+44,pointer);assert run()==['native-init']
W(cfg,0x57535431);W(cfg+4,17);assert run()==['native-init']
W(cfg+4,2);W(cfg+8,rows)
positions=[struct.pack('>3f',-168.3,44,0),struct.pack('>3f',125,210,0)]
c.mem_write(rows,b''.join(positions))
for retry in range(3):
    result=run();assert result[0]=='native-init' and len(result)==3
    assert [r[0x14:0x20] for r in result[1:]]==positions
print('Warp Star PPC: original init, legacy archive no-op, exact retail factory ABI, two positions, three restarts passed')
