"""Compile the relocatable Melee online menu (PowerPC GCC + binutils)."""
from pathlib import Path
import subprocess,os,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
NATIVE=ROOT/'scripts/native'
def main():
 prefix=ROOT/'build/ppc-tools/usr/bin/powerpc-linux-gnu-'
 env=dict(os.environ,LD_LIBRARY_PATH=str(ROOT/'build/ppc-tools/usr/lib/x86_64-linux-gnu'))
 out=ROOT/'build/online-menu/compiled';out.mkdir(parents=True,exist_ok=True)
 def tool(name,*args):return subprocess.run([str(prefix)+name,*map(str,args)],env=env,check=True,capture_output=True,text=True).stdout
 ld=out/'module.ld';ld.write_text('ENTRY(entry)\nSECTIONS { . = 0; .text : { *(.text.entry) *(.text*) } .rodata : { *(.rodata*) } .got2 : { *(.got2*) } .data : { *(.data*) } .bss : { *(.bss*) *(COMMON) } /DISCARD/ : { *(.eh_frame*) *(.comment*) *(.note*) } }')
 tool('gcc-12','-B'+str(prefix.parent)+'/','-Os','-fPIC','-m32','-mhard-float','-msdata=none','-ffreestanding','-fno-builtin','-fno-asynchronous-unwind-tables','-fno-stack-protector','-c',NATIVE/'online-menu.c','-o',out/'menu.o')
 tool('ld.bfd','--emit-relocs','-T',ld,out/'menu.o',ROOT/'build/ppc-tools/usr/lib/gcc-cross/powerpc-linux-gnu/12/libgcc.a','-o',out/'menu.elf')
 tool('objcopy','-O','binary',out/'menu.elf',NATIVE/'online-menu.bin')
 relocs=[]
 for line in tool('readelf','-rW',out/'menu.elf').splitlines():
  fields=line.split()
  if len(fields)<3 or not fields[2].startswith('R_PPC_'):continue
  if fields[2]=='R_PPC_ADDR32':relocs.append(int(fields[0],16))
  elif fields[2] not in ('R_PPC_REL16_HA','R_PPC_REL16_LO','R_PPC_REL24','R_PPC_REL32','R_PPC_LOCAL24PC'):raise ValueError(line)
 tool('as','-mgekko',NATIVE/'online-menu-hook.s','-o',out/'hook.o')
 tool('ld.bfd','-Ttext=0x80221d00','-e','online_menu_hook','--defsym=menu_input=0x80229624','--defsym=flush_data=0x8034480c','--defsym=invalidate_code=0x803448d4',out/'hook.o','-o',out/'hook.elf')
 tool('objcopy','-O','binary',out/'hook.elf',NATIVE/'online-menu-hook.bin')
 files=['online-menu.c','online-menu-hook.s','online-menu.bin','online-menu-hook.bin','leaderboard-label.ia4']
 hashes={name:hashlib.sha256((NATIVE/name).read_bytes()).hexdigest() for name in files}
 (NATIVE/'online-menu.json').write_text(json.dumps({'version':1,'relocations':relocs,'hashes':hashes},indent=2)+'\n')
 print('Built native menu,',len((NATIVE/'online-menu.bin').read_bytes()),'bytes,',len(relocs),'relocations')
if __name__=='__main__':main()
