"""Retail imports must remain bounded, textured and separate from collisions."""
import json
import math
import struct
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_grassland import Art,Dat
from retail_actors import models,ASSETS
from world_mechanics import append_collisions
from adventure_mechanisms import sortie


class AdventureAssets(unittest.TestCase):
    def test_all_original_models_encode_with_textures_within_native_budget(self):
        for kind in ('arwing','wolfen','beamos','beam','octorok','rock','deku','wallmaster','chest'):
            with self.subTest(kind=kind):
                d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
                poses,period=models(d,kind)
                self.assertLess(len(d.finish()),1024*1024)
                self.assertGreater(period,0)
                for obj in poses:
                    while obj:
                        tex=d.u(d.u(obj+8)+8)
                        self.assertNotEqual(tex,0)
                        self.assertEqual(d.u(d.u(tex+0x4c)+8),6)
                        obj=d.u(obj+4)
                spec=json.loads((ASSETS/kind/'model.json').read_text())
                self.assertNotIn('custom',spec['source'])
                self.assertTrue(all(len(m['originalTextureSha256'])==64 for m in spec['meshes']))

    def test_friendly_arwing_does_not_create_an_invisible_floor(self):
        d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
        d.roots['coll_data']=d.alloc(44)
        a=Art();a.solid(-50,-20,100,20);a.collisions(d)
        count=d.u(d.roots['coll_data']+12)
        a.mechanisms=[sortie('Cover flight','arwing',-100,100,80,50,400,40,True)]
        append_collisions(d,a)
        self.assertEqual(d.u(d.roots['coll_data']+12),count)

    def test_left_facing_beam_keeps_its_floor_and_ceiling_sides(self):
        from adventure_mechanisms import model
        d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
        d.roots['coll_data']=d.alloc(44)
        a=Art();a.solid(-50,-20,100,20);a.collisions(d)
        m=model('Beam','beam',0,80,84)
        m.update(height=3,outline=[(0,0),(84,0),(84,-3),(0,-3)],collisionOrientation=2.79)
        a.mechanisms=[m];append_collisions(d,a)
        c=d.roots['coll_data'];vp=d.u(c);lp=d.u(c+8)
        for i in range(d.u(c+12)):
            row=struct.unpack_from('>6hHBB',d.data,lp+16*i)
            if row[0]<4:continue
            x,y=struct.unpack_from('>2f',d.data,vp+8*row[0]);xx,yy=struct.unpack_from('>2f',d.data,vp+8*row[1])
            for angle in (2.79,2.9,3.0):
                dx=(xx-x)*math.cos(angle)-(yy-y)*math.sin(angle)
                dy=(xx-x)*math.sin(angle)+(yy-y)*math.cos(angle)
                if row[6]==1:self.assertGreater(dx,0)
                elif row[6]==2:self.assertLess(dx,0)
                elif row[6]==4:self.assertLess(dy,0)
                else:self.assertGreater(dy,0)


if __name__=='__main__':unittest.main()
