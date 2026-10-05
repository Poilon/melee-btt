"""Authoring-only Collada conversion; retain retail geometry, UVs and skin weights.

Requires pycollada, numpy and Pillow. Inputs are credited local model extracts,
not generated substitutes. Portable builds only read the resulting GX assets.
"""
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'build/custom-stage/python-tools'))
import collada
import numpy as np
from PIL import Image
from encode_doc_chemicals import rgba8

INPUT = ROOT/'build/custom-stage/retail-actors'
OUTPUT = ROOT/'assets/custom-stages/retail-actors'
SOURCES = {
    'plant': ('plant/Piranha Plant/PackunPetit.dae', 'Super Mario Galaxy',
              'https://models.spriters-resource.com/wii/supermariogalaxy/asset/351250/'),
    'ghost': ('boo/Boo/Teresa.dae', 'Super Mario Galaxy',
              'https://models.spriters-resource.com/wii/supermariogalaxy/asset/283810/'),
    'fireball': ('lava-wii/Podoboo/bubbleout.dae', 'New Super Mario Bros. Wii',
                 'https://models.spriters-resource.com/wii/newsupermariobroswii/asset/285313/'),
}


def rotation(axis, angle):
    m=np.eye(4);a,b={'x':(1,2),'y':(2,0),'z':(0,1)}[axis]
    m[a,a]=m[b,b]=math.cos(angle);m[a,b]=-math.sin(angle);m[b,a]=math.sin(angle)
    return m


def bone_motion(kind, name, phase):
    # New idle motions on the original bones. These are not claimed to be
    # animation clips extracted from the original game.
    wave=math.sin(phase)
    if kind=='ghost':
        if name in ('ArmL1','ArmR1'):return rotation('z',math.radians(13)*wave)
        if name=='Tongue1':return rotation('z',math.radians(5)*wave)
        if name=='Tail1':return rotation('y',math.radians(8)*wave)
    if kind=='plant':
        # The source plant's mouth faces straight up in bind pose. Tilt its
        # existing neck toward the play camera, and rotate jaws on their hinge.
        if name=='JawA':return rotation('y',math.radians(12)*(1+wave))
        if name=='JawB':return rotation('y',-math.radians(12)*(1+wave))
        if name=='Head':return rotation('y',math.radians(-50+4*wave))
        if name in ('LeafLeft','LeafRight'):return rotation('z',math.radians(6)*wave)
    return np.eye(4)


def joint_matrices(model, kind, phase):
    result={}
    def walk(n,parent):
        if not isinstance(n,collada.scene.Node):return
        m=parent@n.matrix@bone_motion(kind,n.name,phase)
        for key in (n.id,n.name,n.xmlnode.get('sid')):
            if key:result[key]=m
        for c in n.children:walk(c,m)
    for n in model.scene.nodes:walk(n,np.eye(4))
    return result


def skin_vertices(vertices, skin, matrices):
    if skin is None:return vertices.copy()
    names=skin.weight_joints.data.reshape(-1)
    transforms=[matrices[n]@skin.joint_matrices[n]@skin.bind_shape_matrix for n in names]
    result=np.zeros_like(vertices)
    for i,v in enumerate(vertices):
        for ji,wi in zip(skin.joint_index[i],skin.weight_index[i]):
            result[i]+=(transforms[ji]@np.append(v,1))[:3]*skin.weights.data[wi,0]
    return result


def export(kind):
    relative,game,url=SOURCES[kind];source=INPUT/relative;model=collada.Collada(str(source))
    out=OUTPUT/kind;out.mkdir(parents=True,exist_ok=True)
    count=32 if kind!='fireball' else 1
    skins={s.geometry.id:s for s in model.controllers}
    materials={}
    for n in model.scene.objects('controller'):
        materials[n.skin.geometry.id]=n.materialnodebysymbol
    for n in model.scene.objects('geometry'):
        materials[n.original.id]=n.materialnodebysymbol
    meshes=[];all_positions=[]
    for geometry in model.geometries:
        for primitive in geometry.primitives:
            tri=primitive.triangleset() if hasattr(primitive,'triangleset') else primitive
            poses=[]
            for frame in range(count):
                v=skin_vertices(tri.vertex,skins.get(geometry.id),joint_matrices(model,kind,math.tau*frame/count))
                # Noesis's Wii export looks along +X, with vertical +Z.
                if kind=='fireball':v=v[:,[1,2,0]]
                poses.append(v)
            poses=np.array(poses);all_positions.append(poses.reshape(-1,3))
            material=materials[geometry.id][tri.material].target
            image=source.parent/material.effect.diffuse.sampler.surface.image.path
            uv=tri.texcoordset[0][tri.texcoord_indexset[0]].copy();uv[:,:,1]=1-uv[:,:,1]
            colors=np.ones((*tri.vertex_index.shape,4))
            if 'COLOR' in tri.sources:
                offset,_,_,_,s=tri.sources['COLOR'][0]
                colors=s.data[tri.index[:,:,offset]]
                # Galaxy's TEV material doubles the diffuse vertex/texture term.
                colors=colors.copy();colors[:,:,:3]=np.minimum(1,colors[:,:,:3]*2)
            # The Wii eye draw is a separate, dark material, with real eye mesh.
            if kind=='fireball' and 'eye' in image.stem:colors[:,:,:3]=.055
            meshes.append(dict(poses=poses,indices=tri.vertex_index,uv=uv,colors=colors,image=image))
    all_positions=np.concatenate(all_positions);lo=all_positions.min(0);hi=all_positions.max(0)
    manifest=dict(format='TTRC_RETAIL_MESH_1',game=game,source=url,
                  sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                  poses=count,period=128,meshes=[])
    for i,m in enumerate(meshes):
        positions=m['poses'];positions[:,:,0]=(positions[:,:,0]-(lo[0]+hi[0])/2)/(hi[0]-lo[0])
        positions[:,:,1]=(positions[:,:,1]-hi[1])/(hi[1]-lo[1])
        positions[:,:,2]=(positions[:,:,2]-(lo[2]+hi[2])/2)/(hi[0]-lo[0])
        override=out/'fire-body.png' if kind=='fireball' and i==0 else None
        if override and override.exists():
            # The retail heat-ramp uses nearly constant V. Give the detailed
            # body material a full spherical projection; retain the source mesh.
            points=positions[0,m['indices']]
            m['uv']=np.stack((.5+np.arctan2(points[:,:,0],points[:,:,2])/math.tau,
                              -points[:,:,1]),axis=2)
            normals=points.copy();normals[:,:,1]+=.5
            normals/=np.maximum(np.linalg.norm(normals,axis=2,keepdims=True),1e-6)
            light=np.array([-.3,.6,.75]);light/=np.linalg.norm(light)
            illumination=.68+.32*np.clip(normals@light,0,1)
            m['colors'][:,:,:3]=illumination[:,:,None]
        vertex_data=positions.astype('>f4').tobytes();corners=bytearray()
        # Painter order, because foreground pipe pixels must occlude retraction.
        order=np.argsort(positions[0,m['indices'],2].mean(axis=1))
        for j in order:
            for k,index in enumerate(m['indices'][j]):
                color=np.clip(np.rint(m['colors'][j,k]*255),0,255).astype('uint8')
                corners+=struct.pack('>H2f4B',index,*m['uv'][j,k],*color)
        tex=Image.open(override if override and override.exists() else m['image']).convert('RGBA')
        if override and override.exists():tex=tex.resize((512,512),Image.Resampling.LANCZOS)
        if tex.width%4 or tex.height%4:raise ValueError('Texture must use GX 4x4 blocks')
        files={f'mesh-{i}.vertices':vertex_data,f'mesh-{i}.corners':corners,
               f'mesh-{i}.rgba8':rgba8(tex)}
        for name,data in files.items():(out/name).write_bytes(data)
        manifest['meshes'].append(dict(vertices=len(positions[0]),triangles=len(order),
            textureSize=list(tex.size),originalTexture=m['image'].name,
            originalTextureSha256=hashlib.sha256(m['image'].read_bytes()).hexdigest(),
            files={name:hashlib.sha256(data).hexdigest() for name,data in files.items()}))
        if override and override.exists():
            manifest['meshes'][-1]['textureOverride']=dict(file=override.name,
                sha256=hashlib.sha256(override.read_bytes()).hexdigest(),encodingSize=[512,512],
                uvProjection='spherical')
    (out/'model.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(kind,count,'poses',sum(m['triangles'] for m in manifest['meshes']),'retail triangles')


if __name__=='__main__':
    for kind in SOURCES:export(kind)
