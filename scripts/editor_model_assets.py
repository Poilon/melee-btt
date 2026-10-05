"""Export native textured meshes for the editor's WebGL preview.
GX texture layout reference: Dolphin TextureDecoder_Generic.cpp.
This is format decoding, not replacement artwork or reconstructed models.
"""
import json,struct,hashlib,math
from pathlib import Path
from PIL import Image
from build_grassland import Dat
from native_mesh_reader import attributes
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web/editor/data/models'

def rgb565(n):return ((n>>11)*255//31,((n>>5)&63)*255//63,(n&31)*255//31,255)
def rgb5a3(n):return (((n>>10)&31)*255//31,((n>>5)&31)*255//31,(n&31)*255//31,255) if n&32768 else (((n>>8)&15)*17,((n>>4)&15)*17,(n&15)*17,((n>>12)&7)*255//7)
def decode(raw,w,h,fmt,palette=None,palformat=0):
 image=Image.new('RGBA',(w,h));px=image.load();offset=0
 def pal(i):
  n=struct.unpack_from('>H',palette,i*2)[0]
  return rgb565(n) if palformat==1 else rgb5a3(n) if palformat==2 else (n&255,)*3+(n>>8,)
 bw,bh={0:(8,8),1:(8,4),2:(8,4),3:(4,4),4:(4,4),5:(4,4),6:(4,4),8:(8,8),9:(8,4),10:(4,4),14:(8,8)}[fmt]
 for by in range(0,h,bh):
  for bx in range(0,w,bw):
   if fmt==14:
    for yy,xx in [(0,0),(0,4),(4,0),(4,4)]:
     a,b,bits=struct.unpack_from('>HHI',raw,offset);offset+=8;ca,cb=rgb565(a),rgb565(b)
     colors=[ca,cb,tuple((2*x+y)//3 for x,y in zip(ca,cb)),tuple((x+2*y)//3 for x,y in zip(ca,cb))] if a>b else [ca,cb,tuple((x+y)//2 for x,y in zip(ca[:3],cb[:3]))+(255,),tuple((x+y)//2 for x,y in zip(ca[:3],cb[:3]))+(0,)]
     for j in range(16):
      x,y=bx+xx+j%4,by+yy+j//4
      if x<w and y<h:px[x,y]=colors[(bits>>(30-j*2))&3]
    continue
   size=32 if fmt in (0,1,2,3,4,5,8,9,10) else 64;tile=raw[offset:offset+size];offset+=size
   for j in range(bw*bh):
    if fmt in (0,8):v=(tile[j//2]>>(4 if j%2==0 else 0))&15;c=(v*17,)*4 if fmt==0 else pal(v)
    elif fmt==1:c=(tile[j],)*4
    elif fmt==2:v=tile[j];c=((v&15)*17,)*3+((v>>4)*17,)
    elif fmt in (3,4,5,10):
     v=struct.unpack_from('>H',tile,j*2)[0];c=(v&255,)*3+(v>>8,) if fmt==3 else rgb565(v) if fmt==4 else rgb5a3(v) if fmt==5 else pal(v&16383)
    elif fmt==9:c=pal(tile[j])
    else:c=(tile[j*2+1],tile[32+j*2],tile[33+j*2],tile[j*2])
    x,y=bx+j%bw,by+j//bw
    if x<w and y<h:px[x,y]=c
 return image

def texture(d,tex):
 if not tex:return None
 p=d.u(tex+0x4c)
 if not p:return None
 w,h,fmt=struct.unpack_from('>HHI',d.data,p+4);start=d.u(p);pal=d.u(tex+0x50)
 palette=d.data[d.u(pal):] if pal else None;palformat=d.u(pal+4) if pal else 0
 bw,bh,block={0:(8,8,32),1:(8,4,32),2:(8,4,32),3:(4,4,32),4:(4,4,32),5:(4,4,32),6:(4,4,64),8:(8,8,32),9:(8,4,32),10:(4,4,32),14:(8,8,32)}[fmt]
 size=((w+bw-1)//bw)*((h+bh-1)//bh)*block
 raw=d.data[start:start+size];digest=hashlib.sha256(raw+struct.pack('>3I',w,h,fmt)+(bytes(palette[:32768]) if palette else b'')).hexdigest()[:20]
 path=OUT/(digest+'.png')
 if not path.exists():decode(raw,w,h,fmt,palette,palformat).save(path)
 return {'url':'/editor/data/models/'+path.name,'wrap':[d.u(tex+0x34),d.u(tex+0x38)]}

def vertices(d,p,transform=None):
 attrs=attributes(d,p);start=d.u(p+16);end=start+struct.unpack_from('>H',d.data,p+14)[0]*32;cur=start;result=[]
 while cur<end:
  op=d.data[cur];cur+=1
  if not op:continue
  primitive=op&248
  if primitive not in (128,144,152,160):raise ValueError(f'Unsupported primitive {primitive}')
  n=struct.unpack_from('>H',d.data,cur)[0];cur+=2;vs=[]
  for i in range(n):
   pos=[0,0,0];uv=[0,0];col=[255]*4;matrix=0
   for kind,mode,count,fmt,frac,_,stride,array in attrs:
    if kind==0 and mode==1:matrix=d.data[cur]//3;cur+=1;continue
    if mode==1:addr=cur
    else:
     index=d.data[cur] if mode==2 else struct.unpack_from('>H',d.data,cur)[0];cur+=1 if mode==2 else 2;addr=array+index*stride
    if kind in (9,13):
     nn=3 if kind==9 else 2;code={0:'B',1:'b',2:'H',3:'h',4:'f'}[fmt];values=struct.unpack_from('>'+code*nn,d.data,addr);div=1 if fmt==4 else 2**frac;values=[v/div for v in values]
     if kind==9:pos=values
     else:uv=values
     if mode==1:cur+=struct.calcsize('>'+code*nn)
    elif kind==11:
     if fmt==5:col=list(d.data[addr:addr+4]);length=4
     elif fmt==0:col=rgb565(struct.unpack_from('>H',d.data,addr)[0]);length=2
     elif fmt==3:
      packed=struct.unpack_from('>H',d.data,addr)[0];col=[((packed>>shift)&15)*17 for shift in (12,8,4,0)];length=2
     else:raise ValueError('Unsupported vertex color '+str(fmt))
     if mode==1:cur+=length
    elif mode==1:raise ValueError('Unknown direct attribute '+str(kind))
   if transform is not None:pos=list(transform(pos,matrix))
   vs.append(pos+[v/255 for v in col]+uv)
  if primitive==144:result+=vs
  elif primitive==128:
   for i in range(0,n,4):result.extend([vs[i],vs[i+1],vs[i+2],vs[i],vs[i+2],vs[i+3]])
  elif primitive==152:
   for i in range(2,n):result.extend([vs[i-2],vs[i-1],vs[i]] if i%2==0 else [vs[i-1],vs[i-2],vs[i]])
  else:
   for i in range(2,n):result.extend([vs[0],vs[i-1],vs[i]])
 return result

def parts(d,obj):
 result=[]
 while obj:
  mat=d.u(obj+8);p=d.u(obj+12);tex=texture(d,d.u(mat+8)) if mat else None
  while p:
   v=vertices(d,p)
   if v:result.append(dict(vertices=[[round(n,6) for n in row] for row in v],texture=tex))
   p=d.u(p+4)
  obj=d.u(obj+4)
 return result

def empty():return Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
def export(art):
 from world_mechanics import moving_mesh
 from retail_actors import models
 OUT.mkdir(parents=True,exist_ok=True);manifest=[]
 for i,m in enumerate(art.mechanisms):
  poses=[];local=empty();period=128
  if m.get('entity'):
   roots,period=models(local,m['entity'])
   for root in roots:
    ps=parts(local,root)
    for part in ps:
     for v in part['vertices']:
      v[0]=m['width']/2+v[0]*m['width']*(-1 if m.get('flipX') else 1);v[1]=v[1]*m['height']*(-1 if m.get('flipY') else 1)-(m['height'] if m.get('flipY') else 0);v[2]*=m['width']
    poses.append(ps)
  elif m.get('nativeProp'):
   local=Dat((ROOT/'assets/custom-stages/native-props'/m['nativeProp']/'model.dat').read_bytes());spec=json.loads((ROOT/'assets/custom-stages/native-props'/m['nativeProp']/'model.json').read_text())
   ps=parts(local,local.u(local.roots['model']+16));yaw=m.get('yaw',0)
   for part in ps:
    for v in part['vertices']:
     x,z=v[0]*m['width'],v[2]*m['width'];v[0]=m['width']/2+(x*math.cos(yaw)+z*math.sin(yaw))*(-1 if m.get('flipX') else 1);v[1]*=m['height']/spec['aspect'];v[2]=-x*math.sin(yaw)+z*math.cos(yaw)
   poses=[ps]
  else:
   obj=moving_mesh(local,art,m);poses=[parts(local,obj)] if obj else []
  if not poses:raise ValueError('No model preview: '+art.suffix+' '+m['name'])
  preview=dict(poses=poses,period=period)
  if m.get('rollRadius'):preview['rolling']={'radius':m['rollRadius'],'pivot':[m['width']/2,-m['height']/2]}
  if m.get('facingKeys'):preview['facing']={'keys':m['facingKeys'],'period':m['period'],'pivot':[m['width']/2,-m['height']/2]}
  path=OUT/f'{art.suffix}-{i}.json';path.write_text(json.dumps(preview,separators=(',',':')))
  manifest.append('/editor/data/models/'+path.name)
 return manifest

if __name__=='__main__':
 from build_character_worlds import WORLDS,WorldArt,Mansion,validate_art
 from character_routes import apply_routes
 from world_mechanics import apply_mechanics
 all={}
 for i,spec in enumerate(WORLDS):
  a=(Mansion(spec,i) if spec[2]=='Lg' else WorldArt(spec,i)).build();apply_routes(a);validate_art(a);apply_mechanics(a)
  all[a.suffix]=export(a);print(a.suffix,len(all[a.suffix]),flush=True)
 (OUT/'catalog.json').write_text(json.dumps(all))
