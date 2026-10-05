"""Extract original Melee props; retain source geometry, UVs and GX textures.

Authoring tool. Runtime reads normalized DAT assets using only Python stdlib.
The trophies provide the original models, not their bases or menu backgrounds.
"""
import argparse,bisect,hashlib,json,math,struct
from pathlib import Path
import numpy as np
from build_grassland import Dat,iso_table
from native_mesh_reader import triangles

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/custom-stages/native-props'
CATALOG={
 'topi':('TyToppi.dat',None,None,0),
 'whispy':('TyWwoods.dat',None,None,0),
 'metroid':('TyMetoid.dat',None,None,0),
 'redead':('TyLeaded.dat',None,None,0),
 'ocarina':('TyOcarin.dat',None,None,0),
 'mew':('TyMew.dat',None,None,0),
 'zapdos':('TyThnder.dat',None,None,0),
 'electrode':('TyMarumi.dat',None,None,0),
 'clefairy':('TyPippi.dat',None,None,0),
 'marth-statue':('TyMars.dat',None,None,0),
 'binding-blade':('TyRoy.dat',None,[0x1e818],0),
 # First car's chassis and two wheel joints; exclude its floor shadow.
 'onett-car':('GrOt.dat',3,[0x407b8,0x41378,0x414f8,0x415d8],0),
 # Flat Zone's Tools article (kind 0xe6), first tool, excluding its shadow.
 'flat-tool':('GrFz.dat','itemdata',[0x482b8],0),
}

def srt(d,j):
 rx,ry,rz,sx,sy,sz,x,y,z=struct.unpack_from('>9f',d.data,j+20)
 cx,cy,cz=map(math.cos,(rx,ry,rz));ax,ay,az=map(math.sin,(rx,ry,rz))
 r=np.array([[cy*cz,ax*ay*cz-cx*az,cx*ay*cz+ax*az],
             [cy*az,ax*ay*az+cx*cz,cx*ay*az-ax*cz],[-ay,ax*cy,cx*cy]])
 m=np.eye(4);m[:3,:3]=r@np.diag([sx,sy,sz]);m[:3,3]=[x,y,z];return m

def export(name,raw,filename,group,selected,yaw):
 d=Dat(raw);parts=[]
 if group=='itemdata':
  item=d.u(d.roots['itemdata'])
  if d.u(item)!=0xe6:raise ValueError('Expected Flat Zone Tools article')
  root=d.u(d.u(d.u(item+4)+16))
 else:root=next(iter(d.roots.values())) if group is None else d.u(d.u(d.roots['map_head']+8)+group*52)
 def walk(j,parent):
  while j:
   transform=parent@srt(d,j);obj=d.u(j+16)
   while obj:
    if selected is None or obj in selected:
     ts=triangles(d,obj);converted=[]
     mat=d.u(obj+8);material=d.u(mat+12)
     diffuse=tuple(d.data[material+4:material+8]) if material else (255,255,255,255)
     for tri in ts:
      vs=[]
      for v in tri:
       pos=(transform@np.array([*v[:3],1]))[:3]
       # Bake a soft diffuse term, keeping original texture data untouched.
       color=tuple(min(255,round(v[3][i]*diffuse[i]/255)) for i in range(4))
       vs.append((*pos,color,v[4],v[5]))
      converted.append(vs)
     parts.append((mat,converted))
    obj=d.u(obj+4)
   walk(d.u(j+8),transform);j=d.u(j+12)
 walk(root,np.eye(4))
 # Trophy lighting normally comes from the gallery scene. Bake a soft key
 # light into vertex colours so imported actors retain their volume without
 # depending on lights absent from the target-test stage. Original texture
 # bytes and UV coordinates remain untouched.
 normals={}
 for _,ts in parts:
  for tri in ts:
   xyz=[np.array(v[:3]) for v in tri]
   normal=np.cross(xyz[1]-xyz[0],xyz[2]-xyz[0])
   for v in tri:
    key=tuple(round(float(n),5) for n in v[:3])
    normals[key]=normals.get(key,np.zeros(3))+normal
 light=np.array([-.35,.65,1.]);light/=np.linalg.norm(light)
 for part, (mat,ts) in enumerate(parts):
  source_material=d.u(mat+12)
  opacity=struct.unpack_from('>f',d.data,source_material+12)[0] if source_material else 1.
  texture=d.u(mat+8)
  reflected=texture and (d.u(texture+0x40)&15)==1
  shaded=[]
  for tri in ts:
   vertices=[]
   for v in tri:
    normal=normals[tuple(round(float(n),5) for n in v[:3])]
    length=np.linalg.norm(normal)
    shade=.68+.32*max(0,float(np.dot(normal/length,light))) if length else 1.
    color=tuple(round(channel*shade) for channel in v[3][:3])+(round(v[3][3]*opacity),)
    uv=(.5+.5*normal[0]/length,.5-.5*normal[1]/length) if reflected and length else v[4:6]
    vertices.append((*v[:3],color,*uv))
   shaded.append(vertices)
  parts[part]=(mat,shaded)
 # Draw the transparent shell after the opaque nucleus, within the ordinary
 # stage pass. The authored parent joints are opaque-pass JObjs.
 parts.sort(key=lambda part:any(v[3][3]<240 for tri in part[1] for v in tri))
 points=np.array([v[:3] for _,ts in parts for t in ts for v in t]);lo=points.min(0);hi=points.max(0);span=hi-lo
 if min(span[:2])<.00001:raise ValueError('Degenerate prop '+name)
 # Normalize into x=[0,1], y=[-aspect,0]; one uniform scale preserves shape.
 center=np.array([(lo[0]+hi[0])/2,hi[1],(lo[2]+hi[2])/2]);scale=1/span[0]
 out=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64));cache={}
 cuts=sorted({0,len(d.data),*d.roots.values(),*(d.u(r) for r in d.reloc)})
 ptrs=sorted(d.reloc)
 def copy(p):
  if p in cache:return cache[p]
  end=cuts[bisect.bisect_right(cuts,p)];q=out.buffer(d.data[p:end],32);cache[p]=q
  for r in ptrs[bisect.bisect_left(ptrs,p):bisect.bisect_left(ptrs,end)]:out.pointer(q+r-p,copy(d.u(r)))
  return q
 first=previous=None
 for mat,ts in parts:
  material=copy(mat)
  # Avoid trophy scene lights/specular environment maps; diffuse artwork is
  # supplied by the first original texture and baked material colour.
  translucent=any(v[3][3]<240 for tri in ts for v in tri)
  out.put(material+4,'I',0x4012 if translucent else 0x12)
  tex=out.u(material+8)
  if tex:
   reflected=(out.u(tex+0x40)&15)==1
   out.pointer(tex+4,None);out.put(tex+0x40,'I',0x330010 if translucent and reflected else 0x340010 if translucent else 0x440010)
  out.pointer(material+20,out.buffer(bytes([0x19 if translucent else 0x39,0 if translucent else 127,0,0,1 if translucent else 0,4,5,15,3,4,0,7])))
  for start in range(0,len(ts),1500):
   batch=ts[start:start+1500];dl=bytearray(struct.pack('>BH',0x90,len(batch)*3));vertices=[];ids={}
   for t in batch:
    for v in t:
     pos=(np.array(v[:3])-center)*scale
     vertex=struct.pack('>3f4B2f',*pos,*v[3],v[4],v[5])
     if vertex not in ids:ids[vertex]=len(vertices);vertices.append(vertex)
     index=ids[vertex];dl+=struct.pack('>3H',index,index,index)
   attrs=out.alloc(96)
   for off,kind,count,fmt,stride,data in [
       (0,9,1,4,12,b''.join(v[:12] for v in vertices)),
       (24,11,1,5,4,b''.join(v[12:16] for v in vertices)),
       (48,13,1,4,8,b''.join(v[16:] for v in vertices))]:
    out.put(attrs+off,'IIIIBBHI',kind,3,count,fmt,0,0,stride,0)
    out.pointer(attrs+off+20,out.buffer(data,32))
   out.put(attrs+72,'I',255)
   dl+=bytes(-len(dl)%32);p=out.alloc(24);out.pointer(p+8,attrs);out.put(p+12,'HH',0,len(dl)//32);out.pointer(p+16,out.buffer(dl,32))
   obj=out.alloc(16);out.pointer(obj+8,material);out.pointer(obj+12,p)
   if previous is not None:out.pointer(previous+4,obj)
   else:first=obj
   previous=obj
 from corneria_arwings import add_root
 add_root(out,'model',out.joint(dobj=first))
 data=out.finish();folder=OUT/name;folder.mkdir(parents=True,exist_ok=True);(folder/'model.dat').write_bytes(data)
 manifest=dict(format='TTRC_NATIVE_PROP_1',sourceGame='Super Smash Bros. Melee USA 1.02',sourceArchive=filename,sourceSha256=hashlib.sha256(raw).hexdigest(),mapGroup=group,displayObjects=selected,aspect=float(span[1]/span[0]),depth=float(span[2]/span[0]),sourceBounds=[lo.tolist(),hi.tolist()],triangles=sum(len(t) for _,t in parts),modelSha256=hashlib.sha256(data).hexdigest())
 (folder/'model.json').write_text(json.dumps(manifest,indent=2)+'\n');print(name,len(data),manifest['triangles'],round(manifest['aspect'],3),flush=True)

if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--iso',type=Path,required=True);ap.add_argument('--only',nargs='*');args=ap.parse_args()
 _,_,entries=iso_table(args.iso)
 for name,(filename,group,selected,yaw) in CATALOG.items():
  if args.only and name not in args.only:continue
  e=next(e for e in entries if e[1]==filename)
  with args.iso.open('rb') as f:f.seek(e[2]);raw=f.read(e[3])
  export(name,raw,filename,group,selected,yaw)
