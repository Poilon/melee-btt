"""Convert the two generated shared textures to portable GX texture assets."""
import hashlib,json
from pathlib import Path
from PIL import Image
from encode_stage_art import encode_cmpr
ROOT=Path(__file__).resolve().parents[1]
def main():
 for key,size,bounds in [('brick',(256,256),[0,0,64,-64]),('wood',(512,128),[0,0,64,-8]),('manor-floor',(512,128),[0,0,64,-8])]:
  folder=ROOT/'assets/custom-stages/basic'/key
  image=Image.open(folder/'source.png').convert('RGB').resize(size,Image.Resampling.LANCZOS)
  image.save(folder/'texture.png');raw=encode_cmpr(image);(folder/'texture.cmpr').write_bytes(raw)
  (folder/'scene.json').write_text(json.dumps(dict(format='GX_CMPR_1',size=size,bounds=bounds,tiles=[dict(file='texture.cmpr',rect=[0,0,*size],sha256=hashlib.sha256(raw).hexdigest())]),indent=2)+'\n')
if __name__=='__main__':main()
