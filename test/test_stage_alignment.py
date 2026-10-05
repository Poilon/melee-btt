"""Regression coverage for painted foreground registration and the Marth trap."""
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_character_worlds import WORLDS,WorldArt
from character_routes import apply_routes
from stage_access import validate_access,walkable_segments
from test_stage_collisions import encode


class PaintedAlignment(unittest.TestCase):
    def test_native_floor_endpoints_register_to_painted_pixels(self):
        for i,spec in enumerate(WORLDS):
            if spec[2] in ('Lg','Gw'):continue
            with self.subTest(character=spec[0]):
                art=WorldArt(spec,i).build()
                scene=json.loads((art.world_assets/'scene.json').read_text())
                tr=scene['collisionTracing'];iw,ih=tr['size'];l,t,r,b=scene['bounds']
                vertices,lines,_=encode(art)
                floors=[(vertices[line[0]],vertices[line[1]]) for line in lines if line[6]==1]
                expected=[]
                for index,(px,pr,py) in enumerate(tr['surfaces']):
                    if index in tr.get('removedSurfaces',[]):continue
                    spans=[(px,pr)]
                    for gl,gr in tr.get('surfaceGaps',{}).get(str(index),[]):
                        spans=[part for a,b in spans for part in [(a,min(b,gl)),(max(a,gr),b)] if part[1]>part[0]]
                    expected.extend((a,b,py) for a,b in spans)
                for px,pr,py in expected:
                    a=(l+px/iw*(r-l),t-py/ih*(t-b));z=(l+pr/iw*(r-l),a[1])
                    # Native f32 serialization must stay within 1/100 source pixel.
                    self.assertTrue(any(abs(v[0]-a[0])<(r-l)/iw/100 and abs(v[1]-a[1])<(t-b)/ih/100
                                        and abs(w[0]-z[0])<(r-l)/iw/100 and abs(w[1]-z[1])<(t-b)/ih/100 for v,w in floors))
                for index,contour in art.solid_contours.items():
                    # Every polygon edge survives encoding with its neighbours.
                    matches=[line for line in lines if line[7]!=1 and any(abs(vertices[line[0]][0]-x)<.001 and abs(vertices[line[0]][1]-y)<.001 for x,y in contour)]
                    self.assertGreaterEqual(len(matches),len(contour))

    def test_fire_rescue_black_ledges_share_native_collision_edges(self):
        i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Gw')
        art=WorldArt(spec,i).build()
        self.assertTrue(art.native_fire)
        self.assertFalse(hasattr(art,'painted_scene'))
        from character_fire import INK
        from build_grassland import rgb
        for x,y,w,_ in art.platforms:
            self.assertTrue(any((x,y) in [(v[0],v[1]) for v in t] and
                                (x+w,y) in [(v[0],v[1]) for v in t] and t[0][3]==rgb(INK)
                                for t in art.triangles))

    def test_mario_has_no_free_target_on_the_spawn(self):
        from world_mechanics import apply_mechanics
        import math
        i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Mr')
        art=WorldArt(spec,i).build();apply_routes(art)
        from build_character_worlds import validate_art
        validate_art(art);apply_mechanics(art)
        self.assertGreater(min(math.dist(art.spawn,t)*art.world_scale for t in art.targets),40)

    def test_mario_water_and_pipe_have_open_routes_and_registered_platforms(self):
        from build_character_worlds import validate_art
        from world_mechanics import apply_mechanics
        i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Mr')
        art=WorldArt(spec,i).build();apply_routes(art);validate_art(art)
        self.assertEqual(art.access_audit['reachableLandings'],art.access_audit['landings'])
        # No invisible bridge under the river; the low target demands recovery.
        self.assertFalse(any(x<0<x+w for x,y,w,h,_ in art.solids))
        self.assertLess(art.targets[3][1],art.authored_surfaces[8][2])
        # The masonry alcove and pipe underside are real open pockets.
        for index in (1,7):
            tx,ty=art.targets[index]
            self.assertFalse(any(x-7<tx<x+w+7 and y-7<ty<y+h+7 for x,y,w,h,_ in art.solids))
        apply_mechanics(art)
        ferry=art.mechanisms[0]
        for step in range(33):
            x=ferry['x']+ferry['dx']*step/32;y=ferry['y']
            self.assertFalse(any(x<bx+bw and x+ferry['width']>bx and y>by and y-7<by+bh for bx,by,bw,bh,_ in art.solids))
        self.assertEqual(len(art.target_cycles),1)
        self.assertEqual(art.target_cycles[0]['target'],5)

    def test_marth_cannot_cross_a_tower_using_the_buried_base_floor(self):
        i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Ms')
        art=WorldArt(spec,i).build();apply_routes(art)
        self.assertEqual(validate_access(art)['reachableLandings'],21)
        # Remove the six newly drawn exterior steps: the original dead end
        # must be detected, although every target still has a nearby platform.
        art.platforms=art.platforms[:-6]
        with self.assertRaisesRegex(ValueError,'wall-clear route'):validate_access(art)
        self.assertGreater(len(walkable_segments(art)),len(art.platforms)+len(art.solids))

    def test_doc_combines_solid_chambers_with_narrow_landings_and_keeps_targets_in_art(self):
        from build_character_worlds import validate_art
        from world_mechanics import apply_mechanics
        from world_challenge import validate_scaled_clearance
        i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Dr')
        art=WorldArt(spec,i).build();apply_routes(art);validate_art(art);apply_mechanics(art)
        self.assertEqual(len(art.solids),7)  # Dock, cabinet, column and testing chamber.
        self.assertGreaterEqual(sum(w<30 for x,y,w,_ in art.platforms),4)
        self.assertGreater(max(w for x,y,w,_ in art.platforms),60)
        self.assertTrue(any(h>100 for x,y,w,h,_ in art.solids))
        self.assertFalse(any(x<=0<=x+w and y+h<=0 for x,y,w,h,_ in art.solids))
        bumpers=[m for m in art.mechanisms if m['kind']=='bumper']
        self.assertEqual(len({m['width'] for m in bumpers}),3)
        self.assertEqual({m['skin'] for m in bumpers},{'basin','glob','press'})
        self.assertEqual({m['mount'] for m in bumpers},{'catwalk','cabinet','ceiling'})
        basin=next(m for m in bumpers if m['skin']=='basin')
        self.assertAlmostEqual(basin['y']-basin['height'],art.authored_surfaces[8][2])
        self.assertAlmostEqual(basin['x']+basin['width']/2,art.targets[3][0])
        self.assertGreater(art.targets[3][1]-basin['y'],10)
        glob=next(m for m in bumpers if m['skin']=='glob')
        self.assertAlmostEqual(glob['x']+12,art.authored_surfaces[2][0])
        self.assertEqual(max(x for x,y in glob['outline']),0) # Jet anchored to its nozzle.
        step_x,step_y,step_w=art.platform_copies[-1]['surface']
        # Retracted jet leaves the step's airspace; extended jet reaches it.
        self.assertGreater(glob['x']-glob['width']*min(s for _,s in glob['scaleX']),step_x+step_w)
        self.assertLess(glob['x']-glob['width']*1.2,step_x)
        self.assertGreater(glob['y']-7.5,step_y)
        self.assertLess(glob['y']-7.5,step_y+14)
        from world_mechanics import keyframes
        press=next(m for m in bumpers if m['skin']=='press')
        shaft=next(m for m in art.mechanisms if m.get('skin')=='shaft')
        for (frame,head_y),(scale_frame,scale) in zip(keyframes(press,'y'),shaft['scaleY']):
            self.assertEqual(frame,scale_frame)
            self.assertAlmostEqual(shaft['y']-shaft['height']*scale,head_y)
        floor=art.authored_surfaces[11][2]
        self.assertGreater(press['y']+press['dy']-press['height'],floor+3)
        art.targets[0]=(331,50)
        with self.assertRaisesRegex(ValueError,'illustrated play area'):
            validate_scaled_clearance(art)


if __name__=='__main__':unittest.main()
