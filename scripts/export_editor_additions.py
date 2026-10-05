"""Export generic editor additions from the same factory and meshes as Dolphin."""
import json
from editor_model_assets import OUT,ROOT,empty,parts
from build_grassland import Dat,iso_table
from functools import lru_cache
from stage_project import added_mechanism
from world_mechanics import moving_mesh,apply_mechanics,retail_fox_bumper_mesh
from build_character_worlds import WORLDS,WorldArt,Mansion,validate_art
from character_routes import apply_routes

@lru_cache(maxsize=1)
def original_fox():
 iso=ROOT/'Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso'
 _,_,rows=iso_table(iso);_,_,offset,size=next(row for row in rows if row[1]=='GrTFx.dat')
 with iso.open('rb') as f:f.seek(offset);return f.read(size)

def export(art):
 result={}
 if art.suffix=='Gw':return result
 for key,kind,width,speed in [('platform','platform',32,0),('bumper','bumper',16,0),('bumper-red','bumper',32,0),('boost','boost',46,5.8),('boost-left','boost',46,-5.8)]:
  a=dict(kind=kind,name=key,x=0,y=0,width=width,dx=0,dy=0,period=240,hold=0,impulseX=speed)
  m=added_mechanism(art,art.mechanisms,a);d=Dat(original_fox()) if kind=='bumper' else empty();model=parts(d,moving_mesh(d,art,m))
  if not model:raise ValueError('Empty addition preview '+art.suffix+' '+key)
  data=dict(poses=[model],period=240,width=width,scaleYWithWidth=kind=='bumper' or kind=='platform' and 'propSkin' in m)
  if kind=='bumper':
   # Original GrTFx branch visibility alternates each game frame.
   data.update(poses=[parts(d,retail_fox_bumper_mesh(d,width,v)) for v in ('yellow','red')],period=2)
  path=OUT/f'{art.suffix}-add-{key}.json';path.write_text(json.dumps(data,separators=(',',':')));result[key]='/editor/data/models/'+path.name
 return result
if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True);catalog={}
 for i,spec in enumerate(WORLDS):
  a=(Mansion(spec,i) if spec[2]=='Lg' else WorldArt(spec,i)).build();apply_routes(a);validate_art(a);apply_mechanics(a)
  catalog[a.suffix]=export(a);print(a.suffix,flush=True)
 (OUT/'additions.json').write_text(json.dumps(catalog))
