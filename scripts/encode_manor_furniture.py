"""Import generated transparent furniture; crop alpha and encode native GX RGBA8."""
import hashlib,json
from pathlib import Path
from PIL import Image
from encode_doc_chemicals import rgba8
ROOT=Path(__file__).resolve().parents[1]
def main():
 folder=ROOT/'assets/custom-stages/modular/Lg';image=Image.open(folder/'furniture-atlas.png').convert('RGBA');w,h=image.size
 previous=json.loads((folder/'furniture.json').read_text())['sprites'] if (folder/'furniture.json').exists() else {}
 cells=[('piano',(0,0,700,h)),('fireplace',(700,0,1340,h)),('bed',(1340,0,w,h))];manifest={'sprites':{}}
 for name,box in cells:
  isolated=folder/f'furniture-{name}-source.png'
  cell=Image.open(isolated).convert('RGBA') if isolated.exists() else image.crop(box)
  bbox=cell.getchannel('A').point(lambda a:255 if a>127 else 0).getbbox()
  if not bbox:raise ValueError('Empty furniture '+name)
  sprite=cell.crop(bbox);aspect=previous[name]['aspect'] if isolated.exists() and name in previous else sprite.height/sprite.width
  width=512 if isolated.exists() else 256
  sprite=sprite.resize((width,max(4,round(width*aspect/4)*4)),Image.Resampling.LANCZOS)
  data=rgba8(sprite);file='furniture-'+name+'.rgba8';(folder/file).write_bytes(data);sprite.save(folder/('furniture-'+name+'.png'))
  manifest['sprites'][name]={'file':file,'size':list(sprite.size),'sha256':hashlib.sha256(data).hexdigest(),'aspect':aspect,'sourcePixels':[box[0]+bbox[0],bbox[1],box[0]+bbox[2],bbox[3]]}
 (folder/'furniture.json').write_text(json.dumps(manifest,indent=2)+'\n')
if __name__=='__main__':main()
