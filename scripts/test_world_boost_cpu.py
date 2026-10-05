"""Execute the shipped boost callback on a PowerPC CPU (Unicorn, developer only)."""
import sys,struct
sys.path.insert(0,'scripts')
from unicorn import Uc,UC_ARCH_PPC,UC_MODE_PPC32,UC_MODE_BIG_ENDIAN
from unicorn.ppc_const import *
from world_mechanics import patch_boost_callback
cpu=Uc(UC_ARCH_PPC,UC_MODE_PPC32|UC_MODE_BIG_ENDIAN);cpu.mem_map(0x80000000,0x1800000)
data=bytearray(0x400);struct.pack_into('>I',data,0,0x7c0802a6);struct.pack_into('>I',data,0x300,0x80220d48)
patch_boost_callback(data,lambda a:0 if a==0x8021fc64 else 0x300)
cpu.mem_write(0x8021fc64,bytes(data[:0x300]));stop=0x81000000;t=0x81500000;c=t+0x100;g=t+0x200;f=t+0x1000
W=lambda a,v:cpu.mem_write(a,struct.pack('>I',v))
F=lambda a,v:cpu.mem_write(a,struct.pack('>f',v))
R=lambda a:struct.unpack('>I',cpu.mem_read(a,4))[0]
RF=lambda a:struct.unpack('>f',cpu.mem_read(a,4))[0]
W(0x8049ed88,t);W(t,c);W(c,0x42535431);W(0x80453130,g);W(g+0x2c,f)
for o,v in [(4,-200),(8,-140),(12,-1),(16,20),(20,5.8)]:F(c+o,v)
def run():
 for r in range(13,32):cpu.reg_write(UC_PPC_REG_0+r,0x12340000+r)
 cpu.reg_write(UC_PPC_REG_MSR,0x2000);cpu.reg_write(UC_PPC_REG_LR,stop);cpu.reg_write(UC_PPC_REG_1,0x81700000)
 cpu.emu_start(0x8021fc64,stop,count=100)
 assert cpu.reg_read(UC_PPC_REG_LR)==stop
 for r in range(13,32):assert cpu.reg_read(UC_PPC_REG_0+r)==0x12340000+r
for x,y,state,air,expected in [(-220,0,20,0,False),(-180,0,20,0,True),(-180,0,20,1,False),(-180,0,90,0,False),(-180,22,20,0,False),(-180,-3,20,0,False),(-130,0,20,0,False)]:
 F(f+0xb0,x);F(f+0xb4,y);W(f+0x10,state);W(f+0xe0,air);W(c+24,0);F(f+0x8c,0);F(f+0xf0,0);run();assert (RF(f+0x8c)>5)==expected
 if expected:
  assert abs(RF(f+0xf0)-5.8)<1e-5
  before=R(c+28);F(f+0x8c,1);run();assert RF(f+0x8c)==1 and R(c+28)==before
W(t,0);run();W(t,c);W(c,0);run();W(0x8049ed88,0);run()
# The upper zone fires left independently of the lower rightward zone.
c2=c+64;W(0x8049ed88,t);W(t,c);W(c,0x42535431);W(c+32,c2);W(c2,0x42535431)
for o,v in [(4,140),(8,200),(12,80),(16,100),(20,-5.8)]:F(c2+o,v)
W(c2+32,0);W(c2+24,0);W(f+0x10,20);W(f+0xe0,0);F(f+0xb0,180);F(f+0xb4,85)
run();assert abs(RF(f+0x8c)+5.8)<1e-5 and abs(RF(f+0xf0)+5.8)<1e-5
assert R(c+24)==0 and R(c2+24)==1
before=R(c2+28);F(f+0x8c,-1);run();assert RF(f+0x8c)==-1 and R(c2+28)==before
F(f+0xb0,-180);F(f+0xb4,0);run();assert RF(f+0x8c)>5 and R(c2+24)==0
F(f+0xb0,180);F(f+0xb4,85);run();assert RF(f+0x8c)<-5 and R(c2+28)==before+1
print('Two independently rearmed, opposite boost impulses passed')
print('PowerPC boost: bounds, ground/air, damage states, entry latch, vanilla stages, ABI passed')
