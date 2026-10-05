"""Complete retail actors, native-code preservation and newly opened terrain."""
import bisect,struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import native_encounters as retail
from build_grassland import Dat,iso_table
from build_character_worlds import dol_sections
from test_stage_chest import world
ROOT=Path(__file__).resolve().parents[1]
ISO=ROOT/'Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso'

def empty():return Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))

class RetailEncounters(unittest.TestCase):
 def test_no_trophy_substitutes_for_requested_native_enemies(self):
  for suffix in ('Ns','Ic','Sk'):
   a=world(suffix)
   self.assertFalse(any(m.get('nativeProp') in ('onett-car','topi','redead') for m in a.mechanisms))
   self.assertTrue(all(e['implementation']=='retail actor AI and animations' for e in a.native_source_elements))
 def test_removed_floor_and_new_gaps_are_real_and_painted(self):
  a=world('Kb');self.assertEqual(a.solids,[]);self.assertEqual(len(a.platforms),4)
  self.assertEqual(len(a.mechanisms),2);self.assertFalse(getattr(a,'wind',None))
  for suffix in ('Pk','Sk'):
   a=world(suffix);self.assertEqual(len(a.pits),2)
   for pit in a.pits:
    self.assertFalse(any(x<pit['right'] and x+w>pit['left'] and y<pit['top'] and y+h>=pit['top'] for x,y,w,h,_ in a.solids))
  a=world('Ss');self.assertFalse(any(m['kind']=='fire' for m in a.mechanisms))
  mobs=[m for m in a.mechanisms if m.get('nativeProp')=='metroid']
  self.assertEqual(len(mobs),2);self.assertTrue(all(m['orbit'] and m['dy'] and m['period']<=250 for m in mobs))
  from world_mechanics import keyframes
  for m in mobs:
   for (_,x),(_,y) in zip(keyframes(m,'x'),keyframes(m,'y')):
    self.assertFalse(any(x<bx+w and x+m['width']>bx and y-m['height']<by+h and y>by for bx,by,w,h,_ in a.solids))
 @unittest.skipUnless(ISO.exists(),'Requires local retail disc')
 def test_onett_imports_native_attack_scripts_and_slower_traffic(self):
  retail.load(ISO)
  e=next(e for e in iso_table(ISO)[2] if e[1]=='GrTFx.dat')
  with ISO.open('rb') as f:f.seek(e[2]);d=Dat(f.read(e[3]))
  retail.install(d,world('Ns'))
  d=Dat(d.finish());src=retail.SOURCES['GrOt.dat'];sd=src.d
  table=d.roots['ALDYakuAll'];old=sd.roots['ALDYakuAll']
  self.assertEqual(d.u(table),0);self.assertEqual(d.u(table+24),0)
  for i in range(1,6):
   p=sd.u(old+4*i);end=src.cuts[bisect.bisect_right(src.cuts,p)]
   q=d.u(table+4*i)
   self.assertTrue(q);self.assertEqual(d.data[q:q+end-p],sd.data[p:end])
  cfg=d.u(d.roots['yakumono_param']);params=d.u(cfg+4)
  self.assertEqual(struct.unpack_from('>2f',d.data,params+0x54),(4.,2.))
 @unittest.skipUnless(ISO.exists(),'Requires local retail disc')
 def test_onett_and_polar_bear_resources_copy_all_pointer_reachable_bytes(self):
  retail.load(ISO)
  for name in ('GrOt.dat','GrIm.dat'):
   src=retail.SOURCES[name];d=src.d;out=empty()
   if name=='GrOt.dat':src.copy(out,d.u(d.roots['map_head']+8)+3*52,52)
   else:src.copy(out,d.u(d.roots['itemdata']))
   self.assertGreater(len(out.retail_blocks),100)
   for (sha,p,size),q in out.retail_blocks.items():
    end=p+size if size is not None else src.cuts[bisect.bisect_right(src.cuts,p)]
    expected=bytearray(d.data[p:end])
    for r in src.ptrs:
     if p<=r<end:struct.pack_into('>I',expected,r-p,out.retail_blocks[(sha,d.u(r),None)])
    self.assertEqual(out.data[q:q+len(expected)],expected)
 @unittest.skipUnless(ISO.exists() and (ROOT/'build/custom-stage/Mechanics Worlds.iso').exists(),'Requires local built disc')
 def test_native_onett_topi_redead_and_bear_code_is_unchanged(self):
  def data(path):
   with path.open('rb') as f:b=f.read(0x500000)
   ss=dol_sections(b)[1]
   def read(a,z):
    p=next(o+a-s for s,o,n in ss if s<=a and z<=s+n);return b[p:p+z-a]
   return read
  old=data(ISO);new=data(ROOT/'build/custom-stage/Mechanics Worlds.iso')
  for a,z in ((0x801e3738,0x801e50dc),(0x802e2400,0x802e4a58),(0x802e8bcc,0x802eac8c),(0x8027b5b0,0x8027b730)):
   self.assertEqual(old(a,z),new(a,z))

if __name__=='__main__':unittest.main()
