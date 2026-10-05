"""Export authored stage metadata and original artwork for the browser editor."""
import hashlib,json,sys,shutil
from pathlib import Path
from build_character_worlds import WORLDS,WorldArt,Mansion,validate_art
from character_routes import apply_routes
from world_mechanics import apply_mechanics,keyframes
ROOT=Path(__file__).resolve().parents[1]
def compatible_mechanisms(mechanisms):
 # Visual/contact detail additions keep the existing editable anchor schema.
 # Strip only the three known spike vertices when comparing the old barrel.
 result=[]
 for original in mechanisms:
  m={k:v for k,v in original.items() if k not in ('facingKeys','rollRadius','topSpike')}
  if original.get('topSpike'):
   w=m['width'];m['outline']=[p for p in m['outline'] if p[1]<=0 and not (p[1]==0 and .3*w<p[0]<.7*w)]
  result.append(m)
 return result

def export(output):
 output.mkdir(parents=True,exist_ok=True);catalog=[]
 for i,spec in enumerate(WORLDS):
  art=(Mansion(spec,i) if spec[2]=='Lg' else WorldArt(spec,i)).build()
  apply_routes(art);validate_art(art);apply_mechanics(art)
  scene=json.loads((art.world_assets/'scene.json').read_text())
  surfaces=[{'points':getattr(art,'solid_contours',{}).get(j,[[x,y+h],[x+w,y+h],[x+w,y],[x,y]]),'material':mat,'source':j,'asset':f'solid-{j}'} for j,(x,y,w,h,mat) in enumerate(art.solids)]
  project={'format':'TTRC_STAGE_PROJECT','version':1,'stage':art.suffix,'name':art.name,'targets':art.targets,'spawn':art.spawn,'solids':surfaces,'platforms':art.platforms,'mechanisms':[{'base':j,'x':m['x'],'y':m['y'],'dx':m['dx'],'dy':m['dy'],'period':m['period'],'hold':m['hold'],'angle':m['angle']} for j,m in enumerate(art.mechanisms)],'targetCycles':art.target_cycles,'additions':[],'platformAssets':art.platform_skins,'nativeActors':art.native_actor_edits}
  data={'character':art.character,'name':art.name,'stage':art.suffix,'bounds':art.bounds,'artBounds':scene['bounds'],'scale':art.world_scale,'routes':art.route_notes,'movement':art.movement_profile,'mechanisms':art.mechanisms,'sources':getattr(art,'native_source_elements',[]),'pits':art.pits,'painted':not getattr(art,'native_fire',False),'platformCopies':scene.get('platformCopies',[]),'imageSize':scene.get('collisionTracing',scene.get('paintedFloors',{})).get('size',scene['size']),'textureSources':scene.get('collisionTracing',{}).get('surfaces',[]),'project':project,'motionKeys':[{'x':keyframes(m,'x'),'y':keyframes(m,'y')} for m in art.mechanisms]}
  model_catalog=ROOT/'web/editor/data/models/catalog.json'
  if model_catalog.exists():data['modelPreviews']=json.loads(model_catalog.read_text())[art.suffix]
  actor_catalog=ROOT/'web/editor/data/models/actors.json'
  if actor_catalog.exists():data['nativeActorModels']=json.loads(actor_catalog.read_text()).get(art.suffix,{})
  data['pieces']=art.piece_catalog
  for piece in art.piece_catalog:
   if piece.get('sharedTexture'):shutil.copyfile(ROOT/'assets/custom-stages/basic'/piece['sharedTexture']/'texture.png',output/('basic-'+piece['sharedTexture']+'.png'))
   elif piece.get('propTextureStage'):shutil.copyfile(ROOT/'assets/custom-stages/worlds'/piece['propTextureStage']/'prop-deck.png',output/(piece['propTextureStage']+'-platform-deck.png'))
   elif piece.get('sprite'):shutil.copyfile(art.modular_background/f'furniture-{piece["sprite"]}.png',output/f'Lg-furniture-{piece["sprite"]}.png')
  data['modular']=True
  if art.suffix!='Gw':
   bg=art.modular_background
   data['background']='/editor/data/'+art.suffix+'-background.png'
   if (bg/'scene.json').exists():data['backgroundBounds']=json.loads((bg/'scene.json').read_text())['bounds']
   source=bg/('background-hd.png' if (bg/'background-hd.png').exists() else 'background.png')
   if source.exists():shutil.copyfile(source,output/(art.suffix+'-background.png'))
  if getattr(art,'retail_corneria',False):data['shipPreview']={'name':'Corneria Arwing' if art.suffix=='Fx' else 'Star Wolf Wolfen','model':f'/editor/data/models/{art.suffix}-ship.json','anchor':[(art.bounds[0]+art.bounds[2])/2,art.bounds[1]-50]}
  if getattr(art,'retail_corneria',False):data['sources'].append({'name':'Star Wolf · Corneria Wolfen' if art.suffix=='Fc' else 'Corneria Arwings','archive':'GrCn.dat','implementation':'Original textured Wolfen, native flight and laser patterns; hits add 15 damage' if art.suffix=='Fc' else 'Original Corneria Arwing and lasers; alternating high and low passes, starting high, with rideable collision'})
  if getattr(art,'floor_voids',None):data.update(floorVoids=art.floor_voids,voidColor=art.sky)
  if art.suffix=='Gw':data['illustration']=[[[x,y,z,'#'+c[:3].hex()] for x,y,z,c in tri] for tri in getattr(art,'modular_printing',art.triangles)]
  if art.suffix=='Pk':data['housing']={'asset':'solid-'+str(max(range(len(art.solids)),key=lambda j:art.solids[j][3])),'image':'/editor/data/Pk-housing.png','source':[608,347,947,802],'rect':art.solids[max(range(len(art.solids)),key=lambda j:art.solids[j][3])][:4]};shutil.copyfile(art.world_assets/'solid-housing/painted.png',output/'Pk-housing.png')
  revision=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
  previous=output/(art.suffix+'.json')
  if previous.exists():
   old=json.loads(previous.read_text());old_project=dict(old['project']);old_revision=old_project.pop('revision',None)
   # Visual-only updates keep compatible local drafts and shared project files.
   if old_project==json.loads(json.dumps(project)) and all(old.get(k)==json.loads(json.dumps(data.get(k))) for k in ('bounds','scale')) and compatible_mechanisms(old['mechanisms'])==compatible_mechanisms(json.loads(json.dumps(data['mechanisms']))) and set((p['id'],p['kind']) for p in old.get('pieces',[])).issubset((p['id'],p['kind']) for p in data['pieces']):revision=old_revision or revision
  project['revision']=revision
  (output/(art.suffix+'.json')).write_text(json.dumps(data,separators=(',',':'))+'\n')
  source=getattr(art,'painted_scene',None)
  if source:shutil.copyfile(source,output/(art.suffix+'.png'))
  catalog.append({'stage':art.suffix,'name':art.name,'character':art.character,'revision':revision,'image':'/editor/data/'+art.suffix+'.png' if source else None})
 (output/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
 print(f'Exported {len(catalog)} editor stages')
if __name__=='__main__':export(ROOT/'web/editor/data')
