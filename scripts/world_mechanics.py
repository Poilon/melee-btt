"""Native, deterministic stage mechanisms. No companion frame loop.

HSD AObj tracks drive the model joints; Ground_UpdateMapColl transforms their
collision groups and Melee carries grounded fighters with them. Contact hazards
use the ordinary ftCo_800C0B20 stage-damage path, including its hit cooldown.
"""
import math
import struct
from build_grassland import Art
from stage_texture import texture_scene, MANOR_ASSETS


from world_gameplay import ride, RIDES, PITS, HAZARDS, BUMPERS, TARGET_PATTERNS, IDENTITIES

# Required encounters near the new mechanisms, not just optional decoration.
MECHANISM_TARGETS={
 'Ms':(8,16,28,'catch the low target over the moat while the drawbridge is down'),
 'Fc':(4,20,153,'attack above the bumper without touching its upper rim'),
 'Lg':(6,-119,248,'ride the dumbwaiter into the gap between storeys'),
 'Ca':(1,10,36,'cross the broken track on the pit-lane shuttle'),
 'Fe':(4,15,57,'time the siege bridge crossing before it rises'),
}


def clip_polygon(poly,left,right):
    for edge,sign in [(left,1),(right,-1)]:
        result=[]
        for a,b in zip(poly,poly[1:]+poly[:1]):
            ai=(a[0]-edge)*sign>=0;bi=(b[0]-edge)*sign>=0
            if ai:result.append(a)
            if ai!=bi:
                t=(edge-a[0])/(b[0]-a[0]);result.append((edge,a[1]+t*(b[1]-a[1])))
        poly=result
    return poly


def apply_mechanics(art):
    """Keep the calibrated base art intact; add authored mechanisms on top."""
    from copy import deepcopy
    from world_challenge import apply_trials
    apply_trials(art)
    art.mechanisms=deepcopy(RIDES[art.suffix]);art.pits=[]
    base=art.solids[0] if art.solids else (0,0,0,0,4)
    bx,by,bw,bh,mat=base;floor=by+bh
    if art.suffix in PITS:
        holes=PITS[art.suffix]
        if not getattr(art,'native_fire',False):
            import json
            painted=json.loads((art.world_assets/'scene.json').read_text()).get('paintedPits')
            if painted!=[list(hole) for hole in holes]:
                raise ValueError('Pit collision needs matching painted openings: '+art.suffix)
        contours=getattr(art,'solid_contours',{})
        poly=contours.get(0,[(bx,floor),(bx+bw,floor),(bx+bw,by),(bx,by)])
        segments=[];last=bx
        for left,right in holes:
            if not last<=left<right<bx+bw:raise ValueError('Pit outside foundation or overlapping')
            if left-15<art.spawn[0]<right+15:raise ValueError('Pit overlaps spawn')
            if any(sx<right and sx+w>left and sy<floor+.1 and sy+h>floor+5
                   for sx,sy,w,h,_ in art.solids[1:]):
                raise ValueError(f'{art.suffix}: pit would conceal a solid wall')
            if left>last:segments.append((last,left))
            last=right
            art.pits.append(dict(left=left,right=right,top=floor,bottom=art.bounds[3]-75,name='Open shaft'))
        segments.append((last,bx+bw));n=len(segments)
        art.solids=[(l,by,r-l,bh,mat) for l,r in segments]+art.solids[1:]
        art.solid_contours={**{i:clip_polygon(poly,l,r) for i,(l,r) in enumerate(segments)},
                            **{i+n-1:c for i,c in contours.items() if i}}
    if art.suffix=='Kp':
        # The native lava contact sits on the existing painting's molten surface.
        # Positive knockback growth makes repeated contacts progressively lethal.
        art.mechanisms.append(dict(kind='lava',name='Lava lake',x=-310,y=240-775/930*340,width=620,
            dx=0,dy=0,period=300,hold=0,angle=0,orbit=False,depth=155/930*340,
            sourcePixels=[0,775,1691,930],damage=40,growth=150,baseKnockback=120))
    for m in art.mechanisms:
        if m['angle'] and not m.get('keepAnchor'):m['y']=floor+6
    for hazard in HAZARDS.get(art.suffix,[]):
        kind,x,width,*extra=hazard
        # Some worlds have foreground structures on the foundation. Use only
        # an exposed section, rather than hiding a hazard inside a solid wall.
        if any(sx<x+width and sx+w>x and sy+h>floor+5 for sx,sy,w,h,_ in art.solids[1:]):
            raise ValueError(f'{art.suffix}: hazard intersects solid at {x}')
        art.mechanisms.append(dict(kind=kind,name={'fire':'Flame grate','electric':'Live contact','spring':'Spring bumper'}[kind],
             x=x,y=floor+5,width=width,dx=0,dy=0,period=240,hold=0,angle=0,orbit=False))
        if extra:art.mechanisms[-1]['blink']=extra[0]
    for x,y,width in BUMPERS.get(art.suffix,[]):
        # Mount the original bumper flush with the painted tread, not halfway
        # inside it. The small Yoshi bumper remains suspended over the chasm.
        if art.suffix=='Dk':y=art.authored_surfaces[5][2]+width
        elif art.suffix=='Ys':y=art.authored_surfaces[1][2]+width
        art.mechanisms.append(dict(kind='bumper',name='Falco-type bumper',x=x,y=y,width=width,
                                  dx=0,dy=0,period=240,hold=0,angle=0,orbit=False))
    if art.suffix=='Dr':
        from doc_chemicals import configure
        configure(art)
    if art.suffix in ('Mr','Lg','Kp'):
        from stage_entities import configure
        configure(art)
    if art.suffix in ('Gn','Fx','Fc','Lk','Cl'):
        from adventure_mechanisms import configure
        configure(art)
    from roster_mechanisms import configure as configure_roster
    configure_roster(art)
    art.gameplay_identity=IDENTITIES[art.suffix]
    # The static route audit precedes modifications. Never label it a proof of
    # the moving course. Check spawn and target safety against the new terrain.
    art.access_audit={'baseRoute':art.access_audit,'dynamicCourse':True,
                     'validation':'Static route plus native mechanism probes; full human clears pending'}
    if art.suffix in MECHANISM_TARGETS:
        index,x,y,hint=MECHANISM_TARGETS[art.suffix]
        from character_routes import unobstructed
        if not unobstructed(art,x,y):raise ValueError('Mechanism target intersects scenery: '+art.suffix)
        art.targets[index]=(x,y)
        art.route_notes[index].update(position=(x,y),setup='mechanism',hint=hint)
    for pit in art.pits:
        if any(pit['left']<x<pit['right'] and y<pit['top']+8 for x,y in art.targets):
            raise ValueError('A target is below an open shaft lip')
    from character_encounters import apply_encounters
    apply_encounters(art)
    from world_props import configure_props
    configure_props(art)
    configure_targets(art)
    from world_challenge import validate_scaled_clearance
    validate_scaled_clearance(art)
    from modular_stage import configure
    configure(art)
    return art


def target_keys(cycle,x,y):
    p=cycle['period'];pattern=cycle['pattern']
    if pattern=='rooms':
        if len(cycle['dwell'])!=len(cycle['places'])+1:raise ValueError('Invalid room timing')
        keys=[(0,x,y)];frame=0
        for (dx,dy),dwell in zip(cycle['places'],cycle['dwell']):
            frame+=dwell;keys.append((frame,x+dx,y+dy))
        return keys+[(p,x,y)]
    dx,dy=cycle['dx'],cycle['dy']
    if pattern=='patrol':return [(0,x,y),(p//2,x+dx,y+dy),(p,x,y)]
    keys=[]
    for i in range(33):
        phase=i/32;u=1-abs(2*phase-1)
        if pattern=='orbit':px=x+dx*(.5-.5*math.cos(2*math.pi*phase));py=y+dy*math.sin(2*math.pi*phase)
        elif pattern=='arc':px=x+dx*u;py=y+4*dy*u*(1-u)
        else:raise ValueError('Unknown target trajectory')
        keys.append((round(phase*p),px,py))
    return keys


def configure_targets(art):
    from character_routes import unobstructed
    from copy import deepcopy
    art.target_cycles=[]
    for cycle in deepcopy(TARGET_PATTERNS[art.suffix]):
        index=cycle['target'];x,y=art.targets[index]
        cycle.update(x=x,y=y,keys=target_keys(cycle,x,y))
        points=[(x,y) for _,x,y in cycle['keys']]
        if cycle['kind']=='moving':
            points=[(x+(xx-x)*i/32,y+(yy-y)*i/32)
                    for (x,y),(xx,yy) in zip(points,points[1:]) for i in range(33)]
        for px,py in points:
            if not unobstructed(art,px,py):
                raise ValueError(f'{art.suffix}: {cycle["kind"]} target {index+1} crosses scenery at {px,py}')
            if any(math.hypot(px-ox,py-oy)<12 for j,(ox,oy) in enumerate(art.targets) if j!=index):
                raise ValueError(f'{art.suffix}: {cycle["kind"]} target {index+1} crosses another target at {px,py}')
        art.target_cycles.append(cycle)


def target_animation(d,cycle):
    a=d.alloc(20);tracks=[];p=cycle['period']
    for kind,axis in [(5,1),(6,2)]:
        keys=[(k[0],k[axis]) for k in cycle['keys']]
        if all(v==keys[0][1] for _,v in keys):continue
        tracks.append(track(d,kind,keys,interpolation=1 if cycle['kind']=='teleport' else 2))
    if tracks:
        for x,y in zip(tracks,tracks[1:]):d.pointer(x,y)
        obj=d.alloc(16);d.put(obj,'If',0x20000000,p);d.pointer(obj+8,tracks[0]);d.pointer(a+8,obj)
    return a


def packed(value):
    out=bytearray()
    while value>127:out.append((value&127)|128);value>>=7
    out.append(value);return out


def track(d,kind,keys,interpolation=2):
    """HSD linear key packet; values are little-endian even in a BE archive."""
    data=packed(((len(keys)-1)<<4)|interpolation)
    for i,(frame,value) in enumerate(keys):
        data+=struct.pack('<f',value)+packed(keys[i+1][0]-frame if i+1<len(keys) else 0)
    p=d.alloc(20);d.put(p+4,'If4B',len(data),0,kind,0,0,0);d.pointer(p+16,d.buffer(data))
    return p


def keyframes(m,axis):
    if axis+'Keys' in m:return m[axis+'Keys']
    period=m['period'];hold=m['hold'];base=m[axis]
    delta=m['d'+axis]
    if m.get('orbit'):
        return [(round(i*period/32),base+delta*(.5-.5*math.cos(2*math.pi*i/32) if axis=='x'
                    else .5*math.sin(2*math.pi*i/32))) for i in range(33)]
    return [(0,base),(hold,base),(period//2-hold,base+delta),
            (period//2+hold,base+delta),(period-hold,base),(period,base)]


def animation(d,m):
    a=d.alloc(20);tracks=[]
    for kind,axis in [(5,'x'),(6,'y')]:
        if m['d'+axis] or ((m.get('nativeProp') or m.get('editorMotion')) and axis+'Keys' in m):tracks.append(track(d,kind,keyframes(m,axis),interpolation=1 if m.get('editorMotion')=='teleport' else 2))
    for kind,key in [(8,'scaleX'),(9,'scaleY')]:
        if key in m:tracks.append(track(d,kind,m[key]))
    if m.get('blink'):tracks.append(track(d,11,m['blink'],interpolation=1))
    if m['angle']:
        p=m['period'];h=m['hold'];angle=math.radians(m['angle'])
        tracks.append(track(d,3,m.get('angleKeys',[(0,0),(h,0),(p//2,angle),(p//2+h,angle),(p,0)])))
    if tracks:
        for x,y in zip(tracks,tracks[1:]):d.pointer(x,y)
        obj=d.alloc(16);d.put(obj,'If',0x20000000,m['period']);d.pointer(obj+8,tracks[0]);d.pointer(a+8,obj)
    return a


def colour_mesh(d,art):
    # Draw in the same plane as the bitmap, without occluding fighter limbs.
    obj=Art.model(art,d);material=d.u(obj+8)
    d.pointer(material+20,d.buffer(bytes([0x19,0,0,0,0,4,5,15,3,7,0,7])))
    return obj


def moving_mesh(d,art,m):
    if m.get('editorBoost'):
        from types import SimpleNamespace
        from pathlib import Path
        from doc_chemicals import sprite_mesh
        source=SimpleNamespace(world_assets=Path(__file__).resolve().parents[1]/'assets/custom-stages/worlds/Ca')
        w=m['width'];left=m['impulseX']<0
        return sprite_mesh(d,source,'boost',[w if left else 0,7,-w if left else w,7],manifest='props.json')
    if m.get('propSkin'):
        from world_props import prop_mesh
        return prop_mesh(d,art,m)
    if m.get('entity') or m.get('nativeProp'):
        return None  # Textured model/pose tree attaches under the collision anchor.
    if m.get('skin'):
        from doc_chemicals import sprite_mesh
        return sprite_mesh(d,art,m['skin'],m['rect'])
    if m['kind']=='trampoline':
        from character_fire import trampoline_mesh
        return trampoline_mesh(d,m)
    if m['kind']=='gate':return gate_mesh(d,art,m)
    if m['kind']=='lava':
        return texture_scene(d,directory=art.world_assets,background=False,copies=[dict(
            sourcePixels=m['sourcePixels'],surface=[0,0,m['width']],height=m['depth'])])
    if m['kind']!='platform':return hazard_mesh(d,art,m)
    import json
    directory=getattr(art,'world_assets',MANOR_ASSETS)
    scene=json.loads((directory/'scene.json').read_text())
    if art.suffix=='Lg':
        from modular_stage import painted_polygons,rect,BASIC
        return painted_polygons(d,BASIC/'manor-floor',[(rect(0,0,m['width'],-7),[0,0,64,-8],m['width'])])
    if art.suffix=='Mr':
        from modular_stage import painted_polygons,rect
        skin=next(p for p in art.piece_catalog if p['id']=='platform-0');l,t,r,b=skin['sourceRect']
        return painted_polygons(d,directory,[(rect(0,0,m['width'],-7),skin['sourceRect'],m['width'])])
    tracing=scene['collisionTracing'];iw,ih=tracing['size'];l,t,r,b=scene['bounds']
    px,pr,py=tracing['surfaces'][m['source']]
    depth=min(ih-py,7*ih/(t-b))
    return texture_scene(d,directory=directory,background=False,copies=[dict(
        sourcePixels=[px,py,pr,py+depth],surface=[0,0,m['width']],height=7)])


def gate_mesh(d,art,m):
    # Real pixels from each world's architecture, with no flat-colour proxy.
    # All crops lie inside the existing artwork's detailed stone/wood surfaces.
    regions={'Lk':[257,413,348,710], 'Ms':[1230,325,1292,525]}
    return texture_scene(d,directory=art.world_assets,background=False,copies=[dict(
        sourcePixels=regions[art.suffix],surface=[0,0,m['width']],height=m['height'])])


def hazard_mesh(d,art,m):
    a=Art();w=m['width'];kind=m['kind']
    if kind=='bumper':
        return retail_fox_bumper_mesh(d,w,m.get('variant','red' if w>23 else 'yellow'),m.get('height',w))
    import json
    directory=art.world_assets;scene=json.loads((directory/'scene.json').read_text())
    tracing=scene['collisionTracing'];iw,ih=tracing['size'];l,t,r,b=scene['bounds']
    if kind=='fire':
        # A recessed hot-metal vent cut from the scene's own lit industrial or
        # volcanic material. No cartoon triangle flames over painted scenery.
        region={'Kp':[766,184,934,218],'Ss':[659,416,845,443],'Fe':[718,213,828,238]}[art.suffix]
    else:
        # Match the existing hazard-striped metal landing, down to its bolts.
        source={'Fx':3,'Pk':2,'Pc':7}[art.suffix]
        px,pr,py=tracing['surfaces'][source]
        region=[px,py,pr,py+min(ih-py,7*ih/(t-b))]
    first=texture_scene(d,directory=directory,background=False,copies=[dict(
        sourcePixels=region,surface=[0,0,w],height=7)])
    # Small recessed indicator along the contact rail, not oversized spikes.
    a.rect(2,-2,w-4,.7,'#ff973d' if kind=='fire' else '#70edff',0)
    last=first
    while d.u(last+4):last=d.u(last+4)
    d.pointer(last+4,colour_mesh(d,a))
    return first


def retail_fox_bumper_mesh(d,width,variant='yellow',height=None):
    """Reuse the original Fox bumper's GX strip, colours and material from the ISO.

    The builder starts from the verified USA 1.02 Fox archive. Its original
    vertex pool remains present; compact only the referenced positions and
    map the 15-unit model onto this bumper's collision bounds.
    """
    height=width if height is None else height
    source={'yellow':0xa5f8,'red':0xaab8}[variant];oldp=d.u(source+12);olda=d.u(oldp+8)
    if struct.unpack_from('>IIIIBBHI',d.data,olda)!=(9,3,1,3,7,0,6,640):
        raise ValueError('Unexpected original Fox bumper vertex layout')
    start=d.u(oldp+16);units=struct.unpack_from('>H',d.data,oldp+14)[0]
    display=bytearray(d.data[start:start+units*32])
    if display[0]!=0x98:raise ValueError('Unexpected original bumper primitive')
    count=struct.unpack_from('>H',display,1)[0];indices={};positions=[]
    for i in range(count):
        offset=3+4*i;index=struct.unpack_from('>H',display,offset)[0]
        if index not in indices:
            x,y,z=struct.unpack_from('>3h',d.data,640+index*6)
            indices[index]=len(positions)
            # Collapse each original rounded perimeter arc to a hard corner.
            # Keep the inner face, vertex colours and red/yellow visibility tracks.
            px,py=x/128,y/128
            if abs(px)>5.625 or abs(py)>5.625:
                px,py=math.copysign(7.5,px),math.copysign(7.5,py)
            positions.append(((px+7.5)*width/15,(py-7.5)*height/15,z/128*width/15))
        struct.pack_into('>H',display,offset,indices[index])
    attrs=d.buffer(bytes(d.data[olda:olda+72]))
    d.put(attrs+12,'IBB H',4,0,0,12)
    d.pointer(attrs+20,d.buffer(b''.join(struct.pack('>3f',*v) for v in positions),32))
    p=d.buffer(bytes(d.data[oldp:oldp+24]));d.pointer(p+4,None)
    d.pointer(p+8,attrs);d.pointer(p+16,d.buffer(display,32));d.pointer(p+20,None)
    oldm=d.u(source+8);material=d.buffer(bytes(d.data[oldm:oldm+24]))
    d.pointer(material+12,d.u(oldm+12))
    d.pointer(material+20,d.buffer(bytes([0x19,0,0,0,0,4,5,15,3,7,0,7])))
    obj=d.alloc(16);d.pointer(obj+8,material);d.pointer(obj+12,p)
    return obj


def bumper_outline(w,h=None):
    h=w if h is None else h
    return [(0,0),(w,0),(w,-h),(0,-h)]


def is_retail_bumper(m):
    return m['kind']=='bumper' and not any(m.get(k) for k in ('entity','nativeProp','nativeAnimation','propSkin','skin','rollRadius'))


def attach_retail_bumper(d,anchor,anim,m):
    """Keep Fox's two alternating retail branches, independent of collision motion."""
    last_joint=last_anim=None
    for variant,source in [('yellow',0xbcf8),('red',0xc6a8)]:
        # Both meshes and their original 600-frame visibility streams survive
        # in the verified Fox template. Loop the original animation indefinitely.
        if d.data[d.u(source+8)+12]!=12:raise ValueError('Unexpected Fox bumper visibility track')
        obj=d.buffer(bytes(d.data[source:source+16]))
        d.put(obj,'I',0x20000000);d.pointer(obj+8,d.u(source+8))
        node=d.joint(dobj=retail_fox_bumper_mesh(d,m['width'],variant,m.get('height',m['width'])))
        a=d.alloc(20);d.pointer(a+8,obj)
        d.pointer(last_joint+12 if last_joint else anchor+8,node)
        d.pointer(last_anim+4 if last_anim else anim,a)
        last_joint,last_anim=node,a
    return 2


def pit_mesh(d,art):
    import json
    if hasattr(art,'piece_catalog') or not art.pits:return None
    a=Art()
    if getattr(art,'native_fire',False):
        from character_fire import SCREEN
        for p in art.pits:a.rect(p['left'],p['bottom'],p['right']-p['left'],p['top']-p['bottom'],SCREEN,0)
        return colour_mesh(d,a)
    # Painted courses already contain their openings. Never stretch or paste
    # an unrelated background rectangle over the physical foreground.
    return None


def append_collisions(d,art):
    """Reindex static + independently animated collision islands by direction."""
    c=d.roots['coll_data'];vp=d.u(c);lp=d.u(c+8)
    vertices=[struct.unpack_from('>2f',d.data,vp+i*8) for i in range(d.u(c+4))]
    lines=[list(struct.unpack_from('>6hHBB',d.data,lp+i*16))+[0,i] for i in range(d.u(c+12))]
    groups=[(0,len(vertices))]
    for index,m in enumerate(art.mechanisms,1):
        v=len(vertices);j=len(lines);w=m['width']
        if m['kind']=='decoration':
            vertices += [(0,0),(w,0)];groups.append((v,2));continue
        if m['kind'] in ('bumper','gate','vine'):
            poly=m.get('outline') or (bumper_outline(w,m.get('height',w)) if m['kind']=='bumper' else [(0,0),(w,0),(w,-m['height']),(0,-m['height'])])
            if is_retail_bumper(m) and not m.get('outline'):
                # A one-unit contact skin keeps wall-mounted bumpers reachable
                # despite sub-unit differences between artwork and wall edges.
                # The rectangular shape and editor placement stay intact.
                h=m.get('height',w)
                poly=[(x*(w+2)/w-1,y*(h+2)/h+1) for x,y in poly]
            vertices+=poly;count=len(poly)
            for i,(x,y) in enumerate(poly):
                xx,yy=poly[(i+1)%count];flag=(1 if xx>x else 2) if xx!=x else (4 if yy<y else 8)
                if 'collisionOrientation' in m:
                    # A left-aimed beam reverses floor/ceiling and wall sides.
                    # Choose flags in world orientation; AObj still owns motion.
                    a=m['collisionOrientation'];dx=xx-x;dy=yy-y
                    wx=dx*math.cos(a)-dy*math.sin(a);wy=dx*math.sin(a)+dy*math.cos(a)
                    flag=(1 if wx>0 else 2) if abs(wx)>=abs(wy) else (4 if wy<0 else 8)
                lines.append([v+i,v+(i+1)%count,j+(i-1)%count,j+(i+1)%count,-1,-1,flag,2 if m['kind']=='vine' and flag==1 else 0,5,index,j+i])
            groups.append((v,count))
        elif m.get('floorOutline'):
            poly=m['floorOutline'];vertices+=poly;count=len(poly)
            for i in range(count-1):
                lines.append([v+i,v+i+1,j+i-1 if i else -1,j+i+1 if i<count-2 else -1,-1,-1,1,1,4,index,j+i])
            groups.append((v,count))
        else:
            vertices += [(0,0),(w,0)]
            lines.append([v,v+1,-1,-1,-1,-1,1,1,m.get('material',4),index,j]);groups.append((v,2))
    lines.sort(key=lambda line:([1,2,4,8].index(line[6]),line[9]))
    remap={line[10]:i for i,line in enumerate(lines)}
    for line in lines:line[2]=remap.get(line[2],-1);line[3]=remap.get(line[3],-1)
    def ranges(group=None):
        out=[]
        for flag in [1,2,4,8,16]:
            indices=[i for i,line in enumerate(lines) if line[6]==flag and (group is None or line[9]==group)]
            out += [indices[0] if indices else 0,len(indices)]
        return out
    gp=d.alloc(40*len(groups))
    for i,(start,count) in enumerate(groups):
        vs=vertices[start:start+count];p=gp+40*i;d.put(p,'10h',*ranges(i))
        d.put(p+20,'4fhh',min(v[0] for v in vs),min(v[1] for v in vs),
              max(v[0] for v in vs),max(v[1] for v in vs),start,count)
    d.pointer(c,d.buffer(b''.join(struct.pack('>2f',*v) for v in vertices)))
    d.put(c+4,'I',len(vertices));d.pointer(c+8,d.buffer(b''.join(struct.pack('>6hHBB',*line[:9]) for line in lines)))
    d.put(c+12,'I',len(lines));d.put(c+16,'10h',*ranges());d.pointer(c+36,gp);d.put(c+40,'I',len(groups))


def build_mechanics(d,art):
    if not hasattr(art,'mechanisms'):return
    append_collisions(d,art)
    groups=d.u(d.roots['map_head']+8);g=groups+104;root=d.u(g)
    overlay=pit_mesh(d,art)
    if getattr(art,'chemical_mounts',None):
        from doc_chemicals import mount_mesh
        overlay=mount_mesh(d,art)
    if overlay:
        obj=d.u(root+16)
        while d.u(obj+4):obj=d.u(obj+4)
        d.pointer(obj+4,overlay)
    # The ten target anchor joints remain first (indices 0..9). AnimJoint trees
    # mirror JObj trees, including blank nodes, so tracks cannot shift a target.
    joint=d.u(root+8);aroot=d.alloc(20);previous=None
    for i in range(10):
        cycle=next((c for c in art.target_cycles if c['target']==i),None)
        a=target_animation(d,cycle) if cycle else d.alloc(20)
        if previous is None:d.pointer(aroot,a)
        else:d.pointer(previous+4,a)
        previous=a
        if i<9:joint=d.u(joint+12)
    links=d.alloc(6*len(art.mechanisms))
    # Fox's original yakumono parameter root has 44 bytes before ALDYakuAll.
    # Our callback indexes a bounded 11-entry descriptor table in this space.
    table=d.roots['yakumono_param']
    if len(art.mechanisms)>10:raise ValueError('Too many stage mechanism groups')
    for i in range(11):d.pointer(table+4*i,None)
    boosts=[m for m in art.mechanisms if m['kind']=='boost']
    if len(boosts)>8:raise ValueError('Too many boost zones')
    previous_config=None
    for m in boosts:
        s=art.world_scale
        # Independent latches and signed impulses, linked through relocated DAT
        # pointers. Slot zero is never a damage descriptor.
        config=d.buffer(struct.pack('>I5f3I',0x42535431,m['x']*s,(m['x']+m['width'])*s,
                                    (m['y']-2)*s,(m['y']+14)*s,m['impulseX'],0,0,0))
        d.pointer(previous_config+32 if previous_config is not None else table,config)
        previous_config=config
    if getattr(art,'wind',None):
        if boosts:raise ValueError('Wind and boost descriptors cannot share slot zero')
        w=art.wind;s=art.world_scale
        config=d.buffer(struct.pack('>I6f3I',0x574e4431,
            *(v*s for v in w['bounds']),w['speed'],0.,w['period'],w['start'],w['end']))
        d.pointer(table,config)
    native_index=11
    for index,m in enumerate(art.mechanisms):
        retail_bumper=is_retail_bumper(m)
        model=moving_mesh(d,art,m)
        node=d.joint(m['x'],m['y'],m.get('visualDepth',0),dobj=None if m.get('rollRadius') or retail_bumper else model);d.pointer(joint+12,node);joint=node
        anim=animation(d,m);d.pointer(previous+4,anim);previous=anim
        # Ground_GetStageGObj wraps the archive root in another JObj. Collision
        # traversal therefore sees the archive root at 0, targets at 1..10.
        d.put(links+6*index,'3h',index+1,2,native_index)
        native_index+=1
        if retail_bumper:
            native_index+=attach_retail_bumper(d,node,anim,m)
        elif m.get('rollRadius'):
            from world_props import attach_rolling
            native_index+=attach_rolling(d,node,anim,m,model)
        elif m.get('entity'):
            from retail_actors import attach
            native_index+=attach(d,node,anim,m)
        elif m.get('nativeAnimation')=='zapdos':
            from native_encounters import attach_zapdos
            native_index+=attach_zapdos(d,node,anim,m)
        elif m.get('nativeProp'):
            from native_props import attach
            native_index+=attach(d,node,anim,m)
        if m['kind'] not in ('platform','gate','vine','boost','decoration'):
            fire=m['kind'] in ('fire','lava');spring=m['kind'] in ('spring','trampoline')
            # state, damage, angle, growth, weight-set KB, base KB, element, SFX.
            # Bumper records exactly reproduce GrTFc.dat's four retail records.
            records=[]
            for angle in (90,270,0,180):
                values=(1,10,angle,100,150,0,2,1,7) if m['kind']=='bumper' else (
                    1,0 if m['kind']=='trampoline' else 1 if spring else 10,angle,0,0,140 if m['kind']=='trampoline' else 100 if spring else 65,0 if spring else 1 if fire else 2,1,0)
                if m.get('rollRadius'):
                    # Keep powerful lateral bumper hits, tilted slightly upward.
                    # Top/underside contacts never spike into the solid support.
                    values=((1,10,25 if angle==0 else 155,100,150,0,2,1,7)
                            if angle in (0,180) else (1,6,80,50,0,40,0,1,0))
                if 'damage' in m:values=(1,m['damage'],angle,m['growth'],0,m['baseKnockback'],m.get('element',1),1,0)
                records.append(struct.pack('>9I',*values))
            desc=d.buffer(b''.join(records))
            d.pointer(table+4*(index+1),desc)
    if getattr(art,'entity_occluders',None):
        if hasattr(art,'piece_catalog'):
            from modular_stage import actor_occluders
            model=actor_occluders(d,art)
        else:model=texture_scene(d,directory=art.world_assets,background=False,copies=art.entity_occluders)
        # Restore the pipe's own depth as well as its pixels over the retracted
        # model. Otherwise invisible head geometry would mask the fighter.
        obj=model
        while obj:
            material=d.u(obj+8)
            d.pointer(material+20,d.buffer(bytes([0x39,0,0,0,0,4,5,15,7,7,0,7])))
            obj=d.u(obj+4)
        if model:d.pointer(joint+12,d.joint(dobj=model))
    anims=d.alloc(8);d.pointer(anims,aroot);d.pointer(g+4,anims)
    d.pointer(g+32,links);d.put(g+36,'I',len(art.mechanisms))
    if any(m.get('opensTarget') is not None for m in art.mechanisms):
        from world_chest import install
        install(d,art)


def patch_hazard_callback(data,offset):
    """Replace Fox's contact descriptor selector inside its own 0xAC-byte body.

    mpJointFromLine validates the native line. The original callback only looked
    at joint 1; this one selects our per-island descriptor (NULL for safe floors).
    No new DOL section, external code cave, Gecko allocation or runtime writer.
    """
    address=0x80220e5c;p=offset(address)
    if struct.unpack_from('>I',data,p)[0]!=0x7c0802a6:raise ValueError('Unexpected Fox contact callback')
    # Compiled from scripts/native/world-contact.s at 0x80220E5C.
    words=[0x9421ffe0, 0x7c0802a6, 0x90010024, 0x90610008, 0x2c03ffff, 0x41820074, 0x4be35cf9, 0x3c80804a, 0x8084e750, 0x3884ffd3, 0x28040001, 0x41810008, 0x3863fff8, 0x28030001, 0x41800050, 0x2803000a, 0x41810048, 0x5464103a, 0x3ca0804a, 0x80a5ed88, 0x2c050000, 0x41820034, 0x7ca5202e, 0x2c050000, 0x41820028, 0x90a1000c, 0x80610008, 0x4be33da5, 0x7c630034, 0x2063001f, 0x1c630024, 0x80a1000c, 0x7c651a14, 0x48000008, 0x38600000, 0x80010024, 0x7c0803a6, 0x38210020, 0x4e800020]
    data[p:p+len(words)*4]=struct.pack('>'+str(len(words))+'I',*words)


def patch_boost_callback(data,offset):
    """Replace the unused old Captain target module; no heap/code-handler cave.

    Every Target Test StageData now points to the common Fox initializer. None
    references this retired module. The stage-0 proc reads only BST1 metadata.
    """
    p=offset(0x8021fc64)
    if struct.unpack_from('>I',data,p)[0]!=0x7c0802a6:raise ValueError('Unexpected Captain module')
    words=[0x3c80804a, 0x8084ed88, 0x2c040000, 0x4d820020, 0x80840000, 0x2c040000, 0x4d820020, 0x39000000, 0x80a40000, 0x3cc04253, 0x60c65431, 0x7c053000, 0x4c820020, 0x3ca08045, 0x80a53130, 0x2c050000, 0x41820098, 0x80a5002c, 0x2c050000, 0x4182008c, 0x80c50010, 0x2806000e, 0x41800080, 0x2806004a, 0x41810078, 0xc00500b0, 0xc0240004, 0xfc000840, 0x41800068, 0xc0240008, 0xfc000840, 0x4181005c, 0xc00500b4, 0xc024000c, 0xfc000840, 0x4180004c, 0xc0240010, 0xfc000840, 0x41810040, 0x80c500e0, 0x2c060000, 0x4082003c, 0x80c40018, 0x2c060000, 0x40820030, 0x38c00001, 0x90c40018, 0xc0040014, 0xd005008c, 0xd00500f0, 0x80c4001c, 0x38c60001, 0x90c4001c, 0x4800000c, 0x38c00000, 0x90c40018, 0x80840020, 0x2c040000, 0x4d820020, 0x39080001, 0x28080008, 0x4c800020, 0x4bffff28]
    if len(words)*4>0x2d0:raise ValueError('Boost code exceeds retired module')
    data[p:p+len(words)*4]=struct.pack('>'+str(len(words))+'I',*words)
    callback=offset(0x803e89e0)
    if struct.unpack_from('>I',data,callback)[0]!=0x80220d48:raise ValueError('Unexpected group-0 proc')
    struct.pack_into('>I',data,callback,0x8021fc64)
