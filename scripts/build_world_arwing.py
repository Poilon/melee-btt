"""Assemble the Corneria host without overlapping the online menu at 0x80221d00."""
from pathlib import Path
import subprocess,os,json
r=Path(__file__).resolve().parents[1];t=r/'build/ppc-tools/usr/bin/powerpc-linux-gnu-';p=r/'build/arwing-adapter';p.mkdir(parents=True,exist_ok=True);e=dict(os.environ,LD_LIBRARY_PATH=str(r/'build/ppc-tools/usr/lib/x86_64-linux-gnu'))
def run(n,a):return subprocess.run([str(t)+n,*map(str,a)],env=e,check=True,capture_output=True,text=True).stdout
run('as',['-mgekko','scripts/native/world-arwing.s','-o',p/'world-arwing.o'])
syms={'fox_init':0x80220b84,'corneria_reset':0x801dccfc,'corneria_schedule':0x801dce1c,'Ground_GetStageGObj':0x801c14d0,'disable_collision':0x80057bc0,'world_wind':0x80221368,'fighter_damage':0x8006cc7c,'laser_hit_resume':0x802e8390,'heading_resume':0x801df1a4,'shot_heading_resume':0x801df500,'fox_shot_resume':0x801df52c,'retail_start_path':0x801c8138,'set_path_rate':0x801c7a04}
a=['-Ttext=0x80221930','-e','world_arwing_init',p/'world-arwing.o','-o',p/'world-arwing.elf']
for k,v in syms.items():a+=['--defsym',k+'='+hex(v)]
run('ld.bfd',a);run('objcopy',['-O','binary',p/'world-arwing.elf','scripts/native/world-arwing.bin'])
syms={l.split()[2]:int(l.split()[0],16) for l in run('nm',[p/'world-arwing.elf']).splitlines() if len(l.split())==3 and l.split()[2].startswith('world_arwing_')}
Path('scripts/native/world-arwing-symbols.json').write_text(json.dumps(syms,indent=2)+'\n');assert (r/'scripts/native/world-arwing.bin').stat().st_size<=0x3d0
print('Built native Corneria host:', (r/'scripts/native/world-arwing.bin').stat().st_size, 'bytes')
