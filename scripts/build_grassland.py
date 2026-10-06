"""Build Grassland 1, an original Fox Target Test course, from a Melee USA 1.02 ISO.

Only GrTFx.dat is replaced. The input ISO is read-only. Geometry and collisions
are generated here; HSD layouts are documented by Ploaj/HSDLib and doldecomp/melee.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

PACK = struct.pack
TARGETS = [(-305, 26), (-237, 89), (-185, 17), (-111, 104), (-42, 45),
           (20, 23), (77, 92), (153, 16), (226, 112), (312, 84)]
SPAWN = (-325, 2)
OUTLINE = '#263844'


def rgb(color):
    return bytes.fromhex(color.lstrip('#')) + b'\xff'


class Dat:
    def __init__(self, source):
        _, size, nr, nroot, nref = struct.unpack_from('>5I', source)
        self.header = source[:32]
        self.data = bytearray(source[32:32 + size])
        self.reloc = set(struct.unpack_from(f'>{nr}I', source, 32 + size))
        base = 32 + size + 4 * nr
        self.tail = source[base:]
        self.roots = {}
        strings = self.tail[8 * (nroot + nref):]
        for i in range(nroot):
            offset, name = struct.unpack_from('>II', self.tail, i * 8)
            self.roots[strings[name:].split(b'\0')[0].decode()] = offset

    def u(self, p):
        return struct.unpack_from('>I', self.data, p)[0]

    def put(self, p, fmt, *values):
        struct.pack_into('>' + fmt, self.data, p, *values)

    def alloc(self, size, alignment=4):
        self.data.extend(b'\0' * (-len(self.data) % alignment))
        p = len(self.data)
        self.data.extend(b'\0' * size)
        return p

    def buffer(self, value, alignment=4):
        p = self.alloc(len(value), alignment)
        self.data[p:p + len(value)] = value
        return p

    def pointer(self, p, value):
        self.put(p, 'I', value or 0)
        if value is None:
            self.reloc.discard(p)
        else:
            self.reloc.add(p)

    def joint(self, x=0, y=0, z=0, dobj=None):
        p = self.alloc(64)
        self.put(p + 4, 'I', 0x10040000)  # OPA, ROOT_OPA; no lighting
        self.put(p + 0x20, '6f', 1, 1, 1, x, y, z)
        self.pointer(p + 0x10, dobj)
        return p

    def finish(self):
        self.data.extend(b'\0' * (-len(self.data) % 32))
        reloc = PACK(f'>{len(self.reloc)}I', *sorted(self.reloc))
        header = bytearray(self.header)
        struct.pack_into('>3I', header, 0, 32 + len(self.data) + len(reloc) + len(self.tail),
                         len(self.data), len(self.reloc))
        return bytes(header + self.data + reloc + self.tail)


class Art:
    def __init__(self):
        self.triangles = []
        self.solids = []
        self.platforms = []

    def polygon(self, points, color, z=1):
        c = rgb(color)
        for i in range(1, len(points) - 1):
            self.triangles.append([(x, y, z, c) for x, y in (points[0], points[i], points[i+1])])

    def rect(self, x, y, w, h, color, z=1):
        self.polygon([(x, y), (x+w, y), (x+w, y+h), (x, y+h)], color, z)

    def ellipse(self, x, y, rx, ry, color, z=1, n=24):
        self.polygon([(x+rx*math.cos(i*2*math.pi/n), y+ry*math.sin(i*2*math.pi/n))
                      for i in range(n)], color, z)

    def panel(self, x, y, w, h, color, z=1, border=1.2):
        self.rect(x, y, w, h, OUTLINE, z)
        self.rect(x+border, y+border, w-2*border, h-2*border, color, z+.1)

    def solid(self, x, y, w, h, material=2):
        self.solids.append((x, y, w, h, material))

    def platform_surface(self, x, y, w, material=4):
        # Native Melee soft platform: just a floor line, no wall or ceiling.
        self.platforms.append((x, y, w, material))

    def text(self, text, x, y, size, color, z=3):
        font = {
            'G':['01110','10000','10000','10111','10001','10001','01110'],
            'R':['11110','10001','10001','11110','10100','10010','10001'],
            'A':['01110','10001','10001','11111','10001','10001','10001'],
            'S':['01111','10000','10000','01110','00001','00001','11110'],
            'L':['10000','10000','10000','10000','10000','10000','11111'],
            'N':['10001','11001','11001','10101','10011','10011','10001'],
            'D':['11110','10001','10001','10001','10001','10001','11110'],
            '1':['00100','01100','00100','00100','00100','00100','01110'],
            '?':['01110','10001','00001','00010','00100','00000','00100'],
            ' ':['00000']*7,
        }
        for letter in text:
            for row, line in enumerate(font[letter]):
                for col, pixel in enumerate(line):
                    if pixel == '1': self.rect(x+col*size, y+(6-row)*size, size, size, color, z)
            x += 6*size

    def ground(self, x, w):
        self.solid(x, -90, w, 90)
        self.panel(x, -90, w, 90, '#e4a75c', 2)
        for row in range(9):
            for col in range(math.ceil(w/12)):
                xx=x+col*12+(6 if row%2 else 0)
                if xx+7 < x+w-2:
                    self.polygon([(xx+1,-12-row*9),(xx+4,-15-row*9),(xx+7,-12-row*9)], '#be7c46', 2.2)
        self.rect(x+1, -5, w-2, 4, '#53bd63', 2.3)
        self.rect(x+1, -2, w-2, 1.5, '#c3ee7c', 2.4)
        for xx in range(int(x)+3, int(x+w)-3, 9):
            self.polygon([(xx,-5),(xx+3,-8),(xx+6,-5)], '#53bd63', 2.3)

    def block(self, x, y, w, h, color):
        self.solid(x,y,w,h,4)
        self.rect(x+3,y-3,w,h,'#417074',-.3)
        self.panel(x,y,w,h,color,1)
        self.rect(x+2,y+h-3,w-4,1.5,'#fff5d9',1.2)
        for xx in [x+3,x+w-3]:
            for yy in [y+3,y+h-3]:
                self.ellipse(xx,yy,.8,.8,OUTLINE,1.3,8)

    def question(self, x,y):
        self.solid(x,y,16,16,4)
        self.panel(x,y,16,16,'#ffce59',2)
        self.rect(x+2,y+13,12,1,'#fff1b5',2.2)
        self.text('?',x+5,y+4,1.1,OUTLINE,2.3)
        for xx in [x+2.5,x+13.5]:
            for yy in [y+2.5,y+13.5]:self.rect(xx,yy,1,1,'#ba762c',2.3)

    def pipe(self,x,height):
        self.solid(x,0,26,height,5)
        self.panel(x+2,0,22,height-6,'#31934c',2)
        self.rect(x+5,1,4,height-8,'#b4e86b',2.2)
        self.rect(x+10,1,7,height-8,'#60be56',2.2)
        self.rect(x+20,1,2,height-8,'#216d44',2.2)
        self.panel(x,height-7,26,7,'#58b84e',2.4)
        self.rect(x+3,height-5,4,3,'#c9ed88',2.6)
        self.rect(x+9,height-5,12,3,'#85d465',2.6)

    def build(self):
        # Depth layers: sky, hills, bushes, then the collision-bearing terrain.
        self.rect(-1100,-450,2200,1050,'#8bd8ee',-160)
        self.rect(-1000,25,2000,75,'#a8e4ee',-140)
        self.rect(-1000,-250,2000,275,'#c3efdf',-135)
        for x,y,scale in [(-365,115,1),(-255,149,.85),(-103,135,1.2),(58,153,.8),(186,139,1.1),(334,120,1)]:
            for dx,dy,r in [(-13,0,10),(0,4,14),(15,0,11)]:
                self.ellipse(x+dx*scale,y+dy*scale,r*scale,r*.65*scale,'#f8ffff',-100)
            self.rect(x-17*scale,y-6*scale,34*scale,8*scale,'#f8ffff',-99.8)
            self.rect(x-4*scale,y-1*scale,1.3*scale,3*scale,OUTLINE,-99.5)
            self.rect(x+3*scale,y-1*scale,1.3*scale,3*scale,OUTLINE,-99.5)
        for x,h,w,col in [(-370,88,45,'#90d7a0'),(-244,66,36,'#69c89b'),(-142,113,48,'#a6ddac'),
                           (-16,67,34,'#78cfa0'),(90,99,45,'#8bd3aa'),(240,78,46,'#70c89a'),(380,105,52,'#a5dfad')]:
            self.ellipse(x,h*.25,w,h*.75,OUTLINE,-30)
            self.ellipse(x,h*.25,w-1.5,h*.75-1.5,col,-29.8)
            self.rect(x-w,-80,w*2,80+h*.25,col,-29.7)
            for dx in [-7,7]:self.ellipse(x+dx,h*.66,1.1,3.3,OUTLINE,-29.5,12)
            self.ellipse(x-w*.42,h*.55,w*.15,h*.22,'#bdebc2',-29.4)
        for x in range(-350,380,63):
            for dx,r in [(-9,10),(0,15),(12,9)]:
                self.ellipse(x+dx,5,r,r*.72,OUTLINE,-8)
                self.ellipse(x+dx,5,r-1,(r-1)*.72,'#49ad77',-7.8)
        for x,w in [(-350,315),(1,169),(205,145)]:self.ground(x,w)
        # Distinct low and high routes. Gaps stay within Fox's normal jump range.
        self.block(-272,0,38,27,'#f1d997')
        self.block(-234,0,38,45,'#eeaa9d')
        self.question(-259,60)
        self.question(-243,60)
        self.pipe(-173,29)
        self.block(-124,0,36,28,'#aadceb')
        self.block(-88,0,37,51,'#a8dfb2')
        self.block(-131,77,49,12,'#f1d997')
        self.question(-62,71)
        self.pipe(27,25)
        self.block(65,0,36,37,'#eeaa9d')
        self.question(73,61)
        self.block(118,44,41,12,'#a8dfb2')
        self.pipe(211,31)
        self.block(250,0,24,22,'#f1d997')
        self.block(274,0,24,44,'#eeaa9d')
        self.block(298,0,35,66,'#aadceb')
        self.question(216,88)
        self.question(232,88)
        # A scalloped bridge above the second gap.
        self.block(174,28,25,8,'#f1d997')
        # Finish flag and start sign are scenery, never invisible collision.
        self.rect(336,0,2,92,OUTLINE,3)
        self.ellipse(337,94,3,3,'#ffd260',3)
        self.polygon([(338,89),(361,82),(338,75)],'#ed776f',3)
        self.rect(-337,0,2,21,OUTLINE,3)
        self.panel(-347,15,24,13,'#fff2cc',3)
        self.polygon([(-342,22),(-333,22),(-333,25),(-327,21),(-333,17),(-333,20),(-342,20)],OUTLINE,3.2)
        self.text('GRASSLAND 1',-339,80,.8,OUTLINE,-5)
        return self

    def model(self, d):
        # One unlit vertex-colour mesh, split into legal GX display-list sizes.
        attrs = d.alloc(24*3)
        d.put(attrs, 'IIIIBBHI', 9,1,1,4,0,0,12,0)  # position, direct, XYZ, F32
        d.put(attrs+24,'IIIIBBHI',11,1,1,5,0,0,4,0)  # CLR0, direct, RGBA, RGBA8
        d.put(attrs+48,'I',255)
        material=d.buffer(b'\xff'*8+b'\0\0\0\xff'+PACK('>ff',1,0))
        mobj=d.alloc(24);d.put(mobj+4,'I',2);d.pointer(mobj+12,material)
        prev=None;first=None
        for start in range(0,len(self.triangles),3000):
            ts=self.triangles[start:start+3000]
            dl=bytearray(PACK('>BH',0x90,len(ts)*3))
            for tri in ts:
                for x,y,z,c in tri:dl+=PACK('>fff',x,y,z)+c
            dl+=b'\0'*(-len(dl)%32)
            data=d.buffer(dl,32);p=d.alloc(24)
            d.pointer(p+8,attrs);d.put(p+12,'HH',0,len(dl)//32);d.pointer(p+16,data)
            if prev is not None:d.pointer(prev+4,p)
            else:first=p
            prev=p
        dobj=d.alloc(16);d.pointer(dobj+8,mobj);d.pointer(dobj+12,first)
        return dobj

    def collisions(self,d):
        vertices=[];lines=[]
        # Clockwise loop: floor left -> right, then right wall, ceiling, left wall.
        for index,(x,y,w,h,material) in enumerate(self.solids):
            v=len(vertices);l=len(lines)
            contour=getattr(self,'solid_contours',{}).get(index,[(x,y+h),(x+w,y+h),(x+w,y),(x,y)])
            count=len(contour);vertices += contour
            for i,(ax,ay) in enumerate(contour):
                bx,by=contour[(i+1)%count];dx,dy=bx-ax,by-ay
                # Clockwise x-monotone contours: a sloped roof remains a floor,
                # including slopes steeper than 45 degrees. Walls are vertical.
                flag=(1 if dx>0 else 2) if abs(dx)>.00001 else (4 if dy<0 else 8)
                if getattr(self,'steep_contour_walls',False) and abs(dy)>abs(dx):
                    flag=4 if dy<0 else 8
                # Thin lower collars are solid surfaces, but not handholds.
                grab = flag==1 and not (index in getattr(self,'no_lower_ledges',set())
                                        and min(ay,by)<y+h-.001)
                lines.append({'v0':v+i,'v1':v+(i+1)%count,'prev':l+(i-1)%count,'next':l+(i+1)%count,
                              'flag':flag,'property':2 if grab else 0,'material':material,'old':l+i})
        for x,y,w,material in self.platforms:
            v=len(vertices);l=len(lines)
            vertices += [(x,y),(x+w,y)]
            lines.append({'v0':v,'v1':v+1,'prev':-1,'next':-1,'flag':1,
                          'property':1,'material':material,'old':l})
        lines.sort(key=lambda l:[1,2,4,8].index(l['flag']))
        remap={l['old']:i for i,l in enumerate(lines)}
        vb=d.buffer(b''.join(PACK('>ff',*v) for v in vertices))
        lb=d.buffer(b''.join(PACK('>6hHBB',l['v0'],l['v1'],remap.get(l['prev'],-1),remap.get(l['next'],-1),-1,-1,
                                   l['flag'],l['property'],l['material']) for l in lines))
        counts=[];offset=0
        for flag in [1,2,4,8]:
            n=sum(l['flag']==flag for l in lines);counts += [offset,n];offset+=n
        counts += [0,0]
        group=d.alloc(40);d.put(group,'10h',*counts)
        d.put(group+20,'4fhh',min(x for x,y in vertices),min(y for x,y in vertices),
              max(x for x,y in vertices),max(y for x,y in vertices),0,len(vertices))
        c=d.roots['coll_data'];d.pointer(c,vb);d.put(c+4,'I',len(vertices));d.pointer(c+8,lb)
        d.put(c+12,'I',len(lines));d.put(c+16,'10h',*counts);d.pointer(c+36,group);d.put(c+40,'I',1)


def build_stage(source, art=None, targets=TARGETS, spawn=SPAWN, sky=(139,216,238), bounds=(-370,155,370,-25)):
    d=Dat(source);art=art if art is not None else Art().build()
    if hasattr(art,"piece_catalog"):
        from modular_stage import mesh
        dobj=mesh(d,art)
    else:dobj=art.model(d)
    art.collisions(d)
    if hasattr(art,'world_scale'):
        from solid_readability import append as append_solid_bevels
        append_solid_bevels(d,art,dobj)
    m=d.roots['map_head'];groups=d.u(m+8);gp=d.u(m)
    # Keep native cameras/lights; replace all model roots and remove old animation/link tables.
    left,top,right,bottom=bounds
    anchors=[(148,0,0),(149,left,top),(150,right,bottom),(151,left-40,top+85),
             (152,right+40,bottom-70),(0,*spawn),(4,spawn[0],spawn[1]+4)]
    for gi,points in [(0,anchors),(1,[]),(2,[(199+i,x,y) for i,(x,y) in enumerate(targets)])]:
        root=d.joint(dobj=dobj if gi==2 else None)
        js=[d.joint(x,y) for _,x,y in points]
        if js:d.pointer(root+8,js[0])
        for a,b in zip(js,js[1:]):d.pointer(a+12,b)
        g=groups+52*gi;d.pointer(g,root)
        for off in [4,8,12,20,28,32,40,44]:d.pointer(g+off,None)
        d.put(g+36,'I',0);d.put(g+48,'I',0)
        if points:
            p=gp+(12 if gi==2 else 0);d.pointer(p,root)
            table=d.buffer(b''.join(PACK('>hh',i+1,t) for i,(t,x,y) in enumerate(points)))
            d.pointer(p+4,table);d.put(p+8,'I',len(points))
    # No old model materials need runtime animation or enumeration.
    d.pointer(m+40,None);d.put(m+44,'I',0)
    p=d.roots['grGroundParam']
    d.put(p+0x14,'i',0)  # side-on camera, no automatic tilt
    d.put(p+0x18,'2f',0,0)
    for off in range(0xb8,0xdc,4):d.put(p+off,'4B',*sky,255)
    if hasattr(art,'mechanisms'):
        from world_mechanics import build_mechanics
        build_mechanics(d,art)
        from editor_media import install_animation
        install_animation(d)
        from world_challenge import scale_archive
        scale_archive(d,art)
        if getattr(art,"retail_corneria",False):
            from corneria_arwings import install
            install(d,scale=getattr(art,"aircraft_scale",1.0),wolfen=art.suffix=='Fc')
    if hasattr(art,"world_scale"):
        from native_encounters import install as install_retail
        install_retail(d,art)
        from world_items import install as install_items
        install_items(d,art)
    return d.finish(),art


def iso_table(iso):
    with iso.open('rb') as f:
        if f.read(8)!=b'GALE01\0\x02':raise ValueError('Expected Melee USA 1.02')
        f.seek(0x424);base,size=struct.unpack('>II',f.read(8));f.seek(base);fst=bytearray(f.read(size))
    n=struct.unpack_from('>I',fst,8)[0];strings=fst[n*12:];entries=[]
    for i in range(1,n):
        name,off,size=struct.unpack_from('>III',fst,i*12)
        if name>>24:continue
        name=strings[name:].split(b'\0')[0].decode()
        entries.append((i,name,off,size))
    return base,fst,entries


def write_iso(source,destination,stage, patch_prefix=None, title=b'TTRC - Grassland 1 (Fox Target Test)'):
    replacements=stage if isinstance(stage,dict) else {'GrTFx.dat':stage}
    base,fst,entries=iso_table(source)
    if source.resolve()==destination.resolve():raise ValueError('Input and output must be different files')
    destination.parent.mkdir(parents=True,exist_ok=True)
    first=min(e[2] for e in entries)
    temporary=destination.with_suffix('.iso.tmp')
    with source.open('rb') as src,temporary.open('wb') as out:
        prefix=src.read(first)
        out.write(patch_prefix(prefix) if patch_prefix else prefix)
        for index,name,old,size in sorted(entries,key=lambda e:e[2]):
            out.write(b'\0'*(-out.tell()%32));offset=out.tell()
            if name in replacements:out.write(replacements[name]);size=len(replacements[name])
            else:
                src.seek(old);remaining=size
                while remaining:
                    chunk=src.read(min(remaining,1024*1024))
                    if not chunk:raise ValueError('Truncated source ISO')
                    out.write(chunk);remaining-=len(chunk)
            struct.pack_into('>II',fst,index*12+4,offset,size)
        out.write(b'\0'*(-out.tell()%32768))
        out.seek(base);out.write(fst)
        out.seek(0x20);out.write(title+b'\0')
    temporary.replace(destination)


def preview(art,path):
    from PIL import Image,ImageDraw
    scale=2.5;im=Image.new('RGB',(1800,675),'#8bd8ee');draw=ImageDraw.Draw(im)
    for tri in sorted(art.triangles,key=lambda tri:tri[0][2]):
        draw.polygon([((x+360)*scale,(160-y)*scale) for x,y,z,c in tri],fill=tuple(tri[0][3][:3]))
    for i,(x,y) in enumerate(TARGETS):
        xx=(x+360)*scale;yy=(160-y)*scale
        for r,c in [(7,'#fff9e7'),(5.6,'#e84057'),(3.4,'#fff9e7'),(1.6,'#e84057')]:
            draw.ellipse((xx-r*scale,yy-r*scale,xx+r*scale,yy+r*scale),fill=c)
    im.save(path)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--iso',type=Path,required=True);ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--stage-only',action='store_true')
    ap.add_argument('--no-preview',action='store_true',help='Build without Pillow (embedded Python)')
    args=ap.parse_args()
    if args.iso.resolve() == args.output.resolve():
        ap.error("Choose a different output file; the original ISO must be preserved")
    _,_,entries=iso_table(args.iso)
    entry=next(e for e in entries if e[1]=='GrTFx.dat')
    with args.iso.open('rb') as f:f.seek(entry[2]);source=f.read(entry[3])
    if hashlib.sha256(source).hexdigest() != "1cbe99c391ed027fe87b582f4891cb5f4c80b30d9ba703a804d61010ee6682c2":
        raise ValueError("The Fox stage is not the original USA 1.02 stage")
    stage,art=build_stage(source)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.with_suffix('.dat').write_bytes(stage)
    if not args.no_preview:preview(art,args.output.with_suffix('.png'))
    manifest={'name':'Grassland 1','character':'fox','stageFile':'GrTFx.dat','targets':TARGETS,
              'spawn':SPAWN,'triangles':len(art.triangles),'solidCount':len(art.solids),
              'stageSha256':hashlib.sha256(stage).hexdigest()}
    args.output.with_suffix('.json').write_text(json.dumps(manifest,indent=2)+'\n')
    if not args.stage_only:write_iso(args.iso,args.output,stage)
    print(json.dumps(manifest,indent=2))


if __name__=='__main__':main()
