"""Textured retail meshes and baked original-skeleton poses in native HSD.

Both instances share immutable mesh/texture buffers. Their JObj and animation
trees are independent. Collision anchors never inherit the cosmetic animation.
"""
import hashlib
import json
from pathlib import Path
import struct

ASSETS=Path(__file__).resolve().parents[1]/'assets/custom-stages/retail-actors'


CHEST_HINGE=(0., (27.310013-44.720444)/44.720444, -19.719976/50.472268)


def models(d,kind,part=None):
    if not hasattr(d,'retail_actors'):d.retail_actors={}
    key=(kind,part)
    if key in d.retail_actors:return d.retail_actors[key]
    folder=ASSETS/kind;manifest=json.loads((folder/'model.json').read_text())
    if manifest['format']!='TTRC_RETAIL_MESH_1':raise ValueError('Invalid retail mesh format')
    poses=[[] for _ in range(manifest['poses'])]
    for i,mesh in enumerate(manifest['meshes']):
        blobs={}
        for filename,digest in mesh['files'].items():
            if Path(filename).name!=filename:raise ValueError('Invalid mesh path')
            data=(folder/filename).read_bytes()
            if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Damaged retail actor: '+filename)
            blobs[filename]=data
        w,h=mesh['textureSize'];pixels=blobs[f'mesh-{i}.rgba8']
        if len(pixels)!=w*h*4:raise ValueError('Invalid retail texture length')
        im=d.alloc(24);d.pointer(im,d.buffer(pixels,32));d.put(im+4,'HHIIff',w,h,6,0,0,0)
        tex=d.alloc(0x5c);d.put(tex+8,'II',0,4);d.put(tex+0x1c,'3f',1,1,1)
        # Boo's atlas uses mirrored UV tiles: body around U=1 and eyes around
        # U=2..3. Repeat paints its mouth onto the body; clamp erases the eyes.
        wrap=2 if kind=='ghost' else manifest.get('wrap',0)
        d.put(tex+0x34,'II',wrap,wrap);d.put(tex+0x3c,'BB',1,1)
        # HSD MakeTextureMtx subtracts another tile for GX_MIRROR on T. Cancel
        # that Melee convention: the imported Collada UVs are already converted.
        if kind=='ghost':d.put(tex+0x2c,'f',-1)
        d.put(tex+0x40,'IfI',0x440010,1,1);d.pointer(tex+0x4c,im)
        material=d.buffer(b'\xff'*8+b'\0\0\0\xff'+struct.pack('>ff',1,0))
        mobj=d.alloc(24);d.put(mobj+4,'I',0x12);d.pointer(mobj+8,tex);d.pointer(mobj+12,material)
        # Retail 3-D surfaces need depth writes (mouth interior, face and arms).
        d.pointer(mobj+20,d.buffer(bytes([0x39,127,0,0,0,4,5,15,3,4,0,7])))
        if kind=='beam':
            # The source effect is additive light, not an opaque blue pipe.
            d.pointer(mobj+20,d.buffer(bytes([0x19,0,0,0,1,1,1,15,3,7,0,7])))
        count=mesh['triangles']*3;corners=blobs[f'mesh-{i}.corners']
        if len(corners)!=14*count:raise ValueError('Invalid retail topology')
        vertices=blobs[f'mesh-{i}.vertices']
        if part is not None:
            if kind!='chest' or part not in ('base','lid'):raise ValueError('Unsupported articulated mesh')
            # Preserve the original OBJ triangles/UVs, splitting at its actual
            # lid seam. No replacement geometry or textures are generated.
            points=list(struct.iter_unpack('>3f',vertices));selected=[]
            for start in range(0,len(corners),42):
                tri=corners[start:start+42]
                ids=[struct.unpack_from('>H',tri,j*14)[0] for j in range(3)]
                lid=all(points[j][1]>CHEST_HINGE[1]-.0001 for j in ids)
                if lid==(part=='lid'):selected.append(tri)
            corners=b''.join(selected);count=len(corners)//14
            if part=='lid':
                vertices=b''.join(struct.pack('>3f',*(v-p for v,p in zip(point,CHEST_HINGE))) for point in points)
        dl=bytearray(struct.pack('>BH',0x90,count))
        for index,u,v,r,g,b,a in struct.iter_unpack('>H2f4B',corners):
            if index>=mesh['vertices']:raise ValueError('Retail vertex outside buffer')
            dl+=struct.pack('>H4B2f',index,r,g,b,255,u,v)
        dl+=bytes(-len(dl)%32);display=d.buffer(dl,32)
        vertex_size=mesh['vertices']*12
        if len(vertices)!=vertex_size*len(poses):raise ValueError('Invalid retail poses')
        for frame,objects in enumerate(poses):
            attrs=d.alloc(96);d.put(attrs,'IIIIBBHI',9,3,1,4,0,0,12,0)
            d.pointer(attrs+20,d.buffer(vertices[frame*vertex_size:(frame+1)*vertex_size],32))
            d.put(attrs+24,'IIIIBBHI',11,1,1,5,0,0,4,0)
            d.put(attrs+48,'IIIIBBHI',13,1,1,4,0,0,8,0);d.put(attrs+72,'I',255)
            p=d.alloc(24);d.pointer(p+8,attrs);d.put(p+12,'HH',0,len(dl)//32);d.pointer(p+16,display)
            obj=d.alloc(16);d.pointer(obj+8,mobj);d.pointer(obj+12,p)
            if objects:d.pointer(objects[-1]+4,obj)
            objects.append(obj)
    result=([objects[0] for objects in poses],manifest['period'])
    d.retail_actors[key]=result
    return result


def aobj(d,node,tracks,period):
    for x,y in zip(tracks,tracks[1:]):d.pointer(x,y)
    obj=d.alloc(16);d.put(obj,'If',0x20000000,period);d.pointer(obj+8,tracks[0]);d.pointer(node+8,obj)


def attach(d,anchor,animation,m):
    """Return descendant count for Ground's depth-first collision joint lookup."""
    from world_mechanics import track
    if m.get('opensTarget') is not None:
        return attach_chest(d,anchor,animation,m)
    poses,period=models(d,m['entity']);w,h=m['width'],m['height']
    visual=d.joint(w/2,-h if m.get('flipY') else 0,0)
    d.put(visual+32,'3f',-w if m.get('flipX') else w,-h if m.get('flipY') else h,w)
    d.pointer(anchor+8,visual);visual_anim=d.alloc(20);d.pointer(animation,visual_anim)
    if m.get('facingKeys'):
        pivot=d.joint(w/2,-h/2);pivot_anim=d.alloc(20)
        d.pointer(anchor+8,pivot);d.pointer(pivot+8,visual)
        d.put(visual+44,'2f',0,h/2)
        d.pointer(animation,pivot_anim);d.pointer(pivot_anim,visual_anim)
        aobj(d,pivot_anim,[track(d,3,m['facingKeys'],interpolation=2)],m['period'])
    # Small side-to-side turns keep the original face visible. Flap/jaw poses
    # use the source skin weights, baked at 15fps; movement stays at native 60Hz.
    if m['entity']=='ghost':
        aobj(d,visual_anim,[track(d,2,[(0,-.24),(period//2,.24),(period,-.24)])],period)
    prev=aprev=None
    for i,model in enumerate(poses):
        node=d.joint(dobj=model)
        if i:d.put(node+4,'I',d.u(node+4)|0x10)
        anim=d.alloc(20)
        if prev is None:d.pointer(visual+8,node);d.pointer(visual_anim,anim)
        else:d.pointer(prev+12,node);d.pointer(aprev+4,anim)
        if len(poses)>1:
            start=i*period//len(poses);end=(i+1)*period//len(poses)
            keys=[(0,1 if i==0 else 0)]
            if start:keys.append((start,1))
            keys.append((end,0 if end<period else (1 if i==0 else 0)))
            if end<period:keys.append((period,1 if i==0 else 0))
            aobj(d,anim,[track(d,11,keys,interpolation=1)],period)
        prev,aprev=node,anim
    return 1+len(poses)+bool(m.get('facingKeys'))


def attach_chest(d,anchor,animation,m):
    base,_=models(d,'chest','base');lid,_=models(d,'chest','lid')
    visual=d.joint(m['width']/2,0,0)
    d.put(visual+32,'3f',m['width'],m['height'],m['width'])
    d.pointer(anchor+8,visual)
    body=d.joint(dobj=base[0]);hinge=d.joint(*CHEST_HINGE,dobj=lid[0])
    d.pointer(visual+8,body);d.pointer(body+12,hinge)
    va=d.alloc(20);ba=d.alloc(20);ha=d.alloc(20)
    d.pointer(animation,va);d.pointer(va,ba);d.pointer(ba+4,ha)
    return 3
