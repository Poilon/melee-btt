"""Authoring audit of USA 1.02 movement attributes and attack hitbox scripts.

Movement offsets: HSDLib SBM_CommonFighterAttributes. Hitbox values are native
bone-local offsets/radii, NOT animated world-space reach. No game assets copied.
PyYAML and local HSDLib command definitions are needed only for this audit.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
from build_grassland import Dat, iso_table


def audit(iso, definitions):
    import yaml
    defs={}
    for name in ('command_controls.yml','command_fighter.yml'):
        for c in yaml.safe_load((definitions/name).read_text(encoding='utf-8-sig')):
            bits=6+sum(p['bitCount'] for p in c.get('parameters',[]))
            defs[c['code']]={**c,'length':max(4,bits//8)}
    from build_character_worlds import WORLDS
    _,_,entries=iso_table(iso)
    out={}
    with iso.open('rb') as f:
        for character,_,suffix,*_ in WORLDS:
            name='Pl'+({'Ic':'Pp'}.get(suffix,suffix))+'.dat'
            _,_,off,size=next(e for e in entries if e[1]==name)
            f.seek(off);raw=f.read(size);d=Dat(raw)
            root=next(v for k,v in d.roots.items() if k.startswith('ftData'))
            attr=d.u(root)
            floats={'jumpVelocity':0x40,'airJumpMultiplier':0x50,'gravity':0x5c,
                    'terminalVelocity':0x60,'airSpeed':0x6c,'runSpeed':0x28,'modelScale':0x8c}
            p={key:round(struct.unpack_from('>f',d.data,attr+pos)[0],6) for key,pos in floats.items()}
            p['jumps']=d.u(attr+0x58)
            def apex(v,g):
                y=0
                while v>0:y+=v;v-=g
                return round(y,3)
            p['ballisticJumpApex']=apex(p['jumpVelocity'],p['gravity'])
            p['ballisticAirJumpApex']=apex(p['jumpVelocity']*p['airJumpMultiplier'],p['gravity'])
            p['source']=name;p['sourceSha256']=hashlib.sha256(raw).hexdigest()
            table=d.u(root+12)
            end=min(d.u(pos) for pos in d.reloc if d.u(pos)>table)
            attacks={}
            def parse(pc,seen=None):
                seen=set() if seen is None else seen;hits=[]
                while pc and pc not in seen and pc<len(d.data):
                    seen.add(pc);code=d.data[pc]>>2;c=defs.get(code)
                    if c is None:break
                    n=c['length'];word=int.from_bytes(d.data[pc:pc+n],'big');remaining=n*8-6;values={}
                    for field in c.get('parameters',[]):
                        bits=field['bitCount'];remaining-=bits
                        value=(word>>remaining)&((1<<bits)-1)
                        if field.get('signed') and value&(1<<(bits-1)):value-=1<<bits
                        values[field['name']]=value
                    if code==11:
                        hits.append({'bone':values['Bone'],'radius':values['Size']/256,
                                     'localOffset':[values[k]/256 for k in ('X-Offset','Y-Offset','Z-Offset')]})
                    if code in (5,7):
                        hits.extend(parse(values['Pointer'],seen))
                        if code==7:break
                    if code in (0,6):break
                    pc+=n
                return hits
            for i in range((end-table)//24):
                row=table+i*24;symbol=d.u(row)
                if not symbol:continue
                symbol=d.data[symbol:].split(b'\0')[0].decode('ascii',errors='replace')
                if '_ACTION_Attack' not in symbol:continue
                name=symbol.split('_ACTION_')[1].replace('_figatree','')
                hits=parse(d.u(row+12))
                if hits:
                    attacks[name]={'maxRadius':round(max(h['radius'] for h in hits),4),
                                   'maxBoneLocalOffset':round(max(math.dist(h['localOffset'],(0,0,0)) for h in hits),4),
                                   'hitboxEvents':len(hits)}
            p['attacks']=attacks
            p['character']=character;out[suffix]=p
    return out


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--iso',type=Path,required=True)
    ap.add_argument('--definitions',type=Path,default=Path('build/stage-tools/HSDLib/HSDRawViewer/Scripts'))
    ap.add_argument('--output',type=Path,default=Path('assets/custom-stages/worlds/movement.json'))
    args=ap.parse_args();result=audit(args.iso,args.definitions)
    args.output.write_text(json.dumps({'source':'Melee USA 1.02 / HSDLib command layouts',
      'scope':'Ballistic attributes and bone-local hitbox data; not a full animation or collision simulation.',
      'characters':result},indent=2)+'\n')
    print('Audited',len(result),'fighters:',sum(len(p['attacks']) for p in result.values()),'attack scripts.')
