"""Authoring import: split transparent atlases, crop alpha bounds, encode GX RGBA8.

No segmentation or background painting here: preserve the generated alpha.
Pillow/numpy are only needed for asset preparation, never for player builds.
"""
import hashlib
import json
from pathlib import Path
from encode_doc_chemicals import rgba8
from world_props import PROPS

ROOT=Path(__file__).resolve().parents[1]/'assets/custom-stages'

# Castle's tall shutters occupy a larger final row than its two deck rows.
BOXES={'nature':[(0,0,768,340),(768,0,1536,340),(0,340,768,680),(768,340,1536,680),(0,680,768,1024),(768,680,1536,1024)],
       'technology':[(0,0,768,340),(768,0,1536,340),(0,340,768,680),(768,340,1536,680),(0,680,768,1024),(768,680,1536,1024)],
       'castle':[(0,0,768,275),(768,0,1536,275),(0,275,768,505),(768,275,1536,505),(0,505,768,1024),(768,505,1536,1024)]}


def main():
    from PIL import Image
    for suffix,(atlas,index) in PROPS.items():
        directory=ROOT/'worlds'/suffix
        refs={'gate' if suffix=='Lk' else 'deck':(atlas,index)}
        if suffix=='Ms': refs['gate']=('castle',5)
        manifest={'sprites':{}}
        for name,(atlas,index) in refs.items():
            path=ROOT/'mechanisms'/('technology-v2.png' if atlas=='technology' else atlas+'.png')
            image=Image.open(path).convert('RGBA'); box=BOXES[atlas][index]
            cell=image.crop(box)
            opaque=cell.getchannel('A').point(lambda a:255 if a>127 else 0)
            bbox=opaque.getbbox()
            if not bbox:raise ValueError('Empty sprite '+suffix+'/'+name)
            sprite=cell.crop(bbox)
            w,h=sprite.size
            # Central walking tread, excluding hanging ropes and decorative ends.
            # All intended platforms have a horizontal rim across their center.
            alpha=sprite.getchannel('A')
            rows=[next(y for y in range(h) if alpha.getpixel((x,y))>127)
                  for x in range(w//4,3*w//4)]
            walking=sorted(rows)[len(rows)//2]
            size=(128,256) if name=='gate' else (384,max(32,round(h/w*384/4)*4))
            sprite=sprite.resize(size,Image.Resampling.LANCZOS)
            data=rgba8(sprite);filename='prop-'+name+'.rgba8'
            (directory/filename).write_bytes(data)
            sprite.save(directory/('prop-'+name+'.png'))
            manifest['sprites'][name]=dict(file=filename,size=size,sha256=hashlib.sha256(data).hexdigest(),
                sourceAtlas=atlas,sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                sourcePixels=[box[0]+bbox[0],box[1]+bbox[1],box[0]+bbox[2],box[1]+bbox[3]],
                aspect=h/w,walkingInset=walking/h)
        (directory/'props.json').write_text(json.dumps(manifest,indent=2)+'\n')
    from encode_world_hazards import main as encode_hazards
    encode_hazards()

if __name__=='__main__':main()
