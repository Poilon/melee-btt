"""Separate authored terrain from continuous background scenery.

Foreground geometry samples the original painting at its exact authored UVs.
Moving a piece moves its texture and collision together; no background patches.
"""
import copy,json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets/custom-stages/modular'
BASIC=ROOT/'assets/custom-stages/basic'
NAMES={
 'Ns':['Street foundation','Burger shop','Onett Elementary School','Flower planter','Yellow house'],
 'Cl':['Left forest bank','Forest clearing','Right forest bank','Great Kokiri tree','Canopy lookout'],
 'Dk':['Jungle landing','Ancient jungle tree','Far jungle landing'],
 'Mr':['Mushroom Kingdom ground','Brick tower','Pipe','Pipe','Stone column'],
 'Dr':['Lab bench','Medicine cabinet','Chemical tank','Storage cabinet','Glass column'],
 'Pc':['Workshop foundation','Battery cabinet','Battery column','Brass housing','Workshop column'],
 'Pk':['Power station foundation','Generator base','Generator housing','Power station ledge'],
 'Lk':['Temple foundation','Temple wall','Triforce chamber','Stone pillar'],
 'Lg':['Manor wall','Manor wall'],
 'Kp':['Castle foundation','Lava keep wall','Castle tower'],
 'Mt':['Containment foundation'],
 'Gw':['Left pavement','Right pavement'],
}
THEMES={'Mr':'Brick','Ca':'Track','Cl':'Wooden branch','Dk':'Jungle branch','Dr':'Lab shelf','Fc':'City ledge','Fx':'Hangar deck','Ic':'Ice shelf','Kb':'Dream balcony','Kp':'Castle ledge','Lk':'Temple ledge','Lg':'Manor floor','Ms':'Altean ledge','Mt':'Containment deck','Ns':'Grass ledge','Pe':'Garden balcony','Pc':'Brass shelf','Pk':'Steel deck','Pr':'Moon ledge','Ss':'Alien ledge','Sk':'Crypt ledge','Ys':'Island ledge','Zd':'Temple balcony','Gw':'LCD balcony','Fe':'Bastion ledge','Gn':'Citadel ledge'}

def box(poly):
 xs=[p[0] for p in poly];ys=[p[1] for p in poly]
 return [min(xs),max(ys),max(xs),min(ys)]
def rect(l,t,r,b):return [[l,t],[r,t],[r,b],[l,b]]

def catalog(art):
 pieces=[]
 for i,(x,y,w,h,mat) in enumerate(art.solids):
  poly=copy.deepcopy(getattr(art,'solid_contours',{}).get(i,rect(x,y+h,x+w,y)))
  names=NAMES.get(art.suffix,[]);name=names[i] if i<len(names) else f'{art.character} wall {i+1}'
  pieces.append(dict(id=f'solid-{i}',name=name,kind='solid',points=poly,sourceRect=box(poly),material=mat,index=i))
 for i,(x,y,w,mat) in enumerate(art.platforms):
  h=min(14,max(5,w*.15));source=rect(x,y,x+w,y-h)
  # Copied ledges must sample their source, not the blank painting under them.
  scene=json.loads((art.world_assets/'scene.json').read_text())
  for c in scene.get('platformCopies',[]):
   if max(abs(a-b) for a,b in zip(c['surface'],[x,y,w]))<.01:
    iw,ih=(scene.get('collisionTracing') or scene['paintedFloors'])['size'];l,t,r,b=scene['bounds'];a,bb,cc,dd=c['sourcePixels']
    source=rect(l+a/iw*(r-l),t-bb/ih*(t-b),l+cc/iw*(r-l),t-dd/ih*(t-b));h=c['height'];break
  pieces.append(dict(id=f'platform-{i}',name=f'{THEMES[art.suffix]} {i+1}',kind='platform',points=rect(x,y,x+w,y-h),sourceRect=box(source),height=h,material=mat,index=i))
  if art.suffix=='Lg' and i not in (20,21,22):pieces[-1].update(sharedTexture='manor-floor',sprite='basic-manor-floor',spriteImage='/editor/data/basic-manor-floor.png',sourceRect=[0,0,64,-8])
  if art.suffix=='Lg' and i in (20,21,22):
   skin={20:'fireplace',21:'piano',22:'bed'}[i]
   entry=json.loads((ASSETS/'Lg/furniture.json').read_text())['sprites'][skin]
   h=w*entry['aspect']
   pieces[-1].update(name={'fireplace':'Carved fireplace','piano':'Manor piano','bed':'Velvet bed'}[skin],sprite=skin,spriteImage=f'/editor/data/Lg-furniture-{skin}.png',height=h,points=rect(x,y,x+w,y-h))
 for key,name,kind,w,h,material in [('brick','Brick block','solid',64,64,4),('wood','Wood platform','platform',64,8,2)]:
  pieces.append(dict(id='basic-'+key,name=name,kind=kind,points=rect(0,0,w,-h),sourceRect=[0,0,w,-h],height=h,fixedHeight=True,material=material,sharedTexture=key,sprite='basic-'+key,spriteImage='/editor/data/basic-'+key+'.png'))
 # Audited artwork-only corrections: copied fascia must not carry a window,
 # sky stripe or neighboring structure underneath/alongside the actual ledge.
 corrections={'Mr':{5:0,7:0},'Fc':{i:0 for i in range(1,6)},
              'Mt':{4:0,5:0,8:0,10:0},'Fe':{6:0},'Dr':{5:0}}
 by_id={p['id']:p for p in pieces}
 for index,source in corrections.get(art.suffix,{}).items():
  target=by_id[f'platform-{index}'];clean=by_id[f'platform-{source}']['sourceRect']
  target.update(sourceRect=copy.deepcopy(clean),textureWidth=clean[2]-clean[0])
 # Garden/dream balconies have hanging ornaments. Their complete existing
 # alpha sprites avoid painting the old backdrop between the ornaments.
 donor={'Kb':'Kb','Pe':'Pe','Pr':'Kb'}.get(art.suffix)
 if donor:
  entry=json.loads((ROOT/'assets/custom-stages/worlds'/donor/'props.json').read_text())['sprites']['deck']
  for p in pieces:
   if p['kind']!='platform' or p['id'].startswith('basic-'):continue
   l,t,r,b=box(p['points']);h=(r-l)*entry['aspect'];inset=entry.get('walkingInset',0)
   p.update(propTextureStage=donor,sprite=donor+'-platform-deck',spriteImage=f'/editor/data/{donor}-platform-deck.png',height=h,walkingInset=inset,points=rect(l,t+inset*h,r,t-(1-inset)*h))
 return pieces

def configure(art):
 # Catalog exists independently of generated imagery; missing art is a build
 # error after this feature is enabled, never a silent flat-colour substitute.
 art.piece_catalog=catalog(art)
 art.native_actor_edits=native_actors(art)
 art.terrain_skins=[f'solid-{i}' for i in range(len(art.solids))]
 art.platform_skins=[f'platform-{i}' for i in range(len(art.platforms))]
 art.modular_background=ASSETS/art.suffix
 if art.suffix=='Gw':
  # Separate the black collision treads from the native pale LCD printing.
  shapes=[[-196,0,196,-10]]+[box(p['points']) for p in art.piece_catalog if p['kind']=='platform']
  def tread(tri):
   xs=[v[0] for v in tri];ys=[v[1] for v in tri];bb=[min(xs),max(ys),max(xs),min(ys)]
   return any(abs(bb[0]-l)<.01 and abs(bb[1]-t)<.01 and abs(bb[2]-r)<.01 and (abs(bb[3]-b)<.01 or abs(bb[3]-(t-3))<.01) for l,t,r,b in shapes)
  art.modular_printing=[tri for tri in art.triangles if not tread(tri)]
  for p in art.piece_catalog:
   if p.get('sharedTexture'):continue
   p['color']='#26322c'
   if p['kind']=='platform':p['height']=3;p['points']=rect(p['points'][0][0],p['points'][0][1],p['points'][1][0],p['points'][0][1]-3)
 return art

def mesh(d,art):
 from stage_texture import texture_scene
 from editor_media import background as custom_background,append as append_custom
 from build_grassland import Art
 if art.suffix=='Gw':
  from world_mechanics import colour_mesh
  drawing=Art();drawing.triangles=copy.deepcopy(art.modular_printing)
  from solid_readability import triangulate
  for i,(x,y,w,h,_) in enumerate(art.solids):
   if art.terrain_skins[i].startswith(('basic-','custom-')):continue
   for tri in triangulate(getattr(art,'solid_contours',{}).get(i,rect(x,y+h,x+w,y))):
    drawing.triangles.append([(px,py,0,bytes([38,50,44,255])) for px,py in tri])
  for i,(x,y,w,_) in enumerate(art.platforms):
   if not art.platform_skins[i].startswith(('basic-','custom-')):drawing.rect(x,y-3,w,3,'#26322c',0)
  foreground=append_custom(d,art,append_basic(d,art,colour_mesh(d,drawing)))
  first=append_custom(d,art,custom_background(d,art),decorations_only=True)
  if first:
   last=first
   while d.u(last+4):last=d.u(last+4)
   d.pointer(last+4,foreground);return first
  return foreground
 folder=art.modular_background
 if not (folder/'scene.json').exists():raise ValueError('Missing modular background: '+art.suffix)
 if getattr(art,'editor_background',None):first=custom_background(d,art)
 elif art.suffix=='Kp':
  # A distant vista, not a giant wall at the fighter's depth. Perspective
  # parallax keeps the castle and Bowser relief in frame while crossing it.
  s=art.world_scale;height=1650;width=height*2;cx=-450
  first=texture_scene(d,directory=folder,copies=[],render_bounds=[(cx-width/2)/s,height/2/s,(cx+width/2)/s,-height/2/s],depth=-8000)
 else:first=texture_scene(d,directory=folder,copies=[])
 first=append_custom(d,art,first,decorations_only=True)
 pieces={p['id']:p for p in art.piece_catalog};draws=[];sprites=[]
 for i,(x,y,w,h,_) in enumerate(art.solids):
  skin=pieces[art.terrain_skins[i]]
  if skin.get('sharedTexture') or skin.get('custom'):continue
  original=box(skin['points'])
  draws.append((getattr(art,'solid_contours',{}).get(i,rect(x,y+h,x+w,y)),skin['sourceRect'],original[2]-original[0]))
 for i,(x,y,w,_) in enumerate(art.platforms):
  skin=pieces[art.platform_skins[i]];original=box(skin['points']);height=skin['height']*w/(original[2]-original[0])
  if skin.get('sharedTexture') or skin.get('custom'):continue
  if skin.get('sprite'):sprites.append((skin,[x,y+skin.get('walkingInset',0)*height,w,height]))
  else:draws.append((rect(x,y,x+w,y-height),skin['sourceRect'],skin.get('textureWidth',original[2]-original[0])))
 foreground=painted_polygons(d,art.world_assets,draws)
 if foreground:
  last=first
  while d.u(last+4):last=d.u(last+4)
  d.pointer(last+4,foreground)
 if sprites:
  from types import SimpleNamespace
  from doc_chemicals import sprite_mesh
  last=first
  while d.u(last+4):last=d.u(last+4)
  for skin,rectangle in sprites:
   donor=skin.get('propTextureStage')
   directory=ROOT/'assets/custom-stages/worlds'/donor if donor else folder
   obj=sprite_mesh(d,SimpleNamespace(world_assets=directory),'deck' if donor else skin['sprite'],rectangle,manifest='props.json' if donor else 'furniture.json')
   d.pointer(last+4,obj);last=obj
 return append_custom(d,art,append_basic(d,art,first))

def append_basic(d,art,first,solids_only=False):
 pieces={p['id']:p for p in art.piece_catalog};draws={}
 for i,(x,y,w,h,_) in enumerate(art.solids):
  skin=pieces[art.terrain_skins[i]]
  if skin.get('sharedTexture'):draws.setdefault(skin['sharedTexture'],[]).append((getattr(art,'solid_contours',{}).get(i,rect(x,y+h,x+w,y)),skin['sourceRect'],64))
 if not solids_only:
  for i,(x,y,w,_) in enumerate(art.platforms):
   skin=pieces[art.platform_skins[i]]
   if skin.get('sharedTexture'):
    original=box(skin['points']);height=skin['height'] if skin.get('fixedHeight') else skin['height']*w/(original[2]-original[0])
    draws.setdefault(skin['sharedTexture'],[]).append((rect(x,y,x+w,y-height),skin['sourceRect'],64))
 for key,polys in draws.items():
  obj=painted_polygons(d,BASIC/key,polys)
  if not first:first=obj
  else:
   last=first
   while d.u(last+4):last=d.u(last+4)
   d.pointer(last+4,obj)
 return first

def clip(poly,axis,value,greater):
 result=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  ia=a[axis]>=value if greater else a[axis]<=value;ib=b[axis]>=value if greater else b[axis]<=value
  if ia:result.append(a)
  if ia!=ib:
   t=(value-a[axis])/(b[axis]-a[axis]);result.append([a[j]+(b[j]-a[j])*t for j in range(4)])
 return result

def actor_occluders(d,art):
 """Use the edited foreground, including moved/duplicated/resized pipe pieces.

 The old fixed source-image rectangle remained at the original pipe location.
 A final foreground pass also restores the depth hidden plant meshes wrote.
 """
 pieces={p['id']:p for p in art.piece_catalog};draws=[]
 for i,(x,y,w,h,_) in enumerate(art.solids):
  skin=pieces[art.terrain_skins[i]];original=box(skin['points'])
  if skin.get('sharedTexture') or skin.get('custom'):continue
  draws.append((getattr(art,'solid_contours',{}).get(i,rect(x,y+h,x+w,y)),skin['sourceRect'],original[2]-original[0]))
 from editor_media import append as append_custom
 return append_custom(d,art,append_basic(d,art,painted_polygons(d,art.world_assets,draws) if draws else None,solids_only=True),solids_only=True)

def texture_strips(length,width):
 """Continuous interior reflections at original density, one pair of end caps.

 Keep in sync with web/editor/pieces.js:textureStrips. Fractions can decrease:
 these are mirrored UVs, not different or duplicated texture buffers.
 """
 if length<=0 or width<=0:raise ValueError('Invalid texture repeat width')
 if length<=width+1e-8:return [(0,length,0,length/width)]
 end=.85;interior=.7*width;strips=[(0,end*width,0,end)]
 x=end*width;extra=length-width
 while extra>1e-8:
  span=min(interior,extra/2);turn=end-span/width
  strips.extend([(x,x+span,end,turn),(x+span,x+2*span,turn,end)])
  x+=2*span;extra-=2*span
 strips.append((x,length,end,1))
 return strips

def painted_polygons(d,directory,draws):
 from stage_texture import texture_scene
 from solid_readability import triangulate
 scene=json.loads((directory/'scene.json').read_text());l,t,r,b=scene['bounds'];iw,ih=scene['size']
 # Repeat the authored horizontal texel density. Clip each triangle into
 # strips before sampling tiles; keep one vertical mapping across a slope.
 prepared=[]
 for draw in draws:
  poly,source=draw[:2];dl,dt,dr,db=box(poly)
  width=draw[2] if len(draw)>2 else dr-dl
  if width<=0:raise ValueError('Invalid texture repeat width')
  sl,st,sr,sb=source
  for a,z,u,v in texture_strips(dr-dl,width):
   left,right=dl+a,dl+z
   mapped=[sl+(sr-sl)*u,st,sl+(sr-sl)*v,sb]
   for tri in triangulate(poly):
    part=[[x,y,0,0] for x,y in tri]
    part=clip(clip(part,0,left,True),0,right,False)
    if len(part)>=3:prepared.append(([[x,y] for x,y,_,_ in part],mapped,[left,dt,right,db]))
 # Use existing immutable GX textures and material descriptors, with new UV-
 # mapped geometry. Source texels never get stretched into a background hole.
 node=texture_scene(d,directory=directory,copies=[]);first=last=None
 for tile in scene['tiles']:
  current=node;node=d.u(node+4);d.pointer(current+4,None)
  tx,ty,tw,th=tile['rect'];ul,ut,ur,ub=tx/iw,ty/ih,(tx+tw)/iw,(ty+th)/ih
  vertices=[]
  for poly,source,mapping in prepared:
   dl,dt,dr,db=mapping;sl,st,sr,sb=source
   # Every prepared polygon is a triangle clipped by two half planes:
   # convex, possibly with duplicate edge vertices. Fan it directly.
   for j in range(1,len(poly)-1):
    tri=(poly[0],poly[j],poly[j+1])
    # triangulate returns vertices, in collision coordinates.
    uv=[[x,y,(sl+(x-dl)/(dr-dl)*(sr-sl)-l)/(r-l),(t-(st+(y-dt)/(db-dt)*(sb-st)))/(t-b)] for x,y in tri]
    for axis,value,greater in [(2,ul,True),(2,ur,False),(3,ut,True),(3,ub,False)]:
     if not uv:break
     uv=clip(uv,axis,value,greater)
    for i in range(1,len(uv)-1):
     for x,y,u,v in (uv[0],uv[i],uv[i+1]):vertices.append((x,y,0,(u-ul)/(ur-ul),(v-ut)/(ub-ut)))
  if not vertices:continue
  data=bytearray(struct.pack('>BH',0x90,len(vertices)))
  for v in vertices:data+=struct.pack('>5f',*v)
  data+=bytes(-len(data)%32);p=d.u(current+12);d.put(p+14,'H',len(data)//32);d.pointer(p+16,d.buffer(data,32))
  if last is None:first=current
  else:d.pointer(last+4,current)
  last=current
 return first

def native_actors(art):
 f=art.authored_surfaces
 if art.suffix=='Ns':return [dict(kind='traffic',name='Onett traffic lane',x=0,y=f[0][2])]
 if art.suffix=='Ic':return [dict(kind=46,name='Topi',x=-67,y=f[3][2]+2),dict(kind=46,name='Topi',x=8,y=f[8][2]+2),dict(kind=217,name='Polar Bear',x=0,y=f[9][2]+2)]
 if art.suffix=='Sk':return [dict(kind=44,name='ReDead',x=-68,y=f[3][2]+2),dict(kind=44,name='ReDead',x=53,y=f[6][2]+2)]
 return []
