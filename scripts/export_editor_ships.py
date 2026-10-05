"""Export the original Corneria aircraft for read-only editor previews."""
import json,math
from pathlib import Path
import numpy as np
from export_editor_actors import joint_parts,shade_preview
import corneria_arwings as native
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web/editor/data/models'
def main():
 native.load(ROOT/'Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso');d=native.SOURCE
 groups=d.u(d.roots['map_head']+8)
 for suffix,index in [('Fx',2),('Fc',10)]:
  root=d.u(groups+52*index);model=joint_parts(d,root)
  rows=[v for p in model for v in p['vertices']];xyz=np.array([v[:3] for v in rows]);print(suffix,'raw',xyz.min(0),xyz.max(0))
  # Archive model axes: a slight three-quarter view makes wings readable.
  shade_preview(model,math.pi/3)
  xyz=np.array([v[:3] for v in rows]);center=(xyz.min(0)+xyz.max(0))/2
  span=xyz.max(0)-xyz.min(0);scale=.5*(.48 if suffix=='Fx' else .55)/json.loads((ROOT/f'web/editor/data/{suffix}.json').read_text())['scale']
  for v in rows:
   x,y,z=(np.array(v[:3])-center)*scale
   v[:3]=[float(x),float(y*.94-z*.34),float(y*.34+z*.94)]
  (OUT/f'{suffix}-ship.json').write_text(json.dumps(dict(poses=[model],period=120),separators=(',',':')))
if __name__=='__main__':main()
