"""Encode the roster's painted stage images for the native GameCube renderer."""
import argparse
import hashlib
import json
from pathlib import Path
from encode_stage_art import encode_cmpr

ROOT=Path(__file__).resolve().parents[1]/'assets/custom-stages/worlds'


def encode_world(record):
    from PIL import Image
    directory=ROOT/record['suffix'];path=directory/'painted.png'
    source=Image.open(path).convert('RGB')
    bounds=record.get('textureBounds',record['bounds'])
    left,top,right,bottom=bounds;aspect=(right-left)/(top-bottom)
    # Keep texel density sensible for long racetracks and vertical towers.
    width,height=(2048,1024) if aspect>=1.7 else (1024,2048) if aspect<.7 else (2048,2048)
    source_hash=hashlib.sha256(path.read_bytes()).hexdigest()
    dest=directory/'scene.json'
    if dest.exists():
        previous=json.loads(dest.read_text())
        if previous.get('sourceSha256')==source_hash and previous['bounds']==bounds and all(previous.get(k)==record.get(k) for k in ('collisionTracing','platformCopies','paintedPits')):
            if all((directory/t['file']).exists() and hashlib.sha256((directory/t['file']).read_bytes()).hexdigest()==t['sha256'] for t in previous['tiles']):return
    image=source.resize((width,height),Image.Resampling.LANCZOS)
    scene={'format':'GX_CMPR_1','size':[width,height],'bounds':bounds,
           'sourceSha256':source_hash,'tiles':[]}
    if 'collisionTracing' in record:
        if record['collisionTracing']['sourceSha256']!=source_hash:
            raise ValueError('Re-trace the new artwork before encoding: '+record['suffix'])
        scene['collisionTracing']=record['collisionTracing']
    if 'platformCopies' in record:scene['platformCopies']=record['platformCopies']
    if 'paintedPits' in record:scene['paintedPits']=record['paintedPits']
    for y in range(0,height,1024):
        for x in range(0,width,1024):
            data=encode_cmpr(image.crop((x,y,x+1024,y+1024)))
            name=f'scene-{y//1024}-{x//1024}.cmpr';(directory/name).write_bytes(data)
            scene['tiles'].append({'file':name,'rect':[x,y,1024,1024],'sha256':hashlib.sha256(data).hexdigest()})
    dest.write_text(json.dumps(scene,indent=2)+'\n')


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--available',action='store_true');args=ap.parse_args()
    for record in json.loads((ROOT/'art-direction.json').read_text()):
        if args.available and not (ROOT/record['suffix']/'painted.png').exists():continue
        encode_world(record);print('Encoded',record['character'],flush=True)
