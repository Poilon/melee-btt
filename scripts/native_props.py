"""Attach extracted Melee models with their original textures to stage joints."""
import hashlib
import json
import struct
from pathlib import Path
from build_grassland import Dat

ASSETS=Path(__file__).resolve().parents[1]/'assets/custom-stages/native-props'

def patch_wind(data,offset):
    raw=(Path(__file__).parent/'native/world-wind.bin').read_bytes()
    if len(raw)>0x2e0:raise ValueError('Wind exceeds retired Kirby module')
    p=offset(0x80221368)
    if struct.unpack_from('>I',data,p)[0]!=0x7c0802a6:raise ValueError('Unexpected retired Kirby module')
    data[p:p+len(raw)]=raw

def specification(name):
    return json.loads((ASSETS/name/'model.json').read_text())

def attach(d,anchor,animation,m):
    name=m['nativeProp'];spec=specification(name)
    if spec['format']!='TTRC_NATIVE_PROP_1':raise ValueError('Unknown native prop format')
    if not hasattr(d,'native_props'):d.native_props={}
    if name not in d.native_props:
        raw=(ASSETS/name/'model.dat').read_bytes()
        if hashlib.sha256(raw).hexdigest()!=spec['modelSha256']:raise ValueError('Damaged native prop: '+name)
        source=Dat(raw);base=d.buffer(source.data,32)
        for r in source.reloc:d.pointer(base+r,base+source.u(r))
        d.native_props[name]=base+source.roots['model']
    visual=d.joint(m['width']/2,0,0)
    d.put(visual+32,'3f',-m['width'] if m.get('flipX') else m['width'],
          m['height']/spec['aspect'],m['width'])
    d.put(visual+20,'3f',0,m.get('yaw',0),m.get('roll',0))
    d.pointer(anchor+8,visual);d.pointer(visual+8,d.native_props[name])
    va=d.alloc(20);pa=d.alloc(20);d.pointer(animation,va);d.pointer(va,pa)
    return 2
