"""Authoring-only OBJ import of credited Zelda/Star Fox game models.

Preserves source triangles and UVs. Only orientation, uniform normalization
and baked directional lighting change; no replacement/procedural geometry.
Runtime uses the existing validated native textured retail-mesh renderer.
"""
import hashlib
import json
import math
import struct
from collections import defaultdict
from pathlib import Path
import numpy as np
from PIL import Image
from encode_doc_chemicals import rgba8

ROOT=Path(__file__).resolve().parents[1]
INPUT=ROOT/'build/custom-stage/zelda-starfox'
OUTPUT=ROOT/'assets/custom-stages/retail-actors'
SOURCES={
 'arwing':('arwing/SF643D - Arwing/Arwing.obj','Star Fox 64 3D',90),
 'wolfen':('wolfen/SF643D - Wolfen/Wolfen.obj','Star Fox 64 3D',90),
 'beamos':('beamos/Beamos.obj','The Legend of Zelda: Ocarina of Time 3D',0),
 'beam':('beamos/Beamos.obj','The Legend of Zelda: Ocarina of Time 3D',90),
 'octorok':('octorok/Octorok.obj','The Legend of Zelda: Ocarina of Time 3D',70),
 'rock':('octorok/oc_rockball_model/oc_rockball_model.obj','The Legend of Zelda: Ocarina of Time 3D',0),
 'deku':('deku/Deku Baba/Dekubaba.obj','The Legend of Zelda: Ocarina of Time',0),
 'wallmaster':('wallmaster/Floormaster.obj','The Legend of Zelda: Ocarina of Time 3D',0),
 'chest':('chest/Big Treasure Chest/Big Treasure Chest.obj','The Legend of Zelda: Ocarina of Time',0),
}


def read_obj(path):
    vertices=[];uv=[];normals=[];parts=defaultdict(list);materials={};current=None
    for line in path.read_text().splitlines():
        fields=line.split()
        if not fields:continue
        tag,*args=fields
        if tag=='mtllib':
            for row in (path.parent/' '.join(args)).read_text().splitlines():
                f=row.split()
                if not f:continue
                if f[0]=='newmtl':key=' '.join(f[1:]);materials[key]={}
                elif f[0]=='map_Kd':materials[key]['texture']=' '.join(f[1:])
        elif tag=='v':vertices.append(list(map(float,args[:3])))
        elif tag=='vt':uv.append(list(map(float,args[:2])))
        elif tag=='vn':normals.append(list(map(float,args[:3])))
        elif tag=='usemtl':current=' '.join(args)
        elif tag=='f':
            corners=[]
            for item in args:
                ids=item.split('/');counts=[len(vertices),len(uv),len(normals)]
                corners.append(tuple((int(n)-1 if int(n)>0 else counts[i]+int(n)) if n else None for i,n in enumerate(ids)))
            for i in range(1,len(corners)-1):parts[current].append([corners[0],corners[i],corners[i+1]])
    return np.array(vertices),np.array(uv),np.array(normals),parts,materials


def export(kind):
    relative,game,yaw=SOURCES[kind];path=INPUT/relative
    positions,uv,normals,parts,materials=read_obj(path)
    if kind in ('beamos','beam'):
        parts={name:tris for name,tris in parts.items() if (name=='material1')==(kind=='beam')}
        if kind=='beamos':
            # Open the original upper/lower head pieces around the eye plane.
            # The OBJ bind pose closes these over the original iris material.
            for name,dy in [('material2_003',380),('material2_002',-280)]:
                ids=sorted({v[0] for tri in parts[name] for v in tri})
                positions[ids,1]+=dy
    a=math.radians(yaw);rotation=np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]])
    positions=positions@rotation.T
    if len(normals):normals=normals@rotation.T
    used=sorted({v[0] for tris in parts.values() for tri in tris for v in tri})
    lo=positions[used].min(0);hi=positions[used].max(0);span=hi-lo
    positions[:,0]=(positions[:,0]-(lo[0]+hi[0])/2)/span[0]
    positions[:,1]=(positions[:,1]-hi[1])/span[1]
    positions[:,2]=(positions[:,2]-(lo[2]+hi[2])/2)/span[0]
    folder=OUTPUT/kind;folder.mkdir(parents=True,exist_ok=True)
    provenance=json.loads((INPUT/relative.split('/')[0]/'source.json').read_text())
    manifest=dict(format='TTRC_RETAIL_MESH_1',game=game,source=provenance['source'],
        sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),poses=1,period=360,
        aspect=float(span[1]/span[0]),orientationYaw=yaw,wrap=1,meshes=[])
    for material,tris in parts.items():
        texture=materials[material].get('texture')
        if not texture:raise ValueError('Untextured original material '+material)
        image=path.parent/texture
        # Exporter typo: this is the supplied original logo atlas, not new art.
        if not image.exists() and texture=='ArLogos_1.png':image=path.parent/'ArLogos.png'
        tex=Image.open(image).convert('RGBA')
        # A 68-unit ship occupies under 512 pixels in the playable camera.
        # Keep the complete original atlas while fitting Melee's archive budget.
        if max(tex.size)>512:
            scale=512/max(tex.size)
            tex=tex.resize((round(tex.width*scale),round(tex.height*scale)),Image.Resampling.LANCZOS)
        if tex.width%4 or tex.height%4:
            tex=tex.resize((max(4,math.ceil(tex.width/4)*4),max(4,math.ceil(tex.height/4)*4)))
        indices=sorted({v[0] for tri in tris for v in tri});mapping={v:i for i,v in enumerate(indices)}
        corners=bytearray();light=np.array([-.3,.65,.7]);light/=np.linalg.norm(light)
        for tri in tris:
            for v in tri:
                vi,ti=v[:2];ni=v[2] if len(v)>2 else None
                shade=.8 if ni is None else .72+.28*max(0,float(normals[ni]@light))
                if kind=='beam':shade=1
                c=round(255*shade);u,t=uv[ti]
                corners+=struct.pack('>H2f4B',mapping[vi],u,1-t,c,c,c,255)
        i=len(manifest['meshes']);files={f'mesh-{i}.corners':corners,
            f'mesh-{i}.vertices':positions[indices].astype('>f4').tobytes(),f'mesh-{i}.rgba8':rgba8(tex)}
        for name,data in files.items():(folder/name).write_bytes(data)
        manifest['meshes'].append(dict(vertices=len(indices),triangles=len(tris),textureSize=list(tex.size),
            originalTexture=image.name,originalTextureSha256=hashlib.sha256(image.read_bytes()).hexdigest(),
            files={name:hashlib.sha256(data).hexdigest() for name,data in files.items()}))
    (folder/'model.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(kind,'aspect',round(manifest['aspect'],3),'triangles',sum(m['triangles'] for m in manifest['meshes']))


if __name__=='__main__':
    for kind in SOURCES:export(kind)
