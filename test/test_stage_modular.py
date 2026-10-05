import copy,json,struct,unittest
from test_stage_project import art,base
from test_stage_mechanics import archive
from modular_stage import painted_polygons,catalog,box,texture_strips
from stage_project import apply,validate,ProjectError

class ModularTerrain(unittest.TestCase):
 def test_alpha_balconies_keep_the_walking_row_at_collision_height(self):
  from unittest.mock import patch
  from modular_stage import mesh
  from doc_chemicals import sprite_mesh
  for suffix in ('Kb','Pe','Pr'):
   a=art(suffix);seen=[]
   def capture(d,owner,key,rectangle,**kwargs):
    seen.append(rectangle);return sprite_mesh(d,owner,key,rectangle,**kwargs)
   with patch('doc_chemicals.sprite_mesh',side_effect=capture):mesh(archive(),a)
   self.assertEqual(len(seen),len(a.platforms))
   for (x,y,w,_),rectangle,skin in zip(a.platforms,seen,[p for p in a.piece_catalog if p.get('propTextureStage')]):
    self.assertAlmostEqual(rectangle[1]-skin['walkingInset']*rectangle[3],y)
    self.assertEqual(rectangle[0],x);self.assertEqual(rectangle[2],w)
    
    for actual,expected in zip(box(skin['points']),[x,rectangle[1],x+w,rectangle[1]-rectangle[3]]):self.assertAlmostEqual(actual,expected)
 def test_repaired_fascia_repeat_clean_source_without_moving_collision(self):
  for suffix,indices in {'Mr':[5,7],'Fc':[1,2,3,4,5],'Mt':[4,5,8,10],'Fe':[6],'Dr':[5]}.items():
   a=art(suffix);pieces={p['id']:p for p in catalog(a)};clean=pieces['platform-0']['sourceRect']
   for i in indices:
    p=pieces[f'platform-{i}'];x,y,w,_=a.platforms[i]
    self.assertEqual(p['sourceRect'],clean);self.assertEqual(p['textureWidth'],clean[2]-clean[0])
    self.assertEqual(p['points'][:2],[[x,y],[x+w,y]])
 def test_all_26_worlds_have_movable_textured_pieces_at_original_collisions(self):
  from build_character_worlds import WORLDS
  for spec in WORLDS:
   a=art(spec[2]);b=base(spec[2]);self.assertTrue(b['modular']);self.assertEqual(len(b['pieces']),len(a.solids)+len(a.platforms)+2)
   self.assertEqual(len(b['project']['platformAssets']),len(a.platforms))
   if spec[2]!='Gw':self.assertTrue((a.modular_background/'scene.json').exists())
   for i,poly in enumerate(b['project']['solids']):self.assertEqual(poly['points'],b['pieces'][i]['points'])
 def test_school_texture_moves_exactly_with_its_collision_without_uv_drift(self):
  a=art('Ns');school=next(p for p in catalog(a) if 'Elementary' in p['name'])
  def decode(poly):
   d=archive();obj=painted_polygons(d,a.world_assets,[(poly,school['sourceRect'])]);rows=[]
   while obj:
    p=d.u(obj+12);q=d.u(p+16);n=struct.unpack_from('>H',d.data,q+1)[0]
    rows.extend(struct.unpack_from('>5f',d.data,q+3+i*20) for i in range(n));obj=d.u(obj+4)
   return rows
  old=decode(school['points']);new=decode([[x+24,y+36] for x,y in school['points']]);self.assertTrue(old);self.assertEqual(len(old),len(new))
  for u,v in zip(old,new):
   self.assertAlmostEqual(v[0]-u[0],24,places=4);self.assertAlmostEqual(v[1]-u[1],36,places=4);self.assertEqual(u[2:],v[2:])
 def test_duplicate_block_keeps_texture_and_remove_has_no_ghost_collision(self):
  a=art('Ns');b=base('Ns');p=copy.deepcopy(b['project']);s=copy.deepcopy(p['solids'][2]);s.pop('source');s['points']=[[x-600,y+90] for x,y in s['points']];p['solids'].append(s);apply(a,p)
  self.assertEqual(a.terrain_skins[-1],'solid-2');self.assertEqual(box(a.solid_contours[len(a.solids)-1]),box(s['points']))
  p['solids'].pop(2);a=art('Ns');apply(a,p);self.assertEqual(len(a.solids),len(b['project']['solids']))
 def test_unknown_texture_and_unpaired_platform_assets_are_rejected(self):
  b=base('Ns')
  for f in [lambda p:p['solids'][0].update(asset='../private'),lambda p:p['platformAssets'].pop(),lambda p:p['platformAssets'].__setitem__(0,'solid-0')]:
   p=copy.deepcopy(b['project']);f(p)
   with self.assertRaises(ProjectError):validate(p,b)
 def test_native_enemy_duplicate_retains_model_attack_and_animation(self):
  b=base('Lg');i=next(i for i,m in enumerate(b['mechanisms']) if m.get('entity')=='ghost');m=b['mechanisms'][i];p=copy.deepcopy(b['project'])
  p['additions'].append(dict(kind='template',template=i,name='Second Boo',x=m['x']+40,y=m['y']+20,width=m['width'],dx=m['dx'],dy=m['dy'],period=m['period'],hold=m['hold']))
  a=art('Lg');apply(a,p);new=a.mechanisms[-1]
  self.assertEqual(new['entity'],'ghost');self.assertEqual(new['kind'],m['kind']);self.assertEqual(new.get('damage'),m.get('damage'));self.assertEqual(new['x'],m['x']+40)
 def test_native_spawns_move_and_duplicate_without_substituting_actor_kind(self):
  b=base('Ic');p=copy.deepcopy(b['project']);p['nativeActors'][0]['x']=36;p['nativeActors'].append(dict(p['nativeActors'][0],x=70))
  a=art('Ic');apply(a,p);self.assertEqual(a.native_actor_edits,p['nativeActors']);self.assertEqual([r['kind'] for r in a.native_actor_edits],[46,46,217,46])
  p['nativeActors'][0]['kind']=999
  with self.assertRaises(ProjectError):validate(p,b)
 def test_traffic_stays_one_native_lane(self):
  b=base('Ns');p=copy.deepcopy(b['project']);p['nativeActors'][0]['x']=45;p['nativeActors'][0]['y']+=10
  a=art('Ns');apply(a,p);self.assertEqual(a.native_actor_edits,p['nativeActors'])
  p['nativeActors']=[]
  with self.assertRaises(ProjectError):validate(p,b)
 def test_boost_cannot_bypass_validation_as_a_template(self):
  b=base('Ca');i=next(i for i,m in enumerate(b['mechanisms']) if m['kind']=='boost');m=b['mechanisms'][i];p=copy.deepcopy(b['project'])
  p['additions'].append(dict(kind='template',template=i,name='Invalid boost clone',x=m['x'],y=m['y'],width=m['width'],dx=20,dy=0,period=m['period'],hold=m['hold']))
  with self.assertRaises(ProjectError):validate(p,b)
 def test_added_platform_preview_matches_native_mesh_when_resized(self):
  from editor_model_assets import empty,parts
  from stage_project import added_mechanism
  from world_mechanics import moving_mesh
  from pathlib import Path
  for suffix in ('Pk','Lg','Ns'):
   a=art(suffix);model=json.loads((Path(__file__).resolve().parents[1]/f'web/editor/data/models/{suffix}-add-platform.json').read_text())
   for width in (16,64):
    m=added_mechanism(a,a.mechanisms,dict(kind='platform',name='Test',x=0,y=0,width=width,dx=40,dy=0,period=240,hold=30))
    d=empty();native=parts(d,moving_mesh(d,a,m));self.assertEqual(len(native),len(model['poses'][0]))
    for actual,preview in zip(native,model['poses'][0]):
     self.assertEqual(actual['texture'],preview['texture']);self.assertEqual(len(actual['vertices']),len(preview['vertices']))
     for row,v in zip(actual['vertices'],preview['vertices']):
      self.assertAlmostEqual(row[0],v[0]*width/model['width'],places=4)
      self.assertAlmostEqual(row[1],v[1]*(width/model['width'] if model['scaleYWithWidth'] else 1),places=4)
      self.assertEqual(row[3:],v[3:])
if __name__=='__main__':unittest.main()



class TextureRepetition(unittest.TestCase):
 def test_widening_a_sloped_block_repeats_texels_and_keeps_vertical_mapping(self):
  a=art('Mt');skin=catalog(a)[0];l,t,r,b=skin['sourceRect'];width=r-l
  poly=[[l,t],[l+width*2.4,t+20],[l+width*2.7,b],[l,b]]
  d=archive();obj=painted_polygons(d,a.world_assets,[(poly,skin['sourceRect'],width)]);rows=[]
  while obj:
   p=d.u(obj+12);q=d.u(p+16);n=struct.unpack_from('>H',d.data,q+1)[0]
   rows.extend(struct.unpack_from('>5f',d.data,q+3+i*20) for i in range(n));obj=d.u(obj+4)
  self.assertTrue(rows)
  # Clipped triangles include all continuous reflection boundaries.
  for x in (l+a for a,_,_,_ in texture_strips(width*2.7,width)[1:]):self.assertTrue(any(abs(v[0]-x)<.0001 for v in rows))
  self.assertTrue(all(l-.001<=v[0]<=l+width*2.7+.001 and b-.001<=v[1]<=t+20+.001 for v in rows))
 def test_texture_extensions_keep_density_continuous_joins_and_single_end_caps(self):
  for width in (18.59938208,100,687.5):
   for factor in (1,1.01,1.6,2,2.7,9.13):
    strips=texture_strips(width*factor,width)
    self.assertAlmostEqual(strips[0][0],0);self.assertAlmostEqual(strips[-1][1],width*factor)
    self.assertAlmostEqual(strips[0][2],0);self.assertAlmostEqual(strips[-1][3],1)
    for a,b,u,v in strips:
     self.assertGreater(b,a);self.assertAlmostEqual(b-a,abs(v-u)*width)
     self.assertGreaterEqual(min(u,v),0);self.assertLessEqual(max(u,v),1)
    for prev,nxt in zip(strips,strips[1:]):
     self.assertAlmostEqual(prev[1],nxt[0]);self.assertAlmostEqual(prev[3],nxt[2])
    for _,_,u,v in strips[1:-1]:
     self.assertGreaterEqual(min(u,v),.15-1e-9);self.assertLessEqual(max(u,v),.85+1e-9)
 def test_manor_furniture_has_full_sprites_below_unchanged_walkable_tops(self):
  a=art('Lg');pieces=catalog(a)
  for i,name in [(20,'fireplace'),(21,'piano'),(22,'bed')]:
   skin=next(p for p in pieces if p['id']==f'platform-{i}')
   self.assertEqual(skin['sprite'],name);self.assertGreater(skin['height'],15)
   self.assertAlmostEqual(skin['points'][0][1],a.platforms[i][1])

class PlantOcclusion(unittest.TestCase):
 def test_occluder_uses_current_edited_foreground_and_has_no_deleted_ghost_pipe(self):
  from modular_stage import actor_occluders
  from unittest.mock import patch
  a=art('Mr');b=base('Mr');p=copy.deepcopy(b['project']);pipe=copy.deepcopy(p['solids'][8]);pipe.pop('source');pipe['points']=[[x+600,y+20] for x,y in pipe['points']];p['solids'].append(pipe)
  # Inspect the final edited geometry passed to the native texture mapper.
  apply(a,p)
  with patch('modular_stage.painted_polygons',return_value=123) as paint:
   self.assertEqual(actor_occluders(archive(),a),123)
   draws=paint.call_args.args[2];self.assertEqual(draws[-1][0],pipe['points']);self.assertEqual(len(draws),len(p['solids']))
  a.solids=[];a.solid_contours={};a.terrain_skins=[]
  self.assertIsNone(actor_occluders(archive(),a))
 def test_explicit_fox_bumper_color_survives_resize_and_invalid_colors_fail(self):
  from stage_project import added_mechanism
  b=base('Pk')
  for color in ('red','yellow'):
   for width in (12,48):
    p=copy.deepcopy(b['project']);o=dict(kind='bumper',variant=color,name='Fox bumper',x=-180,y=20,width=width,dx=0,dy=0,period=240,hold=0);p['additions']=[o]
    validate(p,b);self.assertEqual(added_mechanism(art('Pk'),b['mechanisms'],o)['variant'],color)
  p['additions'][0]['variant']='blue'
  with self.assertRaises(ProjectError):validate(p,b)

class SharedBlocks(unittest.TestCase):
 def test_every_stage_accepts_basic_blocks_without_replacing_existing_terrain(self):
  from build_character_worlds import WORLDS
  from modular_stage import mesh,rect
  for spec in WORLDS:
   suffix=spec[2];a=art(suffix);b=base(suffix);p=copy.deepcopy(b['project'])
   self.assertEqual({x['id'] for x in b['pieces'] if x['id'].startswith('basic-')},{'basic-brick','basic-wood'})
   p['solids'].append(dict(asset='basic-brick',points=rect(800,800,950,730),material=4))
   p['platforms'].append([800,700,150,2]);p['platformAssets'].append('basic-wood')
   apply(a,p);d=archive();self.assertTrue(mesh(d,a))
   self.assertTrue(any('basic/brick' in key[0] for key in d.texture_pixels))
   self.assertTrue(any('basic/wood' in key[0] for key in d.texture_pixels))
 def test_rectangular_bumper_mesh_and_contact_outline_keep_independent_axes(self):
  from export_editor_additions import original_fox
  from build_grassland import Dat
  from editor_model_assets import parts
  from world_mechanics import retail_fox_bumper_mesh,bumper_outline
  for variant in ('red','yellow'):
   d=Dat(original_fox());square=parts(d,retail_fox_bumper_mesh(d,32,variant));d=Dat(original_fox());wide=parts(d,retail_fox_bumper_mesh(d,80,variant,12))
   for a,b in zip(square[0]['vertices'],wide[0]['vertices']):
    self.assertAlmostEqual(b[0],a[0]*2.5,places=4);self.assertAlmostEqual(b[1],a[1]*12/32,places=4)
   self.assertEqual(bumper_outline(80,12),[(0,0),(80,0),(80,-12),(0,-12)])
   xy={(v[0],v[1]) for v in wide[0]['vertices']}
   self.assertTrue({(0,0),(80,0),(80,-12),(0,-12)}<=xy)
  b=base('Fx');p=copy.deepcopy(b['project']);p['additions']=[dict(kind='bumper',name='Rectangle',x=0,y=150,width=80,height=12,dx=0,dy=0,period=240,hold=0)]
  self.assertEqual(validate(p,b)['additions'][0]['height'],12)
  for size in (.5,2,400,401,800,2400):
   p['additions'][0].update(width=size,height=size);validate(p,b)
  for value in (0,-1,float('nan'),float('inf')):
   p['additions'][0]['height']=value
   with self.assertRaises(ProjectError):validate(p,b)
