"""Import Corneria's complete native flight drivers, animated aircraft and laser article.

No OBJ conversion or replacement textures: display lists and GX textures stay
byte-identical. Relocated HSD blocks are shared by all ship instances.
"""
import bisect
import hashlib
import struct
from build_grassland import Dat, iso_table

SOURCE = None


def load(iso):
    global SOURCE
    _, _, entries = iso_table(iso)
    e = next(e for e in entries if e[1] == 'GrCn.dat')
    with iso.open('rb') as f:
        f.seek(e[2]); raw = f.read(e[3])
    SOURCE = Dat(raw)
    SOURCE.digest = hashlib.sha256(raw).hexdigest()
    # HSD external-reference chains are file offsets, NOT live pointers. The
    # optional laser material/shape animations are absent in the retail file.
    # Resolve their chains to null before copying the article into another DAT.
    nroot,nref=struct.unpack_from('>2I',SOURCE.header,12)
    for i in range(nroot,nroot+nref):
        p=struct.unpack_from('>I',SOURCE.tail,i*8)[0];seen=set()
        while p not in (0,0xffffffff) and p not in seen:
            seen.add(p);nxt=SOURCE.u(p);SOURCE.put(p,'I',0);p=nxt
    SOURCE.cuts = sorted({0, len(SOURCE.data), *SOURCE.roots.values(),
                          *(SOURCE.u(r) for r in SOURCE.reloc)})
    SOURCE.pointers = sorted(SOURCE.reloc)


def copy_block(d, p):
    if SOURCE is None:
        raise ValueError('Load retail Corneria before building the Arwings')
    if not hasattr(d, 'corneria_blocks'): d.corneria_blocks = {}
    if p in d.corneria_blocks: return d.corneria_blocks[p]
    end = SOURCE.cuts[bisect.bisect_right(SOURCE.cuts, p)]
    q = d.buffer(SOURCE.data[p:end], 32)
    d.corneria_blocks[p] = q
    for r in SOURCE.pointers[bisect.bisect_left(SOURCE.pointers, p):bisect.bisect_left(SOURCE.pointers, end)]:
        d.pointer(q + r - p, copy_block(d, SOURCE.u(r)))
    return q


def add_root(d, name, address):
    nroot,nref=struct.unpack_from('>2I',d.header,12)
    entries=d.tail[:8*(nroot+nref)];strings=d.tail[8*(nroot+nref):]
    for i in range(nroot):
        _,n=struct.unpack_from('>II',entries,8*i)
        if strings[n:].split(b'\0')[0].decode()==name:
            tail=bytearray(d.tail);struct.pack_into('>I',tail,8*i,address)
            d.tail=bytes(tail);d.roots[name]=address;return
    d.tail=entries[:nroot*8]+struct.pack('>II',address,len(strings))+entries[nroot*8:]+strings+name.encode()+b'\0'
    header=bytearray(d.header);struct.pack_into('>I',header,12,nroot+1);d.header=bytes(header)
    d.roots[name]=address



def copy_record(d, address, size):
    out=d.buffer(SOURCE.data[address:address+size],32)
    for r in SOURCE.pointers:
        if address<=r<address+size:d.pointer(out+r-address,copy_block(d,SOURCE.u(r)))
    return out


def merge_collisions(d):
    """Keep retail joint IDs 0..7; the authored stage starts at joint 8."""
    vertices=[];lines=[];groups=[]
    for archive in (SOURCE,d):
        c=archive.roots['coll_data'];vp=archive.u(c);lp=archive.u(c+8);gp=archive.u(c+36)
        vbase=len(vertices);lbase=len(lines);gbase=len(groups)
        vertices += [struct.unpack_from('>2f',archive.data,vp+8*i) for i in range(archive.u(c+4))]
        for i in range(archive.u(c+12)):
            line=list(struct.unpack_from('>6hHBB',archive.data,lp+16*i))
            line[0]+=vbase;line[1]+=vbase
            for j in range(2,6):
                if line[j]>=0:line[j]+=lbase
            lines.append(line+[lbase+i,-1])
        for i in range(archive.u(c+40)):
            p=gp+40*i;ranges=struct.unpack_from('>10h',archive.data,p)
            for start,count in zip(ranges[::2],ranges[1::2]):
                for j in range(start,start+count):lines[lbase+j][10]=gbase+i
            box=struct.unpack_from('>4fhh',archive.data,p+20)
            groups.append((*box[:4],box[4]+vbase,box[5]))
    assert all(row[10]>=0 for row in lines)
    lines.sort(key=lambda row:([1,2,4,8,16].index(row[6]),row[10]))
    remap={row[9]:i for i,row in enumerate(lines)}
    for row in lines:
        for j in range(2,6):row[j]=remap.get(row[j],-1)
    def ranges(group=None):
        result=[]
        for flag in (1,2,4,8,16):
            ids=[i for i,row in enumerate(lines) if row[6]==flag and (group is None or row[10]==group)]
            result += [ids[0] if ids else 0,len(ids)]
        return result
    table=d.alloc(40*len(groups))
    for i,box in enumerate(groups):d.put(table+40*i,'10h4fhh',*ranges(i),*box)
    c=d.roots['coll_data']
    d.pointer(c,d.buffer(b''.join(struct.pack('>2f',*v) for v in vertices)));d.put(c+4,'I',len(vertices))
    d.pointer(c+8,d.buffer(b''.join(struct.pack('>6hHBB',*row[:9]) for row in lines)));d.put(c+12,'I',len(lines))
    d.put(c+16,'10h',*ranges());d.pointer(c+36,table);d.put(c+40,'I',len(groups))


def install(d,scale=1.0,wolfen=False):
    """Host original Corneria flight drivers, animated actors and collision proxies.

    Native IDs 3..18 are preserved; 0..2 become 19..21 because BTT owns 0..2.
    The native factory adapter only remaps those IDs. All per-frame aircraft
    updates, animations, shots and collision activation use retail code. The
    hosted ships face their horizontal travel. Fox repeats the original near
    path high then low, alternating directions; Falco replays a resettable
    native flight/banking/laser sequence isolated from fighter RNG.
    """
    sm=SOURCE.roots['map_head'];sg=SOURCE.u(sm+8)
    m=d.roots['map_head'];old=d.u(m+8);groups=d.alloc(22*52)
    # Preserve all BTT records and their already-scaled anchor joints.
    for i in range(3):
        d.data[groups+52*i:groups+52*(i+1)]=d.data[old+52*i:old+52*(i+1)]
        for r in list(d.reloc):
            if old+52*i<=r<old+52*(i+1):d.pointer(groups+r-old,d.u(r))
    for i in range(3,22):
        source_id=i-19 if i>=19 else i
        if source_id in (1,2,10):
            record=copy_record(d,sg+source_id*52,52)
            d.data[groups+52*i:groups+52*(i+1)]=d.data[record:record+52]
            for r in list(d.reloc):
                if record<=r<record+52:d.pointer(groups+52*i+r-record,d.u(r))
        else:
            # Empty reference origin (3) and retail collision-only proxy nodes.
            # Great Fox scenery, cannons and background controllers are absent.
            d.pointer(groups+52*i,d.joint())
    d.pointer(m+8,groups);d.put(m+12,'I',22)
    # The authored islands follow the eight retail collision islands. Their
    # archive-local joint bindings must use the same relocated island IDs.
    links=d.u(groups+104+32)
    for i in range(d.u(groups+104+36)):
        island=struct.unpack_from('>h',d.data,links+6*i)[0]
        d.put(links+6*i,'h',island+8)
    merge_collisions(d)
    table=d.roots['yakumono_param'];config=d.alloc(16)
    d.put(config,'I',0x434e4152);params=copy_block(d,SOURCE.roots['yakumono_param']);d.pointer(config+4,params)
    d.put(config+8,'I',int(wolfen))
    if wolfen:
        # Original Wolfen animation rig, flight patterns and laser article.
        # Fixed 2.5-second initial/inter-pass waits. The native banking and
        # firing decisions use their own stage-reset sequence in the host.
        d.put(params+0x3c,'4f',150.,150.,150.,150.)
    else:
        # Fox: first dispatch after half a second, then a 0.75–1 second gap.
        # The host plays native near-flight 4 faster and mirrors successive passes.
        d.put(params+0x3c,'4f',30.,30.,45.,60.)
    if not 0.25<=scale<=1.0:raise ValueError('Invalid aircraft scale')
    # Native x70 drives BOTH the animated aircraft and their collision proxies.
    size=struct.unpack_from('>f',d.data,params+0x70)[0]
    d.put(params+0x70,'f',size*scale)
    d.pointer(table,config)
    # Original item article, including all six native states and their animations.
    entries=[];p=d.roots['itemdata']
    while d.u(p):entries.append(d.u(p));p+=4
    out=d.alloc(4*(len(entries)+2))
    for i,entry in enumerate(entries):d.pointer(out+4*i,entry)
    d.pointer(out+4*len(entries),copy_block(d,SOURCE.u(SOURCE.roots['itemdata'])))
    add_root(d,'itemdata',out)


def patch_callback(data,offset):
    from pathlib import Path
    folder=Path(__file__).parent/'native'
    raw=(folder/'world-arwing.bin').read_bytes()
    symbols=__import__('json').loads((folder/'world-arwing-symbols.json').read_text())
    if len(raw)>0x3d0:raise ValueError('Corneria adapter exceeds retired Link/Luigi modules')
    if struct.unpack_from('>I',data,offset(0x80221c14))[0]!=0x7c0802a6:
        raise ValueError('Unexpected retired Luigi module')
    p=offset(0x80221930)
    if struct.unpack_from('>I',data,p)[0]!=0x7c0802a6:raise ValueError('Unexpected retired Link module')
    data[p:p+len(raw)]=raw
    struct.pack_into('>I',data,offset(0x803e89e0),symbols['world_arwing_tick'])
    # This retired Ness target module is unused by every custom StageData.
    table=0x802225d0;fox=offset(0x803e89d8);cn=offset(0x803e1d8c)
    callbacks=data[fox:fox+60]+data[cn+60:cn+380]+data[cn:cn+60]
    assert len(callbacks)==22*20 and len(callbacks)+48<0x2e4
    dest=offset(table);data[dest:dest+len(callbacks)]=callbacks
    # Original Corneria joint bindings; authored island 8 stays static.
    joints=bytes(data[offset(0x803e1d38):offset(0x803e1d38)+48])
    data[dest+440:dest+488]=joints
    for stage in (0x803e8974,0x803e8a34):
        p=offset(stage);struct.pack_into('>I',data,p+4,table)
        struct.pack_into('>I',data,p+12,symbols['world_arwing_init'])
        struct.pack_into('>2I',data,p+44,table+440,8)
    # Preserve the native factory body; adapt its sole model-loader call only.
    matches=[]
    for address in range(0x801dd534,0x801dd620,4):
        word=struct.unpack_from('>I',data,offset(address))[0]
        delta=(0x801c14d0-address)&0x3fffffc
        if word==0x48000001|delta:matches.append(address)
    if len(matches)!=1:raise ValueError('Native Corneria loader call not found')
    address=matches[0]
    struct.pack_into('>I',data,offset(address),0x48000001|((symbols['world_arwing_load']-address)&0x3fffffc))
    address=0x802e838c
    if struct.unpack_from('>I',data,offset(address))[0]!=0x7c0802a6:
        raise ValueError('Unexpected native laser damage callback')
    struct.pack_into('>I',data,offset(address),0x48000000|((symbols['world_arwing_laser_hit']-address)&0x3fffffc))
    # Orient hosted aircraft before the original matrix/collision update and
    # muzzle lookup. Stock stages retain their original behavior.
    for address,expected,symbol in ((0x801df1a0,0x281c0000,'world_arwing_heading'),
                                    (0x801df4fc,0xc022b7f8,'world_arwing_shot_heading'),
                                    (0x801df528,0xc022b7f8,'world_arwing_fox_shot_heading')):
        if struct.unpack_from('>I',data,offset(address))[0]!=expected:
            raise ValueError('Unexpected native aircraft heading instruction')
        struct.pack_into('>I',data,offset(address),0x48000000|((symbols[symbol]-address)&0x3fffffc))

    # Adapt only the initial animation call; the original authored path is
    # played faster by Melee's animation system, including its visibility track.
    calls=[]
    for address in range(0x801de024,0x801de4bc,4):
        expected=0x48000001|((0x801c8138-address)&0x3fffffc)
        if struct.unpack_from('>I',data,offset(address))[0]==expected:calls.append(address)
    if len(calls)!=1:raise ValueError('Native aircraft path start not found')
    address=calls[0]
    struct.pack_into('>I',data,offset(address),0x48000001|((symbols['world_arwing_start_path']-address)&0x3fffffc))

    # Every random call in the retail flight subsystem (reset, scheduler,
    # constructor, banking, laser decisions). The wrappers delegate unchanged
    # on Fox and stock stages; only Falco uses its archive-local reset seed.
    expected_sites={0x801dcdcc,0x801dcdf0,0x801dcf1c,0x801dcf50,
                    0x801dcfe4,0x801dd008,0x801dd14c,0x801dd228,
                    0x801dd314,0x801dd324,0x801debdc,0x801def4c,
                    0x801df318,0x801df36c,0x801df588,0x801df5dc,0x801df6f8}
    random_sites=set()
    for address in range(0x801dccfc,0x801df8cc,4):
        word=struct.unpack_from('>I',data,offset(address))[0]
        for target,symbol in ((0x80380580,'world_arwing_randi'),(0x80380528,'world_arwing_randf')):
            if word==0x48000001|((target-address)&0x3fffffc):
                random_sites.add(address)
                struct.pack_into('>I',data,offset(address),0x48000001|((symbols[symbol]-address)&0x3fffffc))
    if random_sites!=expected_sites:raise ValueError('Unexpected native aircraft random call sites')
