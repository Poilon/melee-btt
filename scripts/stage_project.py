"""Validate browser projects and apply only allowlisted authored-stage edits."""
import copy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ProjectError(ValueError):pass

def projects_from_document(document,stages):
 """Validate the whole pack before the builder writes any stage archives."""
 if document is None:return {}
 packed=isinstance(document,dict) and document.get('format')=='TTRC_STAGE_PACK'
 if packed:
  if document.get('version')!=1 or not isinstance(document.get('projects'),list):raise ProjectError('Invalid level pack')
  projects=document['projects']
 else:projects=[document]
 result={}
 for project in projects:
  if not isinstance(project,dict) or project.get('stage') not in stages:raise ProjectError('Unknown editor stage')
  stage=project['stage']
  if stage in result:raise ProjectError('Duplicate stage: '+stage)
  base=json.loads((ROOT/'web/editor/data'/f'{stage}.json').read_text())
  try:result[stage]=validate(project,base)
  except ProjectError as error:raise ProjectError(f'{base["character"]}: {error}') from error
 if packed and set(result)!=set(stages):raise ProjectError('The level pack must contain every character')
 return result

def number(v,lo=-2000,hi=2000):
 if isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v) or not lo<=v<=hi:raise ProjectError(f'Expected a number between {lo} and {hi}')
 return v

def point(p):
 if not isinstance(p,list) or len(p)!=2:raise ProjectError('Expected an X/Y point')
 return [number(v) for v in p]

def same_authored(a,b):
 # Windows and Linux libm differ by a few ulps on sine/cosine tracks.
 # Compare numbers well below GX float32 precision, but retain every key,
 # list position and nonnumeric value so real stale catalogs still fail.
 if isinstance(a,(list,tuple)) and isinstance(b,(list,tuple)):
  return len(a)==len(b) and all(same_authored(x,y) for x,y in zip(a,b))
 if isinstance(a,dict) and isinstance(b,dict):
  return a.keys()==b.keys() and all(same_authored(a[k],b[k]) for k in a)
 if type(a) in (int,float) and type(b) in (int,float):
  return math.isclose(a,b,rel_tol=0,abs_tol=1e-9)
 return type(a) is type(b) and a==b

def validate(p,base):
 if not isinstance(p,dict) or p.get('format')!='TTRC_STAGE_PROJECT' or p.get('version')!=1:raise ProjectError('Unsupported stage project')
 if p.get('stage')!=base['stage'] or p.get('revision')!=base['project']['revision']:raise ProjectError('This project uses another stage revision. Export a backup and reopen its original stage.')
 if not isinstance(p.get('name'),str) or not 1<=len(p['name'].strip())<=80 or any(ord(c)<32 for c in p['name']):raise ProjectError('Use a project name of 1–80 characters')
 for key,limit in [('targets',10),('solids',64),('platforms',128),('mechanisms',10),('targetCycles',10),('additions',10)]:
  if not isinstance(p.get(key),list) or len(p[key])>limit:raise ProjectError('Too many or invalid '+key)
 if len(p['targets'])!=10:raise ProjectError('Target Test needs exactly ten targets')
 p=copy.deepcopy(p);p['spawn']=point(p['spawn'])
 actors=p.get('nativeActors',[])
 allowed={a['kind'] for a in base['project'].get('nativeActors',[])}
 if not isinstance(actors,list) or len(actors)>16:raise ProjectError('At most 16 native actors')
 if p['stage']=='Ns' and (len(actors)!=1 or not isinstance(actors[0],dict) or actors[0].get('kind')!='traffic'):raise ProjectError('Keep one native traffic lane')
 for a in actors:
  if not isinstance(a,dict) or a.get('kind') not in allowed:raise ProjectError('Unsupported native actor')
  number(a.get('x'),-1500,1500);number(a.get('y'),-1500,1500)
  if not isinstance(a.get('name'),str) or len(a['name'])>80:raise ProjectError('Invalid actor name')
 assets={a['id']:a for a in base.get('pieces',[])}
 if base.get('modular'):
  skins=p.get('platformAssets')
  if not isinstance(skins,list) or len(skins)!=len(p['platforms']) or any(k not in assets or assets[k]['kind']!='platform' for k in skins):raise ProjectError('Every platform needs a valid texture asset')
  if any(s.get('asset') not in assets or assets[s['asset']]['kind']!='solid' for s in p['solids']):raise ProjectError('Every solid needs a valid texture asset')
 p['targets']=[point(t) for t in p['targets']]
 from solid_readability import triangulate,cross
 sources=set()
 for s in p['solids']:
  if not isinstance(s,dict) or not isinstance(s.get('points'),list) or not 4<=len(s['points'])<=24:raise ProjectError('A solid needs 4–24 vertices')
  source=s.get('source')
  if source is not None:
   if type(source)!=int or source not in range(len(base['project']['solids'])) or source in sources:raise ProjectError('Invalid or duplicate original wall reference')
   sources.add(source)
  s['points']=[point(v) for v in s['points']];number(s.get('material'),0,31)
  poly=s['points'];area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1]))
  if area>=-1:raise ProjectError('Solid vertices must form a clockwise outline with positive area')
  for i,(a,b) in enumerate(zip(poly,poly[1:]+poly[:1])):
   if math.dist(a,b)<.05:raise ProjectError('A solid edge is too short')
   for j in range(i+2,len(poly)):
    if i==0 and j==len(poly)-1:continue
    c,d=poly[j],poly[(j+1)%len(poly)]
    if cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0:raise ProjectError('Solid outlines cannot cross themselves')
  try:triangulate(poly)
  except ValueError:raise ProjectError('Solid outline cannot be triangulated')
 for f in p['platforms']:
  if not isinstance(f,list) or len(f)!=4:raise ProjectError('Invalid platform')
  number(f[0]);number(f[1]);number(f[2],2,800);number(f[3],0,31)
 if len(p['mechanisms'])!=len(base['mechanisms']):raise ProjectError('Keep the original mechanisms; their native callbacks depend on their order')
 for i,m in enumerate(p['mechanisms']):
  if m.get('base')!=i:raise ProjectError('Mechanism order changed')
  for k in ('x','y','dx','dy'):number(m.get(k),-1500,1500)
  number(m.get('period'),60,3600);number(m.get('hold'),0,m['period']//4);number(m.get('angle'),-180,180)
  if any(not isinstance(m[k],int) for k in ('period','hold')):raise ProjectError('Motion timing uses whole frames')
 for m in p['additions']:
  if m.get('kind') not in ('platform','bumper','boost','template'):raise ProjectError('Unsupported added object')
  if 'height' in m:
   if m['kind']!='bumper':raise ProjectError('Only bumpers support independent height')
   if number(m['height'],0,math.inf)<=0:raise ProjectError('Bumper height must be greater than zero')
  if 'variant' in m and (m['kind']!='bumper' or m['variant'] not in ('yellow','red')):raise ProjectError('Invalid bumper color')
  if m['kind']=='template':
   j=m.get('template')
   if type(j)!=int or j not in range(len(base['mechanisms'])) or 'opensTarget' in base['mechanisms'][j] or base['mechanisms'][j]['kind']=='boost':raise ProjectError('Invalid native object template')
  for k in ('x','y','dx','dy'):number(m.get(k),-1500,1500)
  if m['kind']=='bumper':
   if number(m.get('width'),0,math.inf)<=0:raise ProjectError('Bumper width must be greater than zero')
  else:number(m.get('width'),4,800 if m['kind'] in ('platform','template') else 160)
  number(m.get('period'),60,3600);number(m.get('hold'),0,m['period']//4)
  if not isinstance(m['period'],int) or not isinstance(m['hold'],int):raise ProjectError('Motion timing uses whole frames')
  if not isinstance(m.get('name'),str) or len(m['name'])>80:raise ProjectError('Invalid object name')
  if m['kind']=='platform' and not base['textureSources'] and p['stage']!='Lg':raise ProjectError('This stage has no painted platform source')
 if len(p['mechanisms'])+len(p['additions'])>10:raise ProjectError('This stage supports at most 10 authored mechanism groups')
 boosts=[]
 for m,kind in [(m,base['mechanisms'][i]['kind']) for i,m in enumerate(p['mechanisms'])]+[(m,base['mechanisms'][m['template']]['kind'] if m['kind']=='template' else m['kind']) for m in p['additions']]:
  if kind=='boost':
   boosts.append(m)
   if m['dx'] or m['dy'] or m.get('angle') or m.get('motion'):raise ProjectError('Boosts must remain stationary')
   if 'impulseX' in m:number(abs(number(m['impulseX'],-12,12)),1,12)
   elif 'kind' in m:raise ProjectError('A new boost needs a direction and speed')
  c=m.get('motion')
  if c is None:continue
  if kind not in ('platform','bumper','decoration','fire','gate','lava','trampoline','vine') or not isinstance(c,dict) or c.get('kind') not in ('static','moving','teleport'):raise ProjectError('Invalid object motion')
  keys=c.get('keys');prev=-1
  if not isinstance(keys,list) or not 2<=len(keys)<=65:raise ProjectError('Use 2–65 object stops')
  for k in keys:
   if not isinstance(k,list) or len(k)!=3 or type(k[0])!=int or not prev<k[0]<=m['period']:raise ProjectError('Object stops need increasing whole-frame times')
   prev=k[0];point(k[1:])
  if keys[0]!=[0,m['x'],m['y']] or keys[-1]!=[m['period'],m['x'],m['y']]:raise ProjectError('Object loops must start and finish at their position')
 if boosts and p['stage'] in ('Ns','Ic','Sk'):raise ProjectError('This stage uses a native actor descriptor and cannot also host speed boosts')
 if len(boosts)>8:raise ProjectError('At most eight speed boosts are supported')
 seen=set()
 for c in p['targetCycles']:
  i=c.get('target');period=c.get('period');keys=c.get('keys')
  if type(i)!=int or i not in range(10) or i in seen:raise ProjectError('Invalid or duplicate animated target')
  seen.add(i);label=f'Target {i+1}'
  if type(period)!=int or not 2<=period<=3600:raise ProjectError(f'{label}: loop length must be a whole number from 2 to 3600 frames (currently {period})')
  if c.get('kind') not in ('moving','teleport'):raise ProjectError(f'{label}: choose Moving or Teleporting')
  if not isinstance(keys,list) or not 2<=len(keys)<=65:raise ProjectError(f'{label}: use 2–65 keyframes, including the start and end')
  prev=-1
  for k in keys:
   if not isinstance(k,list) or len(k)!=3 or type(k[0])!=int or not prev<k[0]<=period:raise ProjectError(f'{label}: keyframes need increasing whole-frame times from 0 to {period}')
   prev=k[0];point(k[1:])
  if keys[0]!=[0,*p['targets'][i]] or keys[-1]!=[period,*p['targets'][i]]:raise ProjectError(f'{label}: the loop must begin and end at its target position')
 for m,e in [(m,p['mechanisms'][i]) for i,m in enumerate(base['mechanisms'])]+[(base['mechanisms'][e['template']],e) for e in p['additions'] if e['kind']=='template']:
  if m.get('opensTarget') is not None:
   if e.get('motion'):raise ProjectError('Chest motion must stay linked to its target')
   t=m['opensTarget']
   if any(abs(p['targets'][t][axis]-base['project']['targets'][t][axis]-(e[key]-m[key]))>.001 for axis,key in enumerate(('x','y'))) or any(c['target']==t for c in p['targetCycles']):raise ProjectError('The chest and its target must move together without a target animation')
  for key in ('xKeys','yKeys','angleKeys','scaleX','scaleY','blink','facingKeys'):
   if key in m and (not e.get('motion') or key in ('scaleX','scaleY','blink','facingKeys')):
    frames=[round(k[0]*e['period']/m['period']) for k in m[key]]
    if any(b<=a for a,b in zip(frames,frames[1:])):raise ProjectError('This loop is too short to preserve the original keyframes')
  if m['kind']=='boost' and any(e[k]!=m[k] for k in ('dx','dy')):raise ProjectError('Speed boost contact zones must remain stationary')
 return p

def apply(art,p):
 base=json.loads((ROOT/'web/editor/data'/f'{art.suffix}.json').read_text());p=validate(p,base)
 # Fail closed when the editor data has not been re-exported after a route edit.
 if not same_authored(art.targets,base['project']['targets']) or not same_authored(art.mechanisms,base['mechanisms']):raise ProjectError('Editor catalog is stale; regenerate it before building')
 art.targets=p['targets'];art.spawn=p['spawn'];art.name=p['name'];art.native_actor_edits=p.get('nativeActors',[])
 art.editor_housing_rect=None
 if base.get('modular'):
  art.terrain_skins=[s['asset'] for s in p['solids']]
  art.platform_skins=p['platformAssets']
  if art.suffix=='Pk':
   for s in p['solids']:
    if s['asset']==base['housing']['asset']:
     from modular_stage import box
     l,t,r,b=box(s['points']);art.editor_housing_rect=[l,b,r-l,t-b];break
 else:art.editor_housing_rect=base.get('housing',{}).get('rect')
 old_ledges=getattr(art,'no_lower_ledges',set())
 art.no_lower_ledges={i for i,s in enumerate(p['solids']) if s.get('source') in old_ledges}
 art.solids=[];art.solid_contours={}
 for i,s in enumerate(p['solids']):
  pts=s['points'];xs=[v[0] for v in pts];ys=[v[1] for v in pts]
  art.solids.append((min(xs),min(ys),max(xs)-min(xs),max(ys)-min(ys),int(s['material'])))
  art.solid_contours[i]=pts
 art.platforms=p['platforms'];art.target_cycles=p['targetCycles']
 for m,edit in zip(art.mechanisms,p['mechanisms']):
  old=copy.deepcopy(m);ratio=edit['period']/old['period']
  for k in ('x','y','dx','dy','period','hold','angle'):m[k]=edit[k]
  for axis in ('x','y'):
   key=axis+'Keys'
   if key in old:m[key]=[(round(t*ratio),v+(edit[axis]-old[axis])) for t,v in old[key]]
  for key in ('angleKeys','scaleX','scaleY','blink','facingKeys'):
   if key in old:m[key]=[(round(t*ratio),v) for t,v in old[key]]
  # Exact authored trajectories remain exact unless a custom motion is selected.
  apply_motion(m,edit)
  if m['kind']=='boost' and 'impulseX' in edit:
   m['impulseX']=edit['impulseX'];w=m['width'];m['propRect']=[w if m['impulseX']<0 else 0,7,-w if m['impulseX']<0 else w,7]
 for a in p['additions']:
  if a['kind']=='template':
   m=copy.deepcopy(base['mechanisms'][a['template']]);dx=a['x']-m['x'];dy=a['y']-m['y']
   ratio=a['period']/m['period'];m.update(x=a['x'],y=a['y'],name=a['name'],dx=a['dx'],dy=a['dy'],period=a['period'],hold=a['hold'])
   for key in ('angleKeys','scaleX','scaleY','blink','facingKeys'):
    if key in m:m[key]=[[round(f*ratio),v] for f,v in m[key]]
   for axis,delta in [('x',dx),('y',dy)]:
    if axis+'Keys' in m:m[axis+'Keys']=[[round(f*ratio),v+delta] for f,v in m[axis+'Keys']]
   apply_motion(m,a)
   art.mechanisms.append(m);continue
  art.mechanisms.append(added_mechanism(art,base['mechanisms'],a))
 if getattr(art,'wind',None) and any(m['kind']=='boost' for m in art.mechanisms):raise ProjectError('This native wind stage cannot also use boost zones')
 from solid_readability import inside
 for i,pt in enumerate(art.targets):
  if any(inside(pt,s['points']) for s in p['solids']):raise ProjectError(f'Target {i+1} is inside a solid wall')
 for cycle in art.target_cycles:
  samples=[k[1:] for k in cycle['keys']]
  if cycle['kind']=='moving':samples += [[a[1]+(b[1]-a[1])*t/32,a[2]+(b[2]-a[2])*t/32] for a,b in zip(cycle['keys'],cycle['keys'][1:]) for t in range(33)]
  if any(inside(pt,s['points']) for pt in samples for s in p['solids']):raise ProjectError(f'Target {cycle["target"]+1} enters a solid wall')
 if any(inside(art.spawn,s['points']) for s in p['solids']):raise ProjectError('Spawn is inside a solid wall')
 l,t,r,b=base['artBounds']
 for pt in art.targets+[art.spawn]:
  if not l<pt[0]<r or not b<pt[1]<t:raise ProjectError('Keep targets and spawn inside the illustrated stage')
 return art


def apply_motion(m,edit):
 c=edit.get('motion')
 if not c:return
 m.update(editorMotion=c['kind'],angle=0,orbit=False,dx=0,dy=0)
 for key in ('xKeys','yKeys','angleKeys'):m.pop(key,None)
 if c['kind']!='static':
  m['xKeys']=[(f,x) for f,x,y in c['keys']]
  m['yKeys']=[(f,y) for f,x,y in c['keys']]


def added_mechanism(art,mechanisms,a):
 source=next((m['source'] for m in mechanisms if m['kind']=='platform'),0)
 m={k:a[k] for k in ('kind','name','x','y','width','dx','dy','period','hold')}
 m.update(angle=0,orbit=False,source=source)
 if a['kind']=='bumper':m.update(variant=a.get('variant','red' if a['width']>23 else 'yellow'),height=a.get('height',a['width']))
 # Reuse a complete platform sprite, never an arbitrary patch of background.
 if a['kind']=='platform' and (art.world_assets/'props.json').exists():
  spec=json.loads((art.world_assets/'props.json').read_text()).get('sprites',{}).get('deck')
  if spec:
   height=a['width']*spec['aspect']
   m.update(propSkin='deck',propRect=[0,spec.get('walkingInset',0)*height,a['width'],height],textureSource=spec['sourceAtlas'])
 if a['kind']=='boost':m.update(editorBoost=True,impulseX=a['impulseX'],damage=0)
 apply_motion(m,a)
 return m
