"""Unlit, tiled GameCube textures for the authored stage artwork.

HSD layouts follow HSDLib HSD_TOBJ/HSD_MOBJ and Melee baselib/tobj.c.
Assets are pre-encoded: portable builds require only standard-library Python.
"""
import hashlib
import json
from pathlib import Path
import struct

MANOR_ASSETS = Path(__file__).resolve().parents[1] / 'assets/custom-stages/manor'


def texture_scene(d, platforms=(), directory=MANOR_ASSETS, *, copies=None, background=True, cuts=(), render_bounds=None, depth=0):
    manifest = json.loads((directory / 'scene.json').read_text())
    if manifest['format'] != 'GX_CMPR_1':
        raise ValueError('Unsupported stage texture format')
    left, top, right, bottom = render_bounds or manifest['bounds']
    width, height = manifest['size']
    attrs = d.alloc(24 * 3)
    d.put(attrs, 'IIIIBBHI', 9, 1, 1, 4, 0, 0, 12, 0)  # direct XYZ f32
    d.put(attrs + 24, 'IIIIBBHI', 13, 1, 1, 4, 0, 0, 8, 0)  # TEX0 ST f32
    d.put(attrs + 48, 'I', 255)
    material = d.buffer(b'\xff' * 8 + b'\0\0\0\xff' + struct.pack('>ff', 1, 0))
    first = previous = None
    platform_copies = manifest.get('platformCopies',[]) if copies is None else copies
    draws = [(tile,False) for tile in manifest['tiles']] if background else []
    if platforms:draws.append((manifest['ledge'],False))
    if platform_copies:draws += [(tile,True) for tile in manifest['tiles']]
    # Moving pieces sample the very same image as the backdrop. Share the CMPR
    # buffers across calls instead of embedding another full painting per lift.
    if not hasattr(d,'texture_pixels'):d.texture_pixels={}
    encoded=d.texture_pixels
    for tile, copies in draws:
        name = tile['file']
        if Path(name).name != name:
            raise ValueError('Invalid texture filename')
        data = (directory / name).read_bytes()
        tx, ty, tw, th = tile['rect']
        if not (0 < tw <= 1024 and 0 < th <= 1024 and tw % 8 == th % 8 == 0):
            raise ValueError('Invalid GX tile dimensions')
        if len(data) != tw * th // 2 or hashlib.sha256(data).hexdigest() != tile['sha256']:
            raise ValueError('Stage texture asset is damaged: ' + name)
        key=(str(directory),name,tile['sha256'])
        if key not in encoded:encoded[key] = d.buffer(data, 32)
        pixels = encoded[key]
        im = d.alloc(24)
        d.pointer(im, pixels)
        d.put(im + 4, 'HHIIff', tw, th, 14, 0, 0, 0)  # GX_TF_CMPR, no mipmaps
        texture = d.alloc(0x5c)
        d.put(texture + 8, 'II', 0, 4)  # GX_TEXMAP0, GX_TG_TEX0
        d.put(texture + 0x1c, '3f', 1, 1, 1)
        d.put(texture + 0x3c, 'BB', 1, 1)
        d.put(texture + 0x40, 'IfI', 0x50010, 1, 1)  # replace RGB; diffuse; linear filter
        d.pointer(texture + 0x4c, im)
        mobj = d.alloc(24)
        # Stay in the opaque stage pass. Disable depth writes through PEDesc,
        # rather than RENDER_NO_ZUPDATE (which changes HSD object classification).
        # https://github.com/doldecomp/melee/blob/master/src/sysdolphin/baselib/state.c
        d.put(mobj + 4, 'I', 0x11)
        pe = d.buffer(bytes([0x19,0,0,0,0,4,5,15,3,7,0,7]))
        d.pointer(mobj + 20, pe)
        d.pointer(mobj + 8, texture)
        d.pointer(mobj + 12, material)
        x0 = left + tx / width * (right - left)
        x1 = left + (tx + tw) / width * (right - left)
        y0 = top - ty / height * (top - bottom)
        y1 = top - (ty + th) / height * (top - bottom)
        rects = [(x0, y1, x1, y0, depth, 0, 0, 1, 1)]
        if tile is manifest.get('ledge'):
            rects = [(x, y - 7, x + w, y, 0, 0, 0, 1, 1) for x, y, w, _ in platforms]
        if copies:
            rects=[]
            iw,ih=(manifest.get('collisionTracing') or manifest['paintedFloors'])['size']
            for copy in platform_copies:
                sx,sy,sr,sb=copy['sourcePixels']
                sx*=width/iw;sr*=width/iw;sy*=height/ih;sb*=height/ih
                cl,ct,cr,cb=max(sx,tx),max(sy,ty),min(sr,tx+tw),min(sb,ty+th)
                if cr<=cl or cb<=ct:continue
                x,y,w=copy['surface'];h=copy['height']
                rects.append((x+(cl-sx)/(sr-sx)*w,y-(cb-sy)/(sb-sy)*h,
                              x+(cr-sx)/(sr-sx)*w,y-(ct-sy)/(sb-sy)*h,0,
                              (cl-tx)/tw,(ct-ty)/th,(cr-tx)/tw,(cb-ty)/th))
            if not rects:continue
        if cuts and not copies and tile is not manifest.get('ledge'):
            # Subdivide textured stage quads, preserving original UVs. The gap
            # exposes the stage's own clear background; no stretched patch.
            for cl,cb,cr,ct in cuts:
                remaining=[]
                for a,b,c,e,z,u,v,U,V in rects:
                    il,ib,ir,it=max(a,cl),max(b,cb),min(c,cr),min(e,ct)
                    if il>=ir or ib>=it:remaining.append((a,b,c,e,z,u,v,U,V));continue
                    for A,B,C,E in [(a,b,il,e),(ir,b,c,e),(il,b,ir,ib),(il,it,ir,e)]:
                        if C<=A or E<=B:continue
                        remaining.append((A,B,C,E,z,u+(U-u)*(A-a)/(c-a),v+(V-v)*(e-E)/(e-b),u+(U-u)*(C-a)/(c-a),v+(V-v)*(e-B)/(e-b)))
                rects=remaining
            if not rects:continue
        dl = bytearray(struct.pack('>BH', 0x90, 6 * len(rects)))
        for x0, y1, x1, y0, z, u0, v0, u1, v1 in rects:
            vertices = [(x0, y1, u0, v1), (x1, y1, u1, v1), (x1, y0, u1, v0),
                        (x0, y1, u0, v1), (x1, y0, u1, v0), (x0, y0, u0, v0)]
            for x, y, u, v in vertices:
                dl += struct.pack('>5f', x, y, z, u, v)
        dl += bytes(-len(dl) % 32)
        display = d.buffer(dl, 32)
        pobj = d.alloc(24)
        d.pointer(pobj + 8, attrs)
        d.put(pobj + 12, 'HH', 0, len(dl) // 32)
        d.pointer(pobj + 16, display)
        dobj = d.alloc(16)
        d.pointer(dobj + 8, mobj)
        d.pointer(dobj + 12, pobj)
        if previous is not None:
            d.pointer(previous + 4, dobj)
        else:
            first = dobj
        previous = dobj
    if first is None:
        raise ValueError('Empty stage texture scene')
    return first
