"""Place the original common Warp Star item without replacing its behavior."""
import struct
from pathlib import Path

def install(d,art):
    items=[a for a in getattr(art,'native_actor_edits',[]) if a['kind']==29]
    if not items:return
    if len(items)>16:raise ValueError('At most 16 Warp Stars')
    from corneria_arwings import add_root
    old=d.roots['yakumono_param'];table=d.alloc(48)
    for i in range(11):d.pointer(table+4*i,d.u(old+4*i) or None)
    add_root(d,'yakumono_param',table)
    config=d.alloc(12);d.put(config,'II',0x57535431,len(items))
    positions=d.buffer(b''.join(struct.pack('>3f',a['x']*art.world_scale,a['y']*art.world_scale,0.) for a in items))
    d.pointer(config+8,positions);d.pointer(table+44,config)

def patch_callback(data,offset):
    start=0x80221648;end=0x80221930
    code=(Path(__file__).parent/'native/world-items.bin').read_bytes()
    if len(code)>end-start:raise ValueError('Item spawner exceeds retired Bowser module')
    p=offset(start)
    if struct.unpack_from('>I',data,p)[0]!=0x4e800020:raise ValueError('Unexpected retired Bowser module')
    data[p:p+len(code)]=code
    calls=[]
    for address in range(0x80220b84,0x80220bfc,4):
        if struct.unpack_from('>I',data,offset(address))[0]==0x48000001|((0x801c42ac-address)&0x3fffffc):calls.append(address)
    if len(calls)!=1:raise ValueError('Target-stage final initialization call not found')
    address=calls[0]
    struct.pack_into('>I',data,offset(address),0x48000001|((start-address)&0x3fffffc))
