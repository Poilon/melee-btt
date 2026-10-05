"""Surface-mounted lab hazards; native contact damage, image textures and tracks."""
import hashlib
import json
import struct
from pathlib import Path


def configure(art):
    from world_gameplay import ride
    # Mount against calibrated foreground surfaces, never free-floating offsets.
    shelf_left,shelf_right,shelf_top = art.authored_surfaces[8]
    cabinet_left,_,cabinet_top = art.authored_surfaces[2]
    ceiling = min(y for _,y in art.solid_contours[6])
    # Guard target 4's landing: leave small safe rims, but no safe floor below
    # the target itself. The target stays clear above the reacting mixture.
    x = art.targets[3][0] - 15
    if not shelf_left + 4 <= x <= shelf_right - 34:
        raise ValueError('Mixing trough must leave accessible catwalk rims')
    basin = dict(ride('Reactive mixing trough',x,shelf_top+11,30),kind='bumper',
        skin='basin',height=11,rect=[0,0,30,11],mount='catwalk',
        outline=[[2,-1],[8,0],[11,-1],[21,0],[28,-1],[30,-4],[30,-11],[0,-11],[0,-4]])
    # Pulse across the last narrow exterior step on the way to target 2.
    # The nozzle's back is attached to the cabinet and its top aligns with it.
    anchor = cabinet_left-12
    glob_y = cabinet_top-7
    glob = dict(ride('Cabinet pressure leak',anchor,glob_y,24,period=300,hold=45),kind='bumper',
        skin='glob',height=15,rect=[-24,7.5,24,15],mount='cabinet',
        scaleX=[(0,.2),(55,.2),(95,1.2),(155,1.2),(215,.2),(300,.2)],
        outline=[[-18,7.5],[-9,5],[-4,3],[0,3],[0,-3],[-4,-3],[-9,-5],[-18,-7.5],[-24,-3],[-24,3]])
    press = dict(ride('Chamber dosing press',133,ceiling-3,12,dy=-12,period=360,hold=60),
        kind='bumper',skin='press',height=24,rect=[0,0,12,24],mount='ceiling',
        outline=[[0,0],[12,0],[12,-19],[9,-24],[3,-24],[0,-19]])
    # The telescoping shaft has its own safe collision group and scale track.
    # Its lower endpoint follows the head exactly; the upper mounting stays put.
    shaft = dict(ride('Press telescoping shaft',136,ceiling,6,period=360,hold=60),
        kind='gate',skin='shaft',height=3,rect=[0,0,6,3],mount='ceiling',
        scaleY=[(0,1),(60,1),(120,5),(240,5),(300,1),(360,1)])
    art.mechanisms += [basin,glob,shaft,press]
    art.chemical_mounts = [
        dict(skin='nozzle',rect=[anchor,glob_y+7,12,14]),
        dict(skin='cap',rect=[128,ceiling+1,22,6]),
    ]


def sprite_mesh(d,art,skin,rect,manifest='chemicals.json'):
    """RGBA8 cutout in the opaque pass; alpha test discards transparent texels.

    HSD TEX_ALPHAMAP_REPLACE / PEDesc follow doldecomp/melee baselib/tobj.h,
    mobj.h. GX RGBA8 stores each 4x4 tile as AR followed by GB planes.
    """
    directory = art.world_assets
    entry = json.loads((directory/manifest).read_text())['sprites'][skin]
    name = entry['file']; w,h = entry['size']
    if Path(name).name != name: raise ValueError('Invalid sprite path')
    data = (directory/name).read_bytes()
    if len(data)!=w*h*4 or hashlib.sha256(data).hexdigest()!=entry['sha256']:
        raise ValueError('Damaged chemical sprite: '+skin)
    if not hasattr(d,'texture_pixels'): d.texture_pixels={}
    key=(str(directory),name,entry['sha256'])
    if key not in d.texture_pixels: d.texture_pixels[key]=d.buffer(data,32)
    im=d.alloc(24);d.pointer(im,d.texture_pixels[key]);d.put(im+4,'HHIIff',w,h,6,0,0,0)
    tex=d.alloc(0x5c);d.put(tex+8,'II',0,4);d.put(tex+0x1c,'3f',1,1,1)
    d.put(tex+0x3c,'BB',1,1);d.put(tex+0x40,'IfI',0x450010,1,1);d.pointer(tex+0x4c,im)
    material=d.buffer(b'\xff'*8+b'\0\0\0\xff'+struct.pack('>ff',1,0))
    mobj=d.alloc(24);d.put(mobj+4,'I',0x11);d.pointer(mobj+8,tex);d.pointer(mobj+12,material)
    # Alpha > 127 AND always; depth writes off, RGB writes on, no blend.
    d.pointer(mobj+20,d.buffer(bytes([0x19,127,0,0,0,4,5,15,3,4,0,7])))
    attrs=d.alloc(72);d.put(attrs,'IIIIBBHI',9,1,1,4,0,0,12,0)
    d.put(attrs+24,'IIIIBBHI',13,1,1,4,0,0,8,0);d.put(attrs+48,'I',255)
    x,y,width,height=rect
    vertices=[(x,y-height,0,1),(x+width,y-height,1,1),(x+width,y,1,0),
              (x,y-height,0,1),(x+width,y,1,0),(x,y,0,0)]
    dl=bytearray(struct.pack('>BH',0x90,6))
    for vx,vy,u,v in vertices:dl+=struct.pack('>5f',vx,vy,0,u,v)
    dl+=bytes(-len(dl)%32)
    pobj=d.alloc(24);d.pointer(pobj+8,attrs);d.put(pobj+12,'HH',0,len(dl)//32)
    d.pointer(pobj+16,d.buffer(dl,32))
    obj=d.alloc(16);d.pointer(obj+8,mobj);d.pointer(obj+12,pobj)
    return obj


def mount_mesh(d,art):
    first=last=None
    for mount in art.chemical_mounts:
        obj=sprite_mesh(d,art,mount['skin'],mount['rect'])
        if last is not None:d.pointer(last+4,obj)
        else:first=obj
        last=obj
    return first
