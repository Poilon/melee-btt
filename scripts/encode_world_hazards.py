"""Crop supplied transparent sprites and encode native GX texture data."""
import hashlib,json
from pathlib import Path
from encode_doc_chemicals import rgba8
ROOT=Path(__file__).resolve().parents[1]/'assets/custom-stages'
SOURCES={'Ys':('hazard-pod.png',None),'Fc':('hazard-piston.png',None),
         'Dk':('hazards.png',(770,0,1536,549)),
         'Ca':('hazards.png',(730,552,1536,1024))}

def main():
 from PIL import Image
 for s,(name,box) in SOURCES.items():
  path=ROOT/'mechanisms'/name;im=Image.open(path).convert('RGBA')
  cell=im.crop(box) if box else im
  bbox=cell.getchannel('A').point(lambda a:255 if a>127 else 0).getbbox()
  if bbox is None:raise ValueError('Empty hazard image')
  crop=cell.crop(bbox);w,h=crop.size
  size=(256,max(32,round(h/w*256/4)*4));crop=crop.resize(size,Image.Resampling.LANCZOS)
  data=rgba8(crop);directory=ROOT/'worlds'/s
  (directory/'prop-hazard.rgba8').write_bytes(data);crop.save(directory/'prop-hazard.png')
  manifest=directory/'props.json';m=json.loads(manifest.read_text()) if manifest.exists() else {'sprites':{}}
  m['sprites']['hazard']=dict(file='prop-hazard.rgba8',size=size,sha256=hashlib.sha256(data).hexdigest(),
   sourceAtlas=name,sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
   sourcePixels=[bbox[0]+(box[0] if box else 0),bbox[1]+(box[1] if box else 0),bbox[2]+(box[0] if box else 0),bbox[3]+(box[1] if box else 0)],aspect=h/w)
  manifest.write_text(json.dumps(m,indent=2)+'\n')
if __name__=='__main__':main()
