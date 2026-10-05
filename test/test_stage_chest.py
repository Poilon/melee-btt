"""Interactive chest configuration and authored foreground regression checks."""
import json,struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_grassland import Dat
from build_character_worlds import WORLDS,WorldArt,validate_art
from character_routes import apply_routes,unobstructed
from world_mechanics import apply_mechanics
from retail_actors import models


def world(suffix):
 i,s=next((i,s) for i,s in enumerate(WORLDS) if s[2]==suffix)
 a=WorldArt(s,i).build();apply_routes(a);validate_art(a);apply_mechanics(a);return a


class InteractiveChest(unittest.TestCase):
 def test_lid_and_base_partition_every_original_triangle(self):
  def archive():return Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
  def triangles(part):
   d=archive();poses,_=models(d,'chest',part);obj=poses[0];total=0
   while obj:
    p=d.u(obj+12);dl=d.u(p+16);total+=struct.unpack_from('>H',d.data,dl+1)[0]//3;obj=d.u(obj+4)
   return total
  self.assertEqual(triangles('base')+triangles('lid'),triangles(None))
  self.assertGreater(triangles('base'),0);self.assertGreater(triangles('lid'),0)

 def test_roof_has_an_underside_and_chest_reveals_one_of_the_ten_targets(self):
  a=world('Cl');chest=next(m for m in a.mechanisms if 'opensTarget' in m)
  self.assertEqual(chest['opensTarget'],5)
  self.assertEqual(len(a.targets),10)
  roof=next(poly for poly in a.solid_contours.values() if abs(poly[0][1]-a.authored_surfaces[16][2])<.001)
  self.assertGreater(max(y for _,y in roof)-min(y for _,y in roof),15)
  self.assertGreater(a.targets[5][1],chest['y']+15)

 def test_fox_has_five_fixed_surfaces_and_a_smaller_native_aircraft(self):
  a=world('Fx');self.assertEqual((len(a.solids),len(a.platforms)),(3,2))
  self.assertEqual(a.mechanisms,[]);self.assertAlmostEqual(a.aircraft_scale,.48)
  self.assertFalse(any(x<80<x+w for x,_,w,_,_ in a.solids))
  self.assertGreater(a.targets[6][1],max(y for _,_,y in a.authored_surfaces)+90)
  self.assertEqual(world('Fc').aircraft_scale,.55)

 def test_link_target_is_inside_the_open_crest_alcove(self):
  a=world('Lk');self.assertEqual(a.targets[7],(0,18));self.assertTrue(unobstructed(a,*a.targets[7]))
  self.assertTrue(any(x<0<x+w and y>18 and y<40 for x,y,w,h,_ in a.solids))
  self.assertIn('Returning boomerang',a.route_notes[7]['move'])

 @unittest.skipUnless(Path('build/custom-stage/character-worlds/GrTCl.dat').exists(),'Requires built stage')
 def test_built_chest_trigger_is_hidden_inside_the_closed_model(self):
  d=Dat(Path('build/custom-stage/character-worlds/GrTCl.dat').read_bytes());cfg=d.u(d.roots['yakumono_param'])
  self.assertEqual(d.u(cfg),0x43485354);self.assertEqual(d.u(cfg+4),5)
  self.assertEqual((d.u(cfg+40),d.u(cfg+44)),(24,32))
  groups=d.u(d.roots['map_head']+8);anchor=d.u(d.u(groups+104)+8)
  for _ in range(5):anchor=d.u(anchor+12)
  self.assertAlmostEqual(struct.unpack_from('>f',d.data,anchor+48)[0],struct.unpack_from('>f',d.data,cfg+20)[0])
  self.assertLess(struct.unpack_from('>f',d.data,cfg+20)[0],struct.unpack_from('>f',d.data,cfg+36)[0])
  for suffix,scale in [('Fx',.325),('Fc',.5)]:
   d=Dat(Path(f'build/custom-stage/character-worlds/GrT{suffix}.dat').read_bytes());params=d.u(d.u(d.roots['yakumono_param'])+4)
   self.assertAlmostEqual(struct.unpack_from('>f',d.data,params+0x70)[0],scale)

if __name__=='__main__':unittest.main()
