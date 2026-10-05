"""Encode generated background layers as GameCube textures (authoring only)."""
import json,hashlib
from pathlib import Path
from PIL import Image
from encode_stage_art import encode_cmpr
from build_character_worlds import WORLDS
ROOT=Path(__file__).resolve().parents[1]
def framing(bounds,size):
 l,t,r,b=bounds;ratio=size[0]/size[1]
 # Cover the authored scene with modest camera margins, preserving the image's
 # proportions. The old 2x vertical padding hid the painted landmarks in game.
 width=max((r-l)*1.12,(t-b)*1.12*ratio);height=width/ratio
 cx=(l+r)/2;cy=(t+b)/2
 return [cx-width/2,cy+height/2,cx+width/2,cy-height/2]
def main():
 for spec in WORLDS:
  suffix=spec[2];folder=ROOT/'assets/custom-stages/modular'/suffix;path=folder/'background.png'
  if not path.exists():continue
  original=ROOT/('assets/custom-stages/manor' if suffix=='Lg' else 'assets/custom-stages/worlds/'+suffix)/'scene.json'
  old=json.loads(original.read_text());image=Image.open(path).convert('RGB');bounds=framing(old['bounds'],image.size)
  if suffix=='Lg':bounds[1]-=90;bounds[3]-=90
  digest=hashlib.sha256(path.read_bytes()).hexdigest();out=folder/'scene.json'
  previous=json.loads(out.read_text()) if out.exists() else {}
  size=(1024,1024) if suffix=='Lg' else (2048,1024)
  if previous.get('sourceSha256')==digest and previous.get('size')==list(size):
   previous['bounds']=bounds;previous['framing']='aspect-fit-v2';out.write_text(json.dumps(previous,indent=2)+'\n');continue
  # Format conversion only. Square artwork retains square sampling.
  image=image.resize(size,Image.Resampling.LANCZOS)
  scene=dict(format='GX_CMPR_1',size=list(size),bounds=bounds,sourceSha256=digest,framing='aspect-fit-v2',tiles=[])
  for y in range(0,size[1],1024):
   for x in range(0,size[0],1024):
    data=encode_cmpr(image.crop((x,y,x+1024,y+1024)));name=f'background-{x//1024}-{y//1024}.cmpr';(folder/name).write_bytes(data)
    scene['tiles'].append(dict(file=name,rect=[x,y,1024,1024],sha256=hashlib.sha256(data).hexdigest()))
  out.write_text(json.dumps(scene,indent=2)+'\n');print(suffix,flush=True)
if __name__=='__main__':main()
