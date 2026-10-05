import math
"""Moving collision islands, hole geometry and native target-track regression checks."""
import sys,struct,unittest,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_grassland import Art,Dat
from build_character_worlds import WORLDS,WorldArt,Mansion,validate_art
from character_routes import apply_routes
from world_mechanics import apply_mechanics,append_collisions,track,clip_polygon,build_mechanics,ride,keyframes,animation,target_keys,pit_mesh
from unittest.mock import patch
from world_gameplay import TARGET_PATTERNS
from world_challenge import scale_archive


def archive():
    body=bytes(64);tail=struct.pack('>2I',4,0)+b'coll_data\0'
    return Dat(struct.pack('>8I',32+len(body)+len(tail),len(body),0,1,0,0,0,0)+body+tail)


class Mechanics(unittest.TestCase):
    def test_fox_bumper_factory_preserves_other_textured_hazards(self):
        from world_mechanics import is_retail_bumper
        self.assertTrue(is_retail_bumper(dict(kind='bumper')))
        for key in ('skin','propSkin','entity','nativeProp','nativeAnimation','rollRadius'):
            self.assertFalse(is_retail_bumper(dict(kind='bumper',**{key:'authored'})))

    def test_rectangular_bumpers_have_only_four_axis_aligned_contact_faces(self):
        for width,height in [(4,160),(400,4),(4,400),(400,400),(16,16)]:
            d=archive();a=Art();a.solid(-200,-100,10,10);a.collisions(d)
            a.mechanisms=[dict(kind='bumper',width=width,height=height)]
            append_collisions(d,a)
            c=d.roots['coll_data'];gp=d.u(c+36)+40
            first=struct.unpack_from('>h',d.data,gp+36)[0]
            points=[struct.unpack_from('>2f',d.data,d.u(c)+8*(first+i)) for i in range(4)]
            self.assertEqual(points,[(-1,1),(width+1,1),(width+1,-height-1),(-1,-height-1)])
            lines=[struct.unpack_from('>6hHBB',d.data,d.u(c+8)+16*i) for i in range(d.u(c+12))]
            edges={line[0]-first:line[6] for line in lines if first<=line[0]<first+4}
            self.assertEqual(edges,{0:1,1:4,2:2,3:8})

    def test_retail_bumper_flash_preserves_rectangles_and_following_collision_links(self):
        from export_editor_additions import original_fox
        d=Dat(original_fox());groups=d.alloc(156);d.pointer(d.roots['map_head']+8,groups)
        root=d.joint();d.pointer(groups+104,root);previous=None
        for _ in range(10):
            child=d.joint();d.pointer(previous+12 if previous else root+8,child);previous=child
        art=Art();art.suffix="Lg";art.solid(159.583,-95,144,197);art.collisions(d)
        art.target_cycles=[];art.pits=[]
        art.mechanisms=[dict(kind='bumper',x=x,y=100,width=4,height=160,dx=0,dy=0,angle=0,period=240,hold=0) for x in (-80,160)]
        art.mechanisms.append(ride('Following platform',200,140,30,dy=20))
        build_mechanics(d,art);links=d.u(groups+136)
        self.assertEqual([struct.unpack_from('>h',d.data,links+6*i+4)[0] for i in range(3)],[11,14,17])
        node=d.u(root+8);anim=d.u(d.u(d.u(groups+108)))
        for _ in range(10):node=d.u(node+12);anim=d.u(anim+4)
        for _ in range(2):
            child=d.u(node+8);a=d.u(anim)
            for source in (0xbcf8,0xc6a8):
                self.assertTrue(d.u(child+16))
                obj=d.u(a+8);self.assertEqual(d.u(obj),0x20000000)
                self.assertEqual(d.u(obj+8),d.u(source+8))
                self.assertEqual(struct.unpack_from('>f',d.data,obj+4)[0],600)
                child=d.u(child+12);a=d.u(a+4)
            self.assertEqual((child,a),(0,0))
            node=d.u(node+12);anim=d.u(anim+4)
        # The contact skin of a wall-mounted rectangle is just ahead of the
        # authored wall, so its native damage callback wins collision resolution.
        c=d.roots['coll_data'];gp=d.u(c+36);vstart=struct.unpack_from('>h',d.data,gp+80+36)[0]
        points=[struct.unpack_from('>2f',d.data,d.u(c)+8*(vstart+i)) for i in range(4)]
        self.assertEqual(min(x for x,y in points),-1)
        self.assertLess(160+min(x for x,y in points),159.583)

    def test_lava_projectile_uses_constant_gravity_and_resets_under_lava(self):
        from stage_entities import actor,ballistic
        m=ballistic(actor('Lava','fireball',90,-48,23,26,period=430),160,144,105,32)
        flight=m['flight'];keys=dict(m['yKeys']);xs=dict(m['xKeys'])
        start=flight['delay'];end=start+flight['duration']
        for t in range(start+1,end):
            self.assertAlmostEqual(keys[t+1]-2*keys[t]+keys[t-1],-flight['gravity'])
            self.assertAlmostEqual(xs[t+1]-xs[t],flight['velocityX'])
        self.assertAlmostEqual(keys[start+72],112)
        self.assertGreater(keys[start+1]-keys[start],0)
        self.assertLess(keys[end]-keys[end-1],0)
        self.assertLess(keys[end],flight['lavaY'])
        self.assertLessEqual(keys[end],-450)
        self.assertAlmostEqual(keys[start+flight['airtime']],flight['launchY'])
        self.assertLess(m['y'],flight['exitY'])
        self.assertEqual(keys[0],keys[end])
        self.assertEqual(keys[start-1],keys[end])
        self.assertEqual(xs[end+1],m['x'])
        angles=dict(m['facingKeys'])
        self.assertEqual(angles[start],0)
        self.assertAlmostEqual(angles[start+72],-math.pi/2)
        self.assertAlmostEqual(angles[start+144],-math.pi)
        self.assertLess(max(abs(angles[t+1]-angles[t]) for t in range(start,start+144)),.11)
        self.assertEqual(angles[end+1],0)
        self.assertLess(m['blink'][2][0],end+1)
        self.assertEqual(m['yKeys'][0][1],m['yKeys'][-1][1])

    def test_textured_actor_children_do_not_shift_later_collision_anchors(self):
        from stage_entities import actor
        d=archive();d.roots['map_head']=d.alloc(48);d.roots['yakumono_param']=d.alloc(44)
        groups=d.alloc(156);d.pointer(d.roots['map_head']+8,groups)
        root=d.joint();d.pointer(groups+104,root);previous=None
        for i in range(10):
            child=d.joint();d.pointer(previous+12 if previous else root+8,child);previous=child
        art=Art();art.solid(-50,-10,100,10);art.collisions(d)
        art.target_cycles=[];art.pits=[]
        art.mechanisms=[actor('Boo','ghost',-40,60,24,27,dx=50),
                        actor('Second Boo','ghost',80,95,30,32,dy=45),
                        ride('Last safe lift',130,60,30,dy=15)]
        with patch('world_mechanics.moving_mesh',return_value=None):build_mechanics(d,art)
        nodes=[]
        def traverse(j,a):
            while j:
                self.assertTrue(a,'Each pose must have a matching animation node')
                nodes.append(j)
                self.assertEqual(bool(d.u(j+8)),bool(d.u(a)))
                if d.u(j+8):traverse(d.u(j+8),d.u(a))
                j,a=d.u(j+12),d.u(a+4)
        anim=d.u(d.u(groups+108));traverse(d.u(root+8),d.u(anim))
        nodes.insert(0,root);links=d.u(groups+136)
        for i,m in enumerate(art.mechanisms):
            _,_,index=struct.unpack_from('>3h',d.data,links+6*i)
            self.assertEqual(struct.unpack_from('>2f',d.data,nodes[index]+44),(m['x'],m['y']))
        self.assertGreater(struct.unpack_from('>h',d.data,links+16)[0],70)
        # Both differently sized Boos share immutable original model/texture data.
        first=d.u(d.u(nodes[11]+8)+8)
        second_index=struct.unpack_from('>h',d.data,links+10)[0]
        second=d.u(d.u(nodes[second_index]+8)+8)
        self.assertEqual(d.u(first+16),d.u(second+16))
        model=d.u(first+16);material=d.u(model+8);texture=d.u(material+8)
        # Mirrored atlas tiles preserve both Boo's white body and its eye UVs.
        self.assertEqual(struct.unpack_from('>2I',d.data,texture+0x34),(2,2))
        self.assertEqual(struct.unpack_from('>f',d.data,texture+0x2c)[0],-1)
        self.assertTrue(d.data[d.u(material+20)]&0x20)  # Self-depth for mouth/arms.

    def test_pipe_plants_retract_inside_the_pipe_and_reset_their_cycles(self):
        i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Mr')
        art=WorldArt(spec,i).build();apply_routes(art);validate_art(art);apply_mechanics(art)
        plants=[m for m in art.mechanisms if m.get('entity')=='plant']
        self.assertEqual(len(plants),2)
        left,right,top=art.authored_surfaces[16]
        bottom=min(y for _,y in art.solid_contours[next(iter(art.no_lower_ledges))])
        for m in plants:
            keys=keyframes(m,'y')
            self.assertEqual(keys[0][1],keys[-1][1])
            self.assertEqual(keys[-1][0],m['period'])
            self.assertGreaterEqual(m['x'],left)
            self.assertLessEqual(m['x']+m['width'],right)
            self.assertLess(keys[0][1],top)
            self.assertGreater(keys[0][1]-m['height'],bottom)
        self.assertGreater(max(y for _,y in keyframes(plants[0],'y')),top+30)
        self.assertLess(min(y for _,y in keyframes(plants[1],'y'))-plants[1]['height'],bottom-30)
        self.assertEqual(len(art.entity_occluders),1)

    def test_bowser_bridge_retains_its_authored_hinge_above_the_lava(self):
        i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Kp')
        art=WorldArt(spec,i).build();apply_routes(art);validate_art(art);apply_mechanics(art)
        bridge=next(m for m in art.mechanisms if m['angle'])
        lava=next(m for m in art.mechanisms if m['kind']=='lava')
        self.assertEqual(bridge['y'],96)
        self.assertGreater(bridge['y']-bridge['width'],lava['y'])
        self.assertGreaterEqual(lava['damage'],40)
        self.assertEqual(len([m for m in art.mechanisms if m.get('entity')=='fireball']),2)

    def test_collision_links_resolve_after_the_native_wrapper_joint(self):
        d=archive();d.roots['map_head']=d.alloc(48);d.roots['yakumono_param']=d.alloc(44)
        groups=d.alloc(156);d.pointer(d.roots['map_head']+8,groups)
        root=d.joint();d.pointer(groups+104,root)
        previous=None
        for i in range(10):
            child=d.joint(i*10,40)
            d.pointer(previous+12 if previous is not None else root+8,child);previous=child
        art=Art();art.solid(-50,-10,100,10);art.collisions(d)
        art.mechanisms=[ride('Lift',-12,22,40,dy=60),dict(ride('Pad',20,5,20),kind='fire'),
                        dict(ride('Gate',60,80,18,dy=70),kind='gate',height=60)]
        art.target_cycles=[];art.pits=[]
        with patch('world_mechanics.moving_mesh',return_value=None):build_mechanics(d,art)
        self.assertEqual(d.u(d.roots['yakumono_param']+12),0)  # Moving gate is safe contact.
        self.assertNotEqual(d.u(d.roots['yakumono_param']+8),0)
        # mpLib_800552B0 starts at the wrapper's child: our archive root is 0.
        nodes=[root];node=d.u(root+8)
        while node:nodes.append(node);node=d.u(node+12)
        links=d.u(groups+104+32)
        for i,m in enumerate(art.mechanisms):
            group,model,index=struct.unpack_from('>3h',d.data,links+6*i)
            self.assertEqual((group,model),(i+1,2))
            self.assertEqual(struct.unpack_from('>2f',d.data,nodes[index]+0x2c),(m['x'],m['y']))

    def test_vine_grip_is_grabbable_and_has_no_contact_damage(self):
        from world_gameplay import swing_vine
        d=archive();d.roots['map_head']=d.alloc(48);d.roots['yakumono_param']=d.alloc(44)
        groups=d.alloc(156);d.pointer(d.roots['map_head']+8,groups)
        root=d.joint();d.pointer(groups+104,root);previous=None
        for i in range(10):
            child=d.joint(i*10,40)
            d.pointer(previous+12 if previous is not None else root+8,child);previous=child
        art=Art();art.solid(-50,-10,100,10);art.collisions(d)
        art.mechanisms=[swing_vine()];art.target_cycles=[];art.pits=[]
        with patch('world_mechanics.moving_mesh',return_value=None):build_mechanics(d,art)
        self.assertEqual(d.u(d.roots['yakumono_param']+4),0)
        c=d.roots['coll_data'];island=d.u(c+36)+40
        first,count=struct.unpack_from('>2h',d.data,island)
        self.assertEqual(count,1)
        line=struct.unpack_from('>6hHBB',d.data,d.u(c+8)+first*16)
        self.assertEqual((line[6],line[7]),(1,2)) # floor, native ledge-grab bit
        v=d.u(c)+8*line[0]
        self.assertEqual(struct.unpack_from('>2f',d.data,v),(-5,-134))

    def test_all_courses_have_safe_spawn_and_clear_target_cycles(self):
        for i,spec in enumerate(WORLDS):
            with self.subTest(character=spec[0]):
                art=(Mansion(spec,i) if spec[2]=='Lg' else WorldArt(spec,i)).build()
                apply_routes(art);validate_art(art);apply_mechanics(art)
                if not getattr(art,'native_fire',False):
                    # Painted holes must never be hidden by stretched sky quads.
                    self.assertIsNone(pit_mesh(None,art))
                self.assertEqual(len(art.target_cycles),len(TARGET_PATTERNS[art.suffix]))
                self.assertEqual(len({c['target'] for c in art.target_cycles}),len(art.target_cycles))
                self.assertTrue(any(x<=art.spawn[0]<=x+w and abs(y+h+2-art.spawn[1])<.01
                                    for x,y,w,h,_ in art.solids) or
                    any(x<=art.spawn[0]<=x+w and abs(y+2-art.spawn[1])<.01 for x,y,w,_ in art.platforms))
                for p in art.pits:
                    self.assertFalse(any(x<p['right']-1e-8 and x+w>p['left']+1e-8 and y<p['top'] and y+h>=p['top']
                                         for x,y,w,h,_ in art.solids))
                for m in art.mechanisms:
                    if m['kind']!='platform' or m['angle']:continue
                    xs,ys=keyframes(m,'x'),keyframes(m,'y')
                    points=[(x,y) for (_,x),(_,y) in zip(xs,ys)]
                    samples=[(x+(xx-x)*k/16,y+(yy-y)*k/16)
                             for (x,y),(xx,yy) in zip(points,points[1:]) for k in range(17)]
                    for x,y in samples:
                        self.assertFalse(any(sx<x+m['width'] and sx+w>x and sy<y and sy+h>y-7
                                             for sx,sy,w,h,_ in art.solids),m['name'])

    def test_moving_island_ranges_do_not_steal_static_collision_lines(self):
        art=Art();art.solid(-50,-10,100,10);art.platform_surface(-25,35,50)
        art.mechanisms=[dict(kind='platform',width=20),dict(kind='bumper',width=22)]
        d=archive();art.collisions(d);append_collisions(d,art)
        c=d.roots['coll_data'];lp=d.u(c+8);gp=d.u(c+36);vp=d.u(c)
        count=d.u(c+12);seen=[]
        lines=[struct.unpack_from('>6hHBB',d.data,lp+i*16) for i in range(count)]
        self.assertEqual(d.u(c+40),3)
        for g in range(3):
            start,n=struct.unpack_from('>2h',d.data,gp+g*40+36)
            ranges=struct.unpack_from('>10h',d.data,gp+g*40)
            for j,flag in enumerate([1,2,4,8,16]):
                first,amount=ranges[j*2:j*2+2]
                for index in range(first,first+amount):
                    line=lines[index];seen.append(index)
                    self.assertEqual(line[6],flag)
                    self.assertTrue(start<=line[0]<start+n and start<=line[1]<start+n)
                    for neighbour in line[2:4]:
                        if neighbour!=-1:self.assertTrue(start<=lines[neighbour][0]<start+n)
        self.assertEqual(sorted(seen),list(range(count)))

    def test_resizing_scales_static_collision_once_and_keeps_moving_vertices_local(self):
        d=archive();d.roots['map_head']=d.alloc(48);d.roots['yakumono_param']=d.alloc(44)
        groups=d.alloc(156);d.pointer(d.roots['map_head']+8,groups)
        camera=d.joint();anchor=d.joint(100,200);d.pointer(camera+8,anchor);d.pointer(groups,camera)
        model=d.joint();d.pointer(groups+104,model)
        art=Art();art.solid(-50,-10,100,10);art.collisions(d)
        art.mechanisms=[dict(kind='platform',width=20)];append_collisions(d,art)
        art.world_scale=.7;scale_archive(d,art)
        self.assertAlmostEqual(struct.unpack_from('>f',d.data,model+32)[0],.7)
        self.assertEqual(struct.unpack_from('>2f',d.data,anchor+44),(70,140))
        c=d.roots['coll_data'];vp=d.u(c);gp=d.u(c+36)
        start,count=struct.unpack_from('>2h',d.data,gp+36)
        vertices=[struct.unpack_from('>2f',d.data,vp+8*i) for i in range(start,start+count)]
        self.assertEqual(min(x for x,y in vertices),-35)
        self.assertEqual(max(x for x,y in vertices),35)
        moving_start,_=struct.unpack_from('>2h',d.data,gp+40+36)
        self.assertEqual(struct.unpack_from('>2f',d.data,vp+8*(moving_start+1)),(20,0))

    def test_visibility_tracks_switch_without_fading_and_repeat(self):
        d=archive();m=ride('Light',0,40,30,period=240,blink=[(0,1),(130,0),(240,1)])
        node=animation(d,m);obj=d.u(node+8);fobj=d.u(obj+8)
        self.assertEqual(d.data[fobj+12],11)
        self.assertEqual(d.data[d.u(fobj+16)]&15,1)
        self.assertEqual(struct.unpack_from('>f',d.data,obj+4)[0],240)

    def test_three_room_cycle_preserves_independent_dwell_times(self):
        keys=target_keys(dict(pattern='rooms',period=540,places=[(130,-10),(180,54)],dwell=[180,150,210]),-119,248)
        self.assertEqual(keys,[(0,-119,248),(180,11,238),(330,61,302),(540,-119,248)])

    def test_linear_and_teleport_packets_preserve_exact_values_and_intervals(self):
        for mode in (1,2):
            d=archive();p=track(d,5,[(0,-12.5),(180,23.25),(360,-12.5)],mode)
            n=d.u(p+4);buf=bytes(d.data[d.u(p+16):d.u(p+16)+n]);self.assertEqual(buf[0],32|mode)
            self.assertEqual(struct.unpack_from('<f',buf,1)[0],-12.5)
            self.assertEqual(buf[5:7],bytes([180|128,1]))
            self.assertEqual(struct.unpack_from('<f',buf,7)[0],23.25)


if __name__=='__main__':unittest.main()
