"""Rendered walking rims and encoded transparent prop integrity."""
import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_character_worlds import WORLDS,WorldArt,validate_art
from build_grassland import Dat
from character_routes import apply_routes
from world_mechanics import apply_mechanics
from world_props import PROPS,prop_mesh


class WorldProps(unittest.TestCase):
    def test_contact_obstacles_have_native_alpha_materials_and_touch_their_mounts(self):
        from world_props import HAZARD_PROPS
        for i,s in enumerate(WORLDS):
            if s[2] not in HAZARD_PROPS or s[2] in ('Ca','Fc'):continue
            with self.subTest(character=s[0]):
                a=WorldArt(s,i).build();apply_routes(a);validate_art(a);apply_mechanics(a)
                hazards=[m for m in a.mechanisms if m['kind']=='bumper' and not m.get('entity')]
                self.assertTrue(hazards)
                for m in hazards:
                    self.assertIn(m['propSkin'],('hazard','thorn'))
                    l,r,y=a.authored_surfaces[m['mountSurface']]
                    if s[2]=='Fc':self.assertAlmostEqual(m['x']+m['width'],l)
                    else:self.assertAlmostEqual(m['y']-m['height'],y)
                    if s[2] in ('Ys','Dk'):
                        self.assertGreaterEqual(m['x'],l)
                        self.assertLessEqual(m['x']+m['width'],r)
                    # The collision envelope has the same dimensions as its
                    # textured sprite, including non-circular piston/barrier.
                    self.assertAlmostEqual(max(x for x,y in m['outline']),m['width'])
                    self.assertAlmostEqual(min(y for x,y in m['outline']),-m['height'])
                    d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
                    obj=prop_mesh(d,a,m);mat=d.u(obj+8);tex=d.u(mat+8)
                    self.assertEqual(d.u(d.u(tex+0x4c)+8),6)
                    self.assertEqual(d.data[d.u(mat+20)+1],127)

    def test_boost_is_safe_and_vine_has_a_real_moving_grip(self):
        for suffix in ('Ca','Dk'):
            i,s=next((i,s) for i,s in enumerate(WORLDS) if s[2]==suffix)
            a=WorldArt(s,i).build();apply_routes(a);validate_art(a);apply_mechanics(a)
            if suffix=='Ca':
                boosts=[m for m in a.mechanisms if m['kind']=='boost']
                self.assertEqual(len(boosts),2)
                self.assertEqual(sorted(m['impulseX'] for m in boosts),[-5.8,5.8])
                upper=next(m for m in boosts if m['impulseX']<0)
                self.assertEqual(upper['y'],a.authored_surfaces[2][2])
                self.assertLess(upper['propRect'][2],0)
                boost=next(m for m in boosts if m['impulseX']>0)
                self.assertEqual(boost['damage'],0)
                self.assertGreater(boost['impulseX'],5)
                self.assertLess(boost['x']+boost['width'],a.pits[0]['left'])
                self.assertEqual(boost['propSkin'],'boost')
                self.assertFalse(any(m['kind']=='bumper' for m in a.mechanisms))
            else:
                vine=next(m for m in a.mechanisms if m['kind']=='vine')
                self.assertTrue(vine['grabbable'])
                self.assertEqual(vine['propSkin'],'vine')
                self.assertEqual(vine['angleKeys'][0][1],vine['angleKeys'][-1][1])
                self.assertLess(min(v for _,v in vine['angleKeys']),0)
                self.assertGreater(max(v for _,v in vine['angleKeys']),0)
                hazards=[m for m in a.mechanisms if m['kind']=='bumper']
                self.assertEqual(len(hazards),3)
                self.assertTrue(any(m['dx'] for m in hazards))

    def test_ganon_has_two_distinct_routes_and_textured_threats(self):
        i,s=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Gn')
        a=WorldArt(s,i).build();apply_routes(a);validate_art(a);apply_mechanics(a)
        self.assertEqual(len(a.authored_surfaces),10)
        self.assertEqual(len(a.solids),3)
        self.assertEqual(len(a.platforms),7)
        ferry,lift=a.mechanisms[:2]
        self.assertGreaterEqual(ferry['dx'],190)
        self.assertGreater(lift['dy'],140)
        # Entire undercroft path clears the bastion, even for the tall fighter.
        self.assertLess(ferry['y']+45,min(y for x,y in a.solid_contours[2]))
        hazards=[m for m in a.mechanisms if m['kind']=='bumper']
        self.assertEqual({m.get('propSkin',m.get('entity')) for m in hazards},{'crusher','wallmaster'})
        self.assertTrue(all(m['damage']>0 for m in hazards))
        crusher=next(m for m in hazards if m.get('propSkin')=='crusher')
        ys=[y for _,y in crusher['yKeys']]
        self.assertAlmostEqual(min(ys)-crusher['height'],a.authored_surfaces[6][2])
        self.assertGreater(max(ys)-crusher['height']-a.authored_surfaces[6][2],50)
        self.assertLess(a.targets[4][1],min(y for x,y in a.solid_contours[2]))

    def test_ganon_facades_do_not_create_walkable_seams(self):
        i,s=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Gn')
        a=WorldArt(s,i).build()
        d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64));d.roots['coll_data']=d.alloc(44);a.collisions(d)
        c=d.roots['coll_data'];vp=d.u(c);lp=d.u(c+8);grabs=0
        for i in range(d.u(c+12)):
            line=struct.unpack_from('>6hHBB',d.data,lp+i*16)
            x,y=struct.unpack_from('>2f',d.data,vp+line[0]*8)
            xx,yy=struct.unpack_from('>2f',d.data,vp+line[1]*8)
            if line[6]==1:self.assertLessEqual(abs(yy-y),abs(xx-x)+.001)
            if line[7]&2:grabs+=1
        self.assertEqual(grabs,3) # Only the three real solid upper rims.

    def test_every_prop_has_valid_alpha_texture_and_rim_at_its_collision(self):
        for i,s in enumerate(WORLDS):
            if s[2] not in PROPS:continue
            with self.subTest(character=s[0]):
                a=WorldArt(s,i).build();apply_routes(a);validate_art(a);apply_mechanics(a)
                manifest=json.loads((a.world_assets/'props.json').read_text())
                for m in a.mechanisms:
                    if m['kind'] not in ('gate','platform') or m.get('entity') or m.get('nativeProp'):continue
                    self.assertIn('propSkin',m)
                    entry=manifest['sprites'][m['propSkin']]
                    data=(a.world_assets/entry['file']).read_bytes()
                    self.assertEqual(hashlib.sha256(data).hexdigest(),entry['sha256'])
                    w,h=entry['size'];self.assertEqual(len(data),w*h*4)
                    # Native RGBA8 stores alpha at even offsets in the AR plane
                    # of each 4x4 tile. We require both cutout and solid texels.
                    alpha=[data[k+j] for k in range(0,len(data),64) for j in range(0,32,2)]
                    # The containment shutter is a full solid rectangle,
                    # cropped flush to its metal edges (no cutout interior).
                    if entry['sourceAtlas']!='containment-gate-source.png':self.assertLess(min(alpha),16)
                    self.assertGreater(max(alpha),240)
                    x,y,width,height=m['propRect']
                    self.assertEqual((x,width),(0,m['width']))
                    if m['kind']=='platform':
                        self.assertAlmostEqual(y-entry['walkingInset']*height,0)
                    else:self.assertEqual((y,height),(0,m['height']))
                    # Exercise actual material/UV construction, not only metadata.
                    d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
                    obj=prop_mesh(d,a,m);mat=d.u(obj+8);tex=d.u(mat+8)
                    self.assertEqual(d.u(d.u(tex+0x4c)+8),6) # GX_RGBA8
                    self.assertEqual(d.data[d.u(mat+20)+1],127)

    def test_corrupted_prop_is_rejected_before_building_an_archive(self):
        i,s=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Pe')
        a=WorldArt(s,i).build();apply_routes(a);validate_art(a);apply_mechanics(a)
        with patch.object(Path,'read_bytes',return_value=b'corrupt'):
            with self.assertRaisesRegex(ValueError,'Damaged'):
                prop_mesh(None,a,a.mechanisms[0])

if __name__=='__main__':unittest.main()

class RollingBarrels(unittest.TestCase):
    def test_roll_follows_distance_reverses_and_stops_without_rotating_collision(self):
        from test_stage_project import art
        from world_props import rolling_keys
        from stage_project import apply_motion
        import copy
        a=art('Dk');m=next(m for m in a.mechanisms if m.get('rollRadius'))
        keys=dict(rolling_keys(m));self.assertEqual(keys[0],0);self.assertEqual(keys[30],0)
        self.assertAlmostEqual(keys[105],-58/m['rollRadius']);self.assertEqual(keys[105],keys[165]);self.assertEqual(keys[240],0)
        m=copy.deepcopy(m);apply_motion(m,{'motion':{'kind':'moving','keys':[[0,m['x'],m['y']],[100,m['x']-30,m['y']],[270,m['x'],m['y']]]}})
        self.assertAlmostEqual(dict(rolling_keys(m))[100],30/m['rollRadius'])
        apply_motion(m,{'motion':{'kind':'teleport','keys':[[0,m['x'],m['y']],[100,m['x']-30,m['y']],[270,m['x'],m['y']]]}})
        self.assertTrue(all(angle==0 for _,angle in rolling_keys(m)))

    def test_rolling_visual_children_keep_later_collision_indices_and_no_downward_hit(self):
        from test_stage_project import art
        from test_stage_mechanics import archive
        from world_mechanics import build_mechanics
        from build_grassland import Art
        a=art('Dk');barrel=next(m for m in a.mechanisms if m.get('rollRadius'));thorn=a.mechanisms[-1]
        d=archive();d.roots['map_head']=d.alloc(48);d.roots['yakumono_param']=d.alloc(44);groups=d.alloc(156);d.pointer(d.roots['map_head']+8,groups)
        root=d.joint();d.pointer(groups+104,root);previous=None
        for i in range(10):
            node=d.joint();d.pointer(previous+12 if previous else root+8,node);previous=node
        stage=Art();stage.solids=a.solids;stage.collisions(d);a.mechanisms=[barrel,thorn];a.target_cycles=[]
        with patch('world_mechanics.moving_mesh',return_value=None):build_mechanics(d,a)
        nodes=[root]
        def walk(j):
            while j:
                nodes.append(j)
                if d.u(j+8):walk(d.u(j+8))
                j=d.u(j+12)
        walk(d.u(root+8));links=d.u(groups+136)
        self.assertEqual(struct.unpack_from('>3h',d.data,links),(1,2,11));self.assertEqual(struct.unpack_from('>3h',d.data,links+6),(2,2,14))
        self.assertEqual(struct.unpack_from('>f',d.data,nodes[11]+24)[0],0)
        self.assertAlmostEqual(struct.unpack_from('>f',d.data,nodes[14]+44)[0],thorn['x'])
        desc=d.u(d.roots['yakumono_param']+4)
        rows=[struct.unpack_from('>9I',d.data,desc+i*36) for i in range(4)]
        self.assertEqual([row[2] for row in rows],[80,80,25,155]);self.assertTrue(all(row[1]==6 and row[4]==0 for row in rows[:2]));self.assertTrue(all(row[1]==10 and row[4]==150 for row in rows[2:]))
        # The other bumper retains its retail damage, directions and fixed knockback.
        desc=d.u(d.roots['yakumono_param']+8);self.assertEqual(struct.unpack_from('>9I',d.data,desc+36)[:5],(1,10,270,100,150))


class SpikedBarrel(unittest.TestCase):
    def test_only_fixed_barrel_has_a_textured_spike_and_matching_upper_collision(self):
        from test_stage_project import art
        from editor_model_assets import empty,parts
        a=art('Dk');fixed=next(m for m in a.mechanisms if m.get('topSpike'));rolling=next(m for m in a.mechanisms if m.get('rollRadius'))
        self.assertEqual(fixed['name'],'impact barrel');self.assertNotIn('topSpike',rolling)
        self.assertAlmostEqual(max(y for x,y in fixed['outline']),fixed['topSpike']['height'])
        self.assertAlmostEqual(min(y for x,y in fixed['outline']),-fixed['height'])
        d=empty();obj=prop_mesh(d,a,fixed);meshes=parts(d,obj);self.assertEqual(len(meshes),2)
        self.assertEqual(meshes[0]['texture'],meshes[1]['texture']);self.assertAlmostEqual(max(v[1] for v in meshes[1]['vertices']),fixed['topSpike']['height'],places=5)
        # No new collision height on the rolling barrel or the thorn pod.
        self.assertEqual(max(y for x,y in rolling['outline']),0)
