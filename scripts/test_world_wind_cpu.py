"""Execute Whispy's shipped gust, including its unchanged boost fallback."""
exec(compile(open('scripts/test_world_boost_cpu.py').read(),'boost-tests','exec'))
from pathlib import Path
cpu.mem_write(0x80221368,Path('scripts/native/world-wind.bin').read_bytes())
W(0x8049ed88,t);W(t,c);W(c,0x574e4431);W(0x80453130,g);W(g+0x2c,f)
for o,v in [(4,-115),(8,160),(12,18),(16,165),(20,.65),(24,0)]:F(c+o,v)
W(c+28,420);W(c+32,150);W(c+36,285)
def gust():
 for r in range(13,32):cpu.reg_write(UC_PPC_REG_0+r,0x12340000+r)
 cpu.reg_write(UC_PPC_REG_MSR,0x2000);cpu.reg_write(UC_PPC_REG_LR,stop);cpu.reg_write(UC_PPC_REG_1,0x81700000)
 cpu.emu_start(0x80221368,stop,count=200)
 assert cpu.reg_read(UC_PPC_REG_LR)==stop
 for r in range(13,32):assert cpu.reg_read(UC_PPC_REG_0+r)==0x12340000+r
for x,y,state,frame,active in [
 (0,60,14,149,False),(0,60,14,150,True),(0,60,14,284,True),(0,60,14,285,False),
 (0,60,25,570,True),(0,60,13,200,False),(0,60,75,200,False),
 (-116,60,14,200,False),(161,60,14,200,False),(0,17,14,200,False),(0,166,14,200,False)]:
 F(f+0xb0,x);F(f+0xb4,y);W(f+0x10,state);W(0x80479d60,frame);F(f+0x8c,.125);F(f+0x1830,7)
 before=bytes(cpu.mem_read(f,0x2000));gust();after=bytes(cpu.mem_read(f,0x2000))
 assert abs(RF(f+0x8c)-(.65 if active else .125))<1e-6
 assert before[:0x8c]==after[:0x8c] and before[0x90:]==after[0x90:],'Gust changed something besides external X velocity'
# No stage/player is a safe no-op, including non-WND1 stage -> legacy callback.
W(0x80453130,0);gust();W(0x80453130,g);W(t,0);gust();W(0x8049ed88,0);gust()
print('PowerPC wind: phases, cycle wrap, bounds, states, only horizontal velocity, ABI and fallback passed')
