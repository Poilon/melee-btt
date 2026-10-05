"""Decode the rigid GX primitives used by Melee trophies and stage props."""
import struct

def attributes(d,p):
    out=[];a=d.u(p+8)
    while True:
        row=struct.unpack_from('>IIIIBBHI',d.data,a);a+=24
        if row[0]==255:return out
        out.append(row)


def triangles(d,dobj):
    """Decode indexed rigid triangle strips/fans/quads to XYZ, RGBA, UV."""
    result=[];p=d.u(dobj+12)
    while p:
        attrs=attributes(d,p);start=d.u(p+16);end=start+struct.unpack_from('>H',d.data,p+14)[0]*32
        cursor=start
        while cursor<end:
            op=d.data[cursor];cursor+=1
            if op==0:continue
            primitive=op&0xf8
            if primitive not in (0x80,0x90,0x98,0xa0):raise ValueError(f'Unsupported GX primitive {op:x}')
            n=struct.unpack_from('>H',d.data,cursor)[0];cursor+=2;vs=[]
            for _ in range(n):
                pos=None;color=(255,255,255,255);uv=(0.,0.)
                for kind,mode,count,fmt,frac,_,stride,array in attrs:
                    if mode==1 and kind==11:
                        raw=struct.unpack_from('>H',d.data,cursor)[0];cursor+=2;color=(((raw>>11)&31)*255//31,((raw>>5)&63)*255//63,(raw&31)*255//31,255);continue
                    if mode not in (2,3):raise ValueError('Expected retail indexed vertex data')
                    index=d.data[cursor] if mode==2 else struct.unpack_from('>H',d.data,cursor)[0]
                    cursor+=1 if mode==2 else 2;offset=array+index*stride
                    if kind in (9,13):
                        size=3 if kind==9 else 2
                        if fmt==4:values=struct.unpack_from('>'+str(size)+'f',d.data,offset)
                        elif fmt in (0,1):values=tuple(v/(1<<frac) for v in struct.unpack_from('>'+str(size)+('B' if fmt==0 else 'b'),d.data,offset))
                        elif fmt==3:values=tuple(v/(1<<frac) for v in struct.unpack_from('>'+str(size)+'h',d.data,offset))
                        else:raise ValueError('Unexpected retail coordinate format')
                        if kind==9:pos=values
                        else:uv=values
                    elif kind==11:
                        if fmt==5:color=tuple(d.data[offset:offset+4])
                        else:raise ValueError('Unexpected retail colour format')
                if pos is None:raise ValueError('Vertex without position')
                vs.append((*pos,color,*uv))
            if primitive==0x90:result.extend(tuple(vs[i:i+3]) for i in range(0,n,3))
            elif primitive==0x80:
                for i in range(0,n,4):result.extend(((vs[i],vs[i+1],vs[i+2]),(vs[i],vs[i+2],vs[i+3])))
            elif primitive==0x98:
                result.extend((vs[i-2],vs[i-1],vs[i]) if i%2==0 else (vs[i-1],vs[i-2],vs[i]) for i in range(2,n))
            else:result.extend((vs[0],vs[i-1],vs[i]) for i in range(2,n))
        p=d.u(p+4)
    return result


