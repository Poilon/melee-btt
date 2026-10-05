"""Original-asset provenance and the collision/animation contract for roster props."""
import hashlib,json,struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_grassland import Dat
from native_props import ASSETS,specification,attach
from test_stage_chest import world
from roster_mechanisms import ROSTER
from world_mechanics import animation,keyframes

class NativeProps(unittest.TestCase):
 def test_every_model_has_relocated_textured_geometry_and_verified_source(self):
  for folder in sorted(ASSETS.iterdir()):
   if not folder.is_dir():continue
   with self.subTest(asset=folder.name):
    spec=specification(folder.name);raw=(folder/'model.dat').read_bytes();d=Dat(raw)
    self.assertEqual(hashlib.sha256(raw).hexdigest(),spec['modelSha256'])
    self.assertEqual(len(spec['sourceSha256']),64);self.assertGreater(spec['triangles'],20)
    for r in d.reloc:self.assertLess(d.u(r),len(d.data))
    obj=d.u(d.roots['model']+16);count=0
    while obj:
     count+=1;mat=d.u(obj+8);p=d.u(obj+12);attrs=d.u(p+8)
     self.assertEqual(d.u(attrs),9);self.assertGreater(d.u(p+16),0)
     if d.u(mat+8):self.assertGreater(d.u(d.u(mat+8)+0x4c),0)
     obj=d.u(obj+4)
    self.assertGreater(count,0)

 def test_all_thirteen_have_native_sources_and_monotone_animation_tracks(self):
  identities=set();mixes=set()
  for suffix in ROSTER:
   a=world(suffix)
   if suffix=='Kb':
    self.assertEqual(a.native_source_elements,[]);self.assertFalse(getattr(a,'wind',None))
   else:self.assertTrue(a.native_source_elements)
   identities.add(a.gameplay_identity)
   mixes.add(tuple(sorted(m['kind'] for m in a.mechanisms)))
   for m in a.mechanisms:
    for axis in ('x','y'):
     keys=keyframes(m,axis)
     self.assertTrue(all(f<=ff for (f,_),(ff,_) in zip(keys,keys[1:])),(suffix,m['name'],axis))
    d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64));animation(d,m)
    if m.get('nativeProp'):
     node=d.joint();anim=d.alloc(20);self.assertEqual(attach(d,node,anim,m),2)
     self.assertGreater(d.u(node+8),0)
  self.assertEqual(len(identities),13);self.assertGreaterEqual(len(mixes),8)

 def test_custom_keyed_traffic_moves_even_without_a_default_delta(self):
  for suffix,name in [('Fe','Binding Blade siege sweep'),('Gw','Flat Zone falling tool')]:
   m=next(m for m in world(suffix).mechanisms if m['name']==name)
   d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64));a=animation(d,m)
   tracks=d.u(d.u(a+8)+8);kinds=[]
   while tracks:kinds.append(d.data[tracks+12]);tracks=d.u(tracks)
   self.assertIn(6 if suffix=='Gw' else 5,kinds)

if __name__=='__main__':unittest.main()
