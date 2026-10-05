"""Build the small host for original Melee common items."""
import os, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    prefix=ROOT/'build/ppc-tools/usr/bin/powerpc-linux-gnu-'
    env=dict(os.environ,LD_LIBRARY_PATH=str(ROOT/'build/ppc-tools/usr/lib/x86_64-linux-gnu'))
    out=ROOT/'build/warp-star';out.mkdir(parents=True,exist_ok=True)
    def tool(name,*args):subprocess.run([str(prefix)+name,*map(str,args)],env=env,check=True)
    ld=out/'items.ld';ld.write_text('ENTRY(world_items_init)\nSECTIONS { . = 0x80221648; .text : { *(.text.entry) *(.text*) *(.rodata*) *(.sdata*) } /DISCARD/ : { *(.comment) *(.eh_frame*) *(.note*) } }')
    tool('gcc-12','-B'+str(prefix.parent)+'/', '-mcpu=750','-m32','-mbig-endian','-msdata=none','-Os','-ffreestanding','-fno-builtin','-fno-pic','-fno-asynchronous-unwind-tables','-fno-stack-protector','-c',ROOT/'scripts/native/world-items.c','-o',out/'world-items.o')
    tool('ld.bfd','-T',ld,out/'world-items.o',ROOT/'build/ppc-tools/usr/lib/gcc-cross/powerpc-linux-gnu/12/libgcc.a','-o',out/'items.elf')
    dest=ROOT/'scripts/native/world-items.bin';tool('objcopy','-O','binary',out/'items.elf',dest)
    if dest.stat().st_size>0x2e4:raise ValueError('Item host exceeds retired Bowser module')
    print('Built item host:',dest.stat().st_size,'bytes')
if __name__=='__main__':main()
