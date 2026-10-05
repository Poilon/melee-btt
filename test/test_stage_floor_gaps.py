"""Painted foundations must not be cut into arbitrary flat-colour rectangles."""
import unittest
from test_stage_project import art,base

RESTORED={'Ic','Ms','Mt','Ns','Pc','Pr','Ss','Zd','Fe'}
class FloorIntegrity(unittest.TestCase):
 def test_restored_foundations_match_the_painting_and_editor(self):
  for stage in RESTORED:
   a=art(stage);b=base(stage)
   self.assertFalse(getattr(a,'floor_voids',None),stage)
   self.assertNotIn('floorVoids',b,stage)
   self.assertFalse(any(p['name']=='Open bottomless gap' for p in a.pits),stage)
   x,y,w,h,_=a.solids[0]
   self.assertGreater(w,(b['artBounds'][2]-b['artBounds'][0])*.55,stage)
   self.assertTrue(any(x<=a.spawn[0]<=x+w and 0<=a.spawn[1]-(y+h)<4 for x,y,w,h,_ in a.solids),stage)
   self.assertEqual(len(a.solids),len(b['project']['solids']),stage)
 def test_authored_holes_remain_in_pikachu_and_sheik(self):
  for stage in ('Pk','Sk'):
   a=art(stage);self.assertEqual(len(a.pits),2)
   for p in a.pits:
    self.assertFalse(any(x<p['right'] and x+w>p['left'] and y<p['top']<=y+h for x,y,w,h,_ in a.solids),stage)
if __name__=='__main__':unittest.main()
