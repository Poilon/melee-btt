"""A native target doubles as the closed chest's attack receiver.

The first hit opens the original textured lid; the target stays uncounted and
hidden during the animation. A later hit uses Melee's ordinary target break.
"""
import json
import struct
from pathlib import Path


def install(d,art):
    entries=[(i,m) for i,m in enumerate(art.mechanisms) if m.get('opensTarget') is not None]
    if len(entries)!=1:raise ValueError('Expected one interactive chest')
    index,m=entries[0];target=m['opensTarget'];groups=d.u(d.roots['map_head']+8)
    root=d.u(groups+104);anchor=d.u(root+8)
    for _ in range(target):anchor=d.u(anchor+12)
    closed=m['y']-m['height']/2;opened=art.targets[target][1]
    d.put(anchor+48,'f',closed)
    config=d.buffer(struct.pack('>4I6f2I',0x43485354,target,10+index,0,0.,closed,(opened-closed)/24,-1.48/24,-1.48,opened,24,32))
    d.pointer(d.roots['yakumono_param'],config)


def patch_callback(data,offset):
    folder=Path(__file__).parent/'native';raw=(folder/'world-chest.bin').read_bytes()
    symbols=json.loads((folder/'world-chest-symbols.json').read_text())
    start=0x802243f8;end=0x80224a54
    if len(raw)>end-start:raise ValueError('Chest exceeds retired Roy/Ganon stage code')
    p=offset(start)
    if struct.unpack_from('>I',data,p)[0]!=0x7c0802a6:raise ValueError('Unexpected retired Roy module')
    data[p:p+len(raw)]=raw
    # Young Link's StageData init runs on Retry even when its DAT stays cached.
    struct.pack_into('>I',data,offset(0x803E872C)+12,symbols['world_chest_init'])
    for address,name,first in [(0x802d858c,'world_chest_anim',0x38600000),(0x802d85f4,'world_chest_hit',0x7c0802a6)]:
        p=offset(address)
        if struct.unpack_from('>I',data,p)[0]!=first:raise ValueError('Unexpected native target callback')
        struct.pack_into('>I',data,p,0x48000000|((symbols[name]-address)&0x3fffffc))
