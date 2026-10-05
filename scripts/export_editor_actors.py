"""Preview native actors from the exact stage/common archive used by Melee."""
import json,struct,math
from pathlib import Path
import numpy as np
from editor_model_assets import OUT,ROOT,parts,vertices,texture
from import_native_world_props import srt
import native_encounters as retail
from build_grassland import Dat
from modular_stage import native_actors

def envelope_matrix(d,envelopes,index,j,matrices,inverse):
 e=d.u(envelopes+4*index);bone=d.u(e)
 weight=struct.unpack_from('>f',d.data,e+4)[0]
 # HSD skips inverse bind for rigid vertices beneath a skeleton root.
 if weight>=1.-1.1920929e-7 and d.u(j+4)&2:return matrices[bone]
 m=np.zeros((4,4));guard=0
 while d.u(e):
  bone=d.u(e);weight=struct.unpack_from('>f',d.data,e+4)[0];m+=weight*(matrices[bone]@inverse[bone]);e+=8;guard+=1
  if guard>64:raise ValueError('Bad envelope')
 return m


def shade_preview(model,yaw):
 # The item engine faces actors along X; the archive bind pose faces Z.
 c,s=math.cos(yaw),math.sin(yaw)
 light=np.array([-.3,.65,1.]);light/=np.linalg.norm(light)
 for part in model:
  rows=part['vertices'];normals={}
  for v in rows:v[0],v[2]=c*v[0]+s*v[2],-s*v[0]+c*v[2]
  for i in range(0,len(rows),3):
   tri=rows[i:i+3];points=[np.array(v[:3]) for v in tri];n=np.cross(points[1]-points[0],points[2]-points[0])
   for v in tri:
    key=tuple(round(float(q),5) for q in v[:3]);normals[key]=normals.get(key,np.zeros(3))+n
  for v in rows:
   n=normals[tuple(round(float(q),5) for q in v[:3])];length=np.linalg.norm(n)
   shade=.6+.4*max(0,float(np.dot(n/length,light))) if length else 1.
   v[3:6]=[q*shade for q in v[3:6]]

def joint_parts(d,root):
 matrices={};inverse={};nodes=[]
 def walk(j,parent):
  while j:
   m=parent@srt(d,j);matrices[j]=m;nodes.append(j);p=d.u(j+56);iv=np.eye(4)
   if p:iv[:3,:]=np.array(struct.unpack_from('>12f',d.data,p)).reshape(3,4)
   inverse[j]=iv;walk(d.u(j+8),m);j=d.u(j+12)
 walk(root,np.eye(4));out=[]
 for j in nodes:
  obj=d.u(j+16)
  while obj:
   mat=d.u(obj+8);p=d.u(obj+12)
   while p:
    envelopes=d.u(p+20) if struct.unpack_from('>H',d.data,p+12)[0]&0x2000 else 0;cache={}
    def transform(pos,index):
     if index not in cache:
      if envelopes:
       m=envelope_matrix(d,envelopes,index,j,matrices,inverse)
      else:m=matrices[j]
      cache[index]=m
     return (cache[index]@np.array([*pos,1]))[:3]
    # Strips/fans share row objects after triangulation. Preview transforms
    # must touch each triangle vertex exactly once, including shared corners.
    vs=[list(v) for v in vertices(d,p,transform)]
    if vs:out.append(dict(vertices=vs,texture=texture(d,d.u(mat+8)) if mat else None))
    p=d.u(p+4)
   obj=d.u(obj+4)
 return out

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--stages',nargs='+',choices=('Ns','Ic','Sk'),default=('Ns','Ic','Sk'))
 args=parser.parse_args()
 from build_character_worlds import WORLDS,WorldArt,validate_art
 from character_routes import apply_routes
 from world_mechanics import apply_mechanics
 retail.load(ROOT/'Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso');all=json.loads((OUT/'actors.json').read_text()) if (OUT/'actors.json').exists() else {}
 for suffix in args.stages:
  index,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]==suffix);a=WorldArt(spec,index).build();apply_routes(a);validate_art(a);apply_mechanics(a);all[suffix]={}
  for kind in {o['kind'] for o in native_actors(a)}:
   if kind=='traffic':
    d=Dat((ROOT/'assets/custom-stages/native-props/onett-car/model.dat').read_bytes());model=parts(d,d.u(d.roots['model']+16))
    for part in model:
     for v in part['vertices']:v[0]*=48;v[1]=v[1]*48+26.5;v[2]*=48
   else:
    if kind==217:
     d=retail.SOURCES['GrIm.dat'].d;article=d.u(d.u(d.roots['itemdata'])+4)
    else:
     d=retail.SOURCES['ItCo.usd'].d;article=d.u(d.u(d.roots['itPublicData']+8)+(kind-43)*4)
    model=joint_parts(d,d.u(d.u(article+16)))
   if suffix=='Ic':shade_preview(model,math.pi/2)
   for part in model:
    for v in part['vertices']:
     v[:3]=[round(float(n/a.world_scale),6) for n in v[:3]]
   name=f'{suffix}-actor-{kind}.json';(OUT/name).write_text(json.dumps(dict(poses=[model],period=120),separators=(',',':')));all[suffix][str(kind)]='/editor/data/models/'+name;print(name,sum(len(p['vertices']) for p in model),flush=True)
 (OUT/'actors.json').write_text(json.dumps(all))
