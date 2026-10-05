import copy,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from stage_project import validate,apply,ProjectError,projects_from_document
from build_character_worlds import WORLDS,WorldArt,Mansion,validate_art
from character_routes import apply_routes
from world_mechanics import apply_mechanics

def base(s):return json.loads((ROOT/f'web/editor/data/{s}.json').read_text())
def art(s):
 i,spec=next((i,v) for i,v in enumerate(WORLDS) if v[2]==s)
 a=(Mansion(spec,i) if s=='Lg' else WorldArt(spec,i)).build()
 apply_routes(a);validate_art(a);apply_mechanics(a)
 return a
class EditorProjects(unittest.TestCase):
 def test_complete_pack_keeps_all_edits_and_rejects_partial_or_duplicate_packs(self):
  stages={w[2] for w in WORLDS};projects=[base(s)['project'] for s in sorted(stages)]
  pack=dict(format='TTRC_STAGE_PACK',version=1,projects=projects)
  for p in projects:
   if p['stage'] in ('Fx','Mr'):p['targets'][0][0]+=2
  decoded=projects_from_document(pack,stages)
  self.assertEqual(set(decoded),stages)
  for p in projects:self.assertEqual(decoded[p['stage']],p)
  self.assertEqual(set(projects_from_document(projects[0],stages)),{projects[0]['stage']})
  for invalid in [projects[:-1],projects+[projects[0]]]:
   with self.assertRaises(ProjectError):projects_from_document(dict(pack,projects=invalid),stages)
  broken=copy.deepcopy(pack);broken['projects'][0]['revision']='old'
  with self.assertRaises(ProjectError):projects_from_document(broken,stages)

 def test_originals_preserve_native_mechanisms(self):
  for entry in json.loads((ROOT/'web/editor/data/catalog.json').read_text()):
   s=entry['stage'];a=art(s);before=copy.deepcopy(a.mechanisms)
   apply(a,base(s)['project'])
   self.assertEqual(json.loads(json.dumps(a.mechanisms)),json.loads(json.dumps(before)),s)
 def test_invalid_polygon_and_revision_rejected(self):
  b=base('Pk')
  for mutate in [lambda p:p.update(revision='old'),lambda p:p['solids'][0]['points'].reverse(),lambda p:p['solids'].append(copy.deepcopy(p['solids'][0]))]:
   p=copy.deepcopy(b['project']);mutate(p)
   with self.assertRaises(ProjectError):validate(p,b)
 def test_removed_wall_remaps_ledge_flags_without_moving_painting(self):
  a=art('Pk');b=base('Pk');p=copy.deepcopy(b['project']);a.no_lower_ledges={1}
  p['solids'].pop(0);apply(a,p)
  self.assertEqual(a.no_lower_ledges,{0})
  self.assertEqual(list(a.editor_housing_rect),b['housing']['rect'])
 def test_chest_cannot_detach_from_target(self):
  b=base('Cl');p=copy.deepcopy(b['project']);i=next(i for i,m in enumerate(b['mechanisms']) if 'opensTarget' in m)
  p['mechanisms'][i]['x']+=8
  with self.assertRaises(ProjectError):validate(p,b)
  p['targets'][b['mechanisms'][i]['opensTarget']][0]+=8
  validate(p,b)
 def test_added_textured_platform_and_native_bumper_compile(self):
  a=art('Pk');p=base('Pk')['project'];n=len(a.mechanisms)
  for kind in ['platform','bumper']:p['additions'].append(dict(kind=kind,name='Editor object',x=-160,y=70,width=28,dx=36,dy=0,period=240,hold=30))
  apply(a,p)
  self.assertEqual(len(a.mechanisms),n+2)
  self.assertEqual([m['kind'] for m in a.mechanisms[-2:]],['platform','bumper'])
  self.assertEqual(a.mechanisms[-2]['propSkin'],'deck')
  self.assertEqual(a.mechanisms[-2]['textureSource'],'technology')
  self.assertEqual(a.mechanisms[-2]['propRect'][2],28)
 def test_custom_translation_encodes_step_tracks_and_static_clears_animation(self):
  from world_mechanics import animation
  from test_stage_mechanics import archive
  p=base('Pk')['project'];m=p['mechanisms'][0];x,y=m['x'],m['y']
  m['motion']=dict(kind='teleport',keys=[[0,x,y],[195,x+80,y+20],[390,x,y]])
  a=art('Pk');apply(a,p);native=a.mechanisms[0];self.assertEqual(native['dx'],0)
  d=archive();anim=animation(d,native);track=d.u(d.u(anim+8)+8)
  self.assertEqual(d.data[d.u(track+16)]&15,1)
  self.assertTrue(d.u(track))
  m['motion']['kind']='static';a=art('Pk');apply(a,p);d=archive();anim=animation(d,a.mechanisms[0]);self.assertEqual(d.u(anim+8),0)
 def test_boosts_use_original_falcon_texture_and_signed_impulse(self):
  from world_mechanics import moving_mesh
  from test_stage_mechanics import archive
  from unittest.mock import patch
  p=base('Pk')['project']
  for speed in [-5.8,5.8]:p['additions'].append(dict(kind='boost',name='Boost',x=-180,y=20,width=46,dx=0,dy=0,period=240,hold=0,impulseX=speed))
  a=art('Pk');apply(a,p)
  for m in a.mechanisms[-2:]:
   self.assertEqual(m['damage'],0)
   with patch('doc_chemicals.sprite_mesh',return_value=123) as mesh:
    self.assertEqual(moving_mesh(archive(),a,m),123)
    args=mesh.call_args.args;self.assertEqual(args[1].world_assets.name,'Ca');self.assertEqual(args[2],'boost');self.assertEqual(args[3][2],46 if m['impulseX']>0 else -46)
if __name__=='__main__':unittest.main()

class EnemyRoutes(unittest.TestCase):
 def test_zapdos_route_encodes_native_tracks_and_preserves_model_animation_and_damage(self):
  from world_mechanics import animation
  from test_stage_mechanics import archive
  for kind,opcode in [('moving',2),('teleport',1)]:
   b=base('Pk');p=copy.deepcopy(b['project']);m=p['mechanisms'][1];x,y=m['x'],m['y'];m['motion']=dict(kind=kind,keys=[[0,x,y],[240,100,250],[480,x,y]])
   p['additions'].append(dict(m,kind='template',template=1,name='Other Zapdos',width=43))
   a=art('Pk');apply(a,p)
   for n in (a.mechanisms[1],a.mechanisms[-1]):
    self.assertEqual(n['nativeAnimation'],'zapdos');self.assertEqual(n['damage'],11);self.assertEqual(n['editorMotion'],kind);self.assertEqual(n['xKeys'],[(0,x),(240,100),(480,x)])
    d=archive();anim=animation(d,n);track=d.u(d.u(anim+8)+8);self.assertEqual(d.data[d.u(track+16)]&15,opcode);self.assertTrue(d.u(track))
 def test_chest_cannot_detach_from_its_target_with_a_custom_route(self):
  b=base('Cl');p=copy.deepcopy(b['project']);i=next(i for i,m in enumerate(b['mechanisms']) if 'opensTarget' in m);m=p['mechanisms'][i]
  m['motion']=dict(kind='moving',keys=[[0,m['x'],m['y']],[m['period'],m['x'],m['y']]])
  with self.assertRaises(ProjectError):validate(p,b)

class CrossPlatformCatalog(unittest.TestCase):
 def test_libm_roundoff_is_accepted_but_real_route_edits_are_rejected(self):
  a=art('Dk');vine=next(m for m in a.mechanisms if m['kind']=='vine')
  frame,value=vine['angleKeys'][19];vine['angleKeys'][19]=(frame,value+1e-16)
  apply(a,base('Dk')['project'])
  a=art('Dk');vine=next(m for m in a.mechanisms if m['kind']=='vine');frame,value=vine['angleKeys'][19];vine['angleKeys'][19]=(frame,value+.001)
  with self.assertRaisesRegex(ProjectError,'catalog is stale'):apply(a,base('Dk')['project'])

class ShortTargetLoops(unittest.TestCase):
 def test_short_target_cycles_validate_and_encode_the_exact_native_period(self):
  from world_mechanics import target_animation
  from test_stage_mechanics import archive
  import struct
  for kind,opcode in [('moving',2),('teleport',1)]:
   for period in (2,50,59):
    b=base('Ca');p=copy.deepcopy(b['project']);c=p['targetCycles'][0];c.update(kind=kind,period=period);c['keys'][1][0]=period//2;c['keys'][-1][0]=period
    validate(p,b);a=art('Ca');apply(a,p);d=archive();anim=target_animation(d,a.target_cycles[0]);obj=d.u(anim+8)
    self.assertEqual(struct.unpack_from('>f',d.data,obj+4)[0],period)
    track=d.u(obj+8);self.assertEqual(d.data[d.u(track+16)]&15,opcode)
 def test_invalid_target_period_names_the_target_and_setting(self):
  for period in (0,1,50.5,3601):
   b=base('Ca');p=copy.deepcopy(b['project']);p['targetCycles'][0]['period']=period
   with self.assertRaisesRegex(ProjectError,'Target 1: loop length'):validate(p,b)
