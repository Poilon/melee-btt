"""Complete alpha-textured moving props, attached to native collision joints."""
import json

# Atlas cell references are authoring inputs; runtime loads only encoded RGBA8.
PROPS = {
 'Ca': ('technology', 0), 'Cl': ('nature', 0), 'Dk': ('nature', 0),
 'Fc': ('technology', 1), 'Fx': ('technology', 1), 'Ic': ('nature', 1), 'Kb': ('nature', 2),
 'Lk': ('castle', 4), 'Ms': ('castle', 0), 'Mt': ('technology', 2),
 'Ns': ('nature', 5), 'Pe': ('nature', 3), 'Pc': ('technology', 3),
 'Pk': ('technology', 4), 'Ss': ('technology', 5), 'Sk': ('castle', 2),
 'Ys': ('nature', 4), 'Zd': ('castle', 3), 'Fe': ('castle', 1),
 'Gn': ('castle', 2),
}
HAZARD_PROPS={'Ys':'thorn pod','Dk':'impact barrel','Fc':'wall piston','Ca':'speed boost'}


def configure_props(art):
    if art.suffix not in PROPS and art.suffix not in HAZARD_PROPS: return
    manifest = json.loads((art.world_assets/'props.json').read_text())
    for m in art.mechanisms:
        if m.get('entity') or m.get('nativeProp'):continue
        if art.suffix=='Ca' and m['kind']=='bumper':
            floor=art.authored_surfaces[0][2];w=46
            m.update(kind='boost',name='Rightward speed boost',x=art.pits[0]['left']-w-14,y=floor,
                     width=w,propSkin='boost',propRect=[0,7,w,7],impulseX=5.8,damage=0,
                     textureSource=manifest['sprites']['boost']['sourceAtlas'])
            continue
        if m['kind']!='bumper' or art.suffix not in HAZARD_PROPS:continue
        spec=manifest['sprites']['hazard'];w=m['width'];h=w*spec['aspect']
        m.update(propSkin='hazard',propRect=[0,0,w,h],height=h,
                 textureSource=spec['sourceAtlas'],name=HAZARD_PROPS[art.suffix])
        if art.suffix in ('Ys','Dk'):
            support=1 if art.suffix=='Ys' else 5
            l,r,top=art.authored_surfaces[support]
            m.update(x=r-w-1 if art.suffix=='Ys' else l+3,y=top+h,mountSurface=support)
            # Closed octagon follows the textured pod/barrel silhouette.
            m['outline']=[(.3*w,0),(.7*w,0),(w,-.3*h),(w,-.7*h),
                          (.7*w,-h),(.3*w,-h),(0,-.7*h),(0,-.3*h)]
            if art.suffix=='Dk':
                # The stationary barrel advertises its upper contact with a
                # steel spike; keep its body and supporting ledge unchanged.
                m['topSpike']={'width':w*.26,'height':w*.28}
                cx=w/2;half=m['topSpike']['width']/2
                m['outline'][1:1]=[(cx-half,0),(cx,m['topSpike']['height']),(cx+half,0)]
        else:
            l,r,top=art.authored_surfaces[1]
            # Mounting plate touches the west facade; the rubber head faces
            # the climbing lane, requiring a wide return around the building.
            m.update(x=l-w,y=top-24,mountSurface=1)
            m['propRect']=[w,0,-w,h] # mirror the right-facing source piston
            m['outline']=[(.05*w,-.15*h),(.72*w,0),(w,0),(w,-h),
                          (.72*w,-h),(.05*w,-.85*h),(0,-.65*h),(0,-.35*h)]
    if art.suffix=='Ca':
        from world_gameplay import ride
        # East upper overpass, aimed back across the central gap. Mirroring the
        # native quad reuses the original complete textured arrow without a
        # second raster edit or inverted lettering.
        top=art.authored_surfaces[2][2];w=46
        m=ride('Upper leftward speed boost',139,top,w)
        m.update(kind='boost',propSkin='boost',propRect=[w,7,-w,7],impulseX=-5.8,
                 damage=0,textureSource=manifest['sprites']['boost']['sourceAtlas'])
        art.mechanisms.append(m)
    if art.suffix=='Gn':
        from world_gameplay import ride
        floor=art.authored_surfaces[6][2];h=88;w=h/manifest['sprites']['crusher']['aspect']
        m=ride('Crushing royal seal',-w/2,floor+h+55,w,dy=-55,period=420,hold=0)
        m.update(kind='bumper',height=h,propSkin='crusher',propRect=[0,0,w,h],
                 damage=18,growth=110,baseKnockback=65,element=0,
                 textureSource=manifest['sprites']['crusher']['sourceAtlas'],
                 yKeys=[(0,floor+h+55),(150,floor+h+55),(165,floor+h),(230,floor+h),
                        (300,floor+h+55),(420,floor+h+55)],
                 outline=[(.44*w,0),(.56*w,0),(.8*w,-.16*h),(.8*w,-.68*h),
                          (w,-.76*h),(.8*w,-.87*h),(.5*w,-h),(.2*w,-.87*h),
                          (0,-.76*h),(.2*w,-.68*h),(.2*w,-.16*h)])
        art.mechanisms.append(m)
    if art.suffix=='Dk':
        from world_gameplay import ride
        # A native ledge on the bottom knot: CliffCatch follows the same rotated
        # collision island as the textured vine. Top pivot stays in the canopy.
        m=next(m for m in art.mechanisms if m['kind']=='vine')
        m.update(propSkin='vine',propRect=[-14,0,28,166],
                 textureSource=manifest['sprites']['vine']['sourceAtlas'])
        for name,skin,x,y,w,dx,period,support in [
            ('Traversing cargo barrel','hazard',-37,art.authored_surfaces[2][2],18,58,270,2),
            ('Eastern thorn pod','thorn',220,art.authored_surfaces[3][2],16,0,360,3)]:
            spec=manifest['sprites'][skin];h=w*spec['aspect']
            b=ride(name,x,y+h,w,dx=dx,period=period,hold=30)
            b.update(kind='bumper',height=h,propSkin=skin,propRect=[0,0,w,h],mountSurface=support,
                     textureSource=spec['sourceAtlas'],outline=[(.3*w,0),(.7*w,0),(w,-.3*h),
                      (w,-.7*h),(.7*w,-h),(.3*w,-h),(0,-.7*h),(0,-.3*h)])
            if skin=='hazard':b['rollRadius']=h/2
            art.mechanisms.append(b)
        art.route_notes[6]['hint']='Drop off the trunk, hit the side target, catch the moving vine knot and jump towards the eastern branch.'
    for m in art.mechanisms:
        if m['kind'] not in ('platform','gate') or m.get('entity') or m.get('nativeProp') or m.get('skin'): continue
        skin = 'gate' if m['kind']=='gate' else 'deck'
        spec = manifest['sprites'][skin]
        width = m['width']
        height = m['height'] if m['kind']=='gate' else width*spec['aspect']
        # A measured walking row, not the PNG's padded top, meets collision y=0.
        top = spec.get('walkingInset',0)*height if m['kind']=='platform' else 0
        m.update(propSkin=skin, propRect=[0,top,width,height],
                 textureSource=spec['sourceAtlas'])


def prop_mesh(d,art,m):
    from doc_chemicals import sprite_mesh
    obj=sprite_mesh(d,art,m['propSkin'],m['propRect'],manifest='props.json')
    if m.get('topSpike'):attach_spike_mesh(d,obj,m)
    return obj


def rolling_keys(m):
    """Roll by travelled horizontal distance; collision stays on its own anchor."""
    from world_mechanics import keyframes
    if m.get('editorMotion')=='teleport':return [(0,0),(m['period'],0)]
    return [(f,-(x-m['x'])/m['rollRadius']) for f,x in keyframes(m,'x')]


def attach_rolling(d,anchor,anim,m,model):
    from world_mechanics import track
    from retail_actors import aobj
    w,h=m['width'],m['height']
    pivot=d.joint(w/2,-h/2);visual=d.joint(-w/2,h/2,dobj=model)
    d.pointer(anchor+8,pivot);d.pointer(pivot+8,visual)
    pivot_anim=d.alloc(20);visual_anim=d.alloc(20)
    d.pointer(anim,pivot_anim);d.pointer(pivot_anim,visual_anim)
    aobj(d,pivot_anim,[track(d,3,rolling_keys(m))],m['period'])
    return 2


def attach_spike_mesh(d,body,m):
    """Metal facets reuse the barrel hoop's real texels, not a flat triangle."""
    import struct
    cx=m['width']/2;half=m['topSpike']['width']/2;h=m['topSpike']['height']
    # Local XY and UV pixel coordinates on the 256x232 barrel texture.
    tip=(cx,h);left=(cx-half,0);centre=(cx,-.4);right=(cx+half,0)
    triangles=[
        [(left,(90,78)),(centre,(96,84)),(tip,(96,75))],
        [(centre,(89,47)),(right,(98,44)),(tip,(106,29))],
        [((cx-half-.5,-.6),(82,96)),((cx+half+.5,-.6),(88,96)),((cx+half+.5,.3),(88,93))],
        [((cx-half-.5,-.6),(82,96)),((cx+half+.5,.3),(88,93)),((cx-half-.5,.3),(82,93))],
    ]
    display=bytearray(struct.pack('>BH',0x90,3*len(triangles)))
    for tri in triangles:
        for (x,y),(u,v) in tri:display+=struct.pack('>5f',x,y,.1,u/256,v/232)
    display+=bytes(-len(display)%32)
    pobj=d.alloc(24);d.pointer(pobj+8,d.u(d.u(body+12)+8));d.put(pobj+12,'HH',0,len(display)//32);d.pointer(pobj+16,d.buffer(display,32))
    obj=d.alloc(16);d.pointer(obj+8,d.u(body+8));d.pointer(obj+12,pobj);d.pointer(body+4,obj)
