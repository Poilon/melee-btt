"""Host complete retail actors. Original item AI, animations and hitboxes run unchanged."""
import bisect,hashlib,json,struct
from pathlib import Path
from build_grassland import Dat,iso_table
from corneria_arwings import add_root
SOURCES={}

class Archive:
    def __init__(self,raw):
        self.d=Dat(raw);self.sha=hashlib.sha256(raw).hexdigest()
        d=self.d;nr,nx=struct.unpack_from('>II',d.header,12)
        for i in range(nr,nr+nx):
            p=struct.unpack_from('>I',d.tail,i*8)[0];seen=set()
            while p not in (0,0xffffffff) and p not in seen:
                seen.add(p);n=d.u(p);d.put(p,'I',0);p=n
        self.cuts=sorted({0,len(d.data),*d.roots.values(),*(d.u(r) for r in d.reloc)})
        self.ptrs=sorted(d.reloc)
    def copy(self,out,p,size=None):
        if not hasattr(out,'retail_blocks'):out.retail_blocks={}
        key=(self.sha,p,size)
        if key in out.retail_blocks:return out.retail_blocks[key]
        end=p+size if size is not None else self.cuts[bisect.bisect_right(self.cuts,p)]
        q=out.buffer(self.d.data[p:end],32);out.retail_blocks[key]=q
        for r in self.ptrs[bisect.bisect_left(self.ptrs,p):bisect.bisect_left(self.ptrs,end)]:
            out.pointer(q+r-p,self.copy(out,self.d.u(r)))
        return q

def load(iso):
    entries={e[1]:e for e in iso_table(iso)[2]}
    with iso.open('rb') as f:
        for name in ('GrOt.dat','GrIm.dat','ItCo.usd'):
            e=entries[name];f.seek(e[2]);SOURCES[name]=Archive(f.read(e[3]))

def append_articles(d,records):
    p=d.roots['itemdata'];items=[]
    while d.u(p):items.append(d.u(p));p+=4
    table=d.alloc(4*(len(items)+len(records)+1))
    for i,q in enumerate(items+records):d.pointer(table+i*4,q)
    add_root(d,'itemdata',table)

def install(d,art):
    s=art.suffix
    if s not in ('Ns','Ic','Sk'):return
    table=d.roots['yakumono_param'];cfg=d.alloc(16);d.put(cfg,'I',0x4e415456);d.pointer(table,cfg)
    scale=art.world_scale;f=art.authored_surfaces
    actors=[]
    if s=='Ns':
        src=SOURCES['GrOt.dat'];sd=src.d
        m=d.roots['map_head'];old=d.u(m+8);groups=d.alloc(4*52)
        for i in range(3):
            d.data[groups+i*52:groups+(i+1)*52]=d.data[old+i*52:old+(i+1)*52]
            for r in list(d.reloc):
                if old+i*52<=r<old+(i+1)*52:d.pointer(groups+r-old,d.u(r))
        rec=src.copy(d,sd.u(sd.roots['map_head']+8)+3*52,52)
        d.data[groups+156:groups+208]=d.data[rec:rec+52]
        for r in list(d.reloc):
            if rec<=r<rec+52:d.pointer(groups+156+r-rec,d.u(r))
        d.pointer(m+8,groups);d.put(m+12,'I',4)
        params=src.copy(d,sd.roots['yakumono_param']);d.pointer(cfg+4,params)
        # Ground_801C0800 binds these scripts to the generic stage-hazard item.
        # Copying just the models/AI leaves the four car attack states empty.
        add_root(d,'ALDYakuAll',src.copy(d,sd.roots['ALDYakuAll']))
        for off,v in ((0x44,180.),(0x48,90.),(0x54,4.),(0x58,2.)):
            d.put(params+off,'f',v)
        # Native front traffic lane: exact car models, at the host street height.
        root=d.u(groups+156);lane=getattr(art,'native_actor_edits',[dict(x=0,y=f[0][2])])[0];d.put(root+44,'2f',lane['x']*scale,lane['y']*scale)
    elif s=='Ic':
        src=SOURCES['GrIm.dat'];q=src.d.u(src.d.roots['itemdata'])
        assert src.d.u(q)==0xd9
        append_articles(d,[src.copy(d,q)])
        actors=[(0x2e,-67,f[3][2]+2),(0x2e,8,f[8][2]+2),(0xd9,0,f[9][2]+2)]
    elif s=='Sk':
        actors=[(0x2c,-68,f[3][2]+2),(0x2c,53,f[6][2]+2)]
    if s in ('Ic','Sk') and hasattr(art,'native_actor_edits'):actors=[(a['kind'],a['x'],a['y']) for a in art.native_actor_edits]
    d.put(cfg+8,'I',len(actors))
    if actors:
        rows=d.alloc(16*len(actors));d.pointer(cfg+12,rows)
        for i,(kind,x,y) in enumerate(actors):d.put(rows+16*i,'I3f',kind,x*scale,y*scale,0.)

def patch_callback(data,offset):
    folder=Path(__file__).parent/'native';code=(folder/'world-retail.bin').read_bytes()
    if len(code)>0x2e4:raise ValueError('Retail host exceeds retired Peach module')
    p=offset(0x802228b4)
    if struct.unpack_from('>I',data,p)[0]!=0x4e800020:raise ValueError('Unexpected retired Peach code')
    data[p:p+len(code)]=code
    # Native Onett factory asks Ground_GetStageGObj for callback flags as well.
    table=0x80222b98;dest=offset(table);fox=offset(0x803e89d8);ot=offset(0x803e27e0)
    callbacks=data[fox:fox+60]+data[ot+60:ot+80];data[dest:dest+80]=callbacks
    from build_character_worlds import WORLDS
    for spec in WORLDS:
        if spec[2] in ('Ns','Ic','Sk'):struct.pack_into('>I',data,offset(spec[3])+12,0x802228b4)
    struct.pack_into('>I',data,offset(0x803e908c)+4,table)

def attach_zapdos(d,anchor,animation,m):
    """Original Poke Ball Zapdos skeleton, textures and native wingbeat track."""
    src=SOURCES['ItCo.usd'];sd=src.d
    article=sd.u(sd.u(sd.roots['itPublicData']+12)+7*4)
    model=src.copy(d,sd.u(sd.u(article+16)))
    states=sd.u(article+12);anim=src.copy(d,sd.u(states+2*16))
    # Keep the native animation itself. Looping replaces the Pokemon lifetime;
    # the stage anchor supplies the authored flight path and contact bounds.
    seen=set()
    def loop(p):
        if not p or p in seen:return
        seen.add(p);ao=d.u(p+8)
        if ao:d.put(ao,'I',d.u(ao)|0x20000000)
        loop(d.u(p));loop(d.u(p+4))
    loop(anim)
    wrapper=d.joint(m['width']/2,-m['height']/2,0)
    d.put(wrapper+32,'3f',1.0,1.0,1.0)
    d.pointer(anchor+8,wrapper);d.pointer(wrapper+8,model)
    wa=d.alloc(20);d.pointer(animation,wa);d.pointer(wa,anim)
    # Source hierarchy must remain complete, including skinning references.
    def count(p):
        return 0 if not p else 1+count(d.u(p+8))+count(d.u(p+12))
    return 1+count(model)
