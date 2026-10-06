"""Project-embedded GX media; no filesystem paths or video codecs at build time.

Texture animation uses Melee's native HSD_A_T_TIMG material tracks. The same
encoded pixels and frame durations are previewed in the browser editor.
"""
import base64,binascii,math,re,struct
BUDGET=4*1024*1024

def validate_media(p):
 from stage_project import ProjectError,number
 def fail(message):raise ProjectError(message)
 def ident(v):return isinstance(v,str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',v)
 def name(v):return isinstance(v,str) and 0<len(v.strip())<=80 and len(v)<=80 and not any(ord(c)<32 for c in v)
 assets=p.get('media',[]);pieces=p.get('customPieces',[]);decorations=p.get('decorations',[])
 if not isinstance(assets,list) or len(assets)>32 or not isinstance(pieces,list) or len(pieces)>64 or not isinstance(decorations,list) or len(decorations)>64:fail('Invalid imported media library')
 ids=set();piece_ids=set();total=0
 for m in assets:
  if not isinstance(m,dict) or not ident(m.get('id')) or m['id'] in ids or not name(m.get('name')) or m.get('format') not in ('RGBA8','CMPR'):fail('Invalid imported texture')
  if any(type(m.get(k))!=int or not 8<=m[k]<=1024 or m[k]%8 for k in ('width','height')):fail('Invalid imported texture dimensions')
  if not isinstance(m.get('frames'),list) or not 1<=len(m['frames'])<=120 or type(m.get('frameTicks'))!=int or not 1<=m['frameTicks']<=600:fail('Invalid texture animation')
  ids.add(m['id']);size=m['width']*m['height']*(4 if m['format']=='RGBA8' else 1)/ (1 if m['format']=='RGBA8' else 2);size=int(size)
  total+=size*len(m['frames'])
  if total>BUDGET:fail('Imported textures exceed the 4 MB game memory budget')
  for frame in m['frames']:
   if not isinstance(frame,str) or len(frame)!=((size+2)//3)*4:fail('Imported texture data is damaged')
   try:data=base64.b64decode(frame,validate=True)
   except (ValueError,binascii.Error):fail('Imported texture data is damaged')
   if len(data)!=size:fail('Imported texture data is damaged')
 for c in pieces:
  if not isinstance(c,dict) or not ident(c.get('id')) or not c['id'].startswith('custom-') or c['id'] in piece_ids or c.get('media') not in ids or not name(c.get('name')) or c.get('kind') not in ('solid','platform','decoration') or c.get('mapping') not in ('repeat','mirror','stretch'):fail('Invalid custom object')
  piece_ids.add(c['id']);number(c.get('width'),2,800);number(c.get('height'),2,800)
 for d in decorations:
  if not isinstance(d,dict) or not any(c['id']==d.get('piece') and c['kind']=='decoration' for c in pieces):fail('Invalid custom decoration')
  number(d.get('x'));number(d.get('y'));number(d.get('width'),2,800);number(d.get('height'),2,800)
 if p.get('background') is not None:
  b=p['background']
  if not isinstance(b,dict) or b.get('media') not in ids or not isinstance(b.get('bounds'),list) or len(b['bounds'])!=4:fail('Invalid imported background')
  for v in b['bounds']:number(v)
  l,t,r,bottom=b['bounds']
  if r-l<2 or t-bottom<2:fail('Invalid imported background')

def skins(p):
 return [dict(c,custom=True,points=[[0,0],[c['width'],0],[c['width'],-c['height']],[0,-c['height']]],fixedHeight=True,material=4) for c in p.get('customPieces',[])]

def bind(art,p):
 art.editor_media={m['id']:m for m in p.get('media',[])}
 art.editor_background=p.get('background');art.editor_decorations=p.get('decorations',[])
 art.piece_catalog+=skins(p)

def image_table(d,m):
 if not hasattr(d,'editor_images'):d.editor_images={}
 if m['id'] in d.editor_images:return d.editor_images[m['id']]
 images=[]
 for frame in m['frames']:
  raw=base64.b64decode(frame,validate=True);image=d.alloc(24)
  d.pointer(image,d.buffer(raw,32));d.put(image+4,'HHIIff',m['width'],m['height'],14 if m['format']=='CMPR' else 6,0,0,0);images.append(image)
 table=d.alloc((len(images)+1)*4)
 for i,im in enumerate(images):d.pointer(table+4*i,im)
 d.editor_images[m['id']]=(images,table);return images,table

def mesh(d,m,polygon,depth=0,mapping='stretch',repeat_width=64):
 from solid_readability import triangulate
 from modular_stage import box,clip
 images,table=image_table(d,m)
 tex=d.alloc(0x5c);d.put(tex+8,'II',0,4);d.put(tex+0x1c,'3f',1,1,1);d.put(tex+0x3c,'BB',1,1)
 d.put(tex+0x40,'IfI',0x450010 if m['format']=='RGBA8' else 0x50010,1,1);d.pointer(tex+0x4c,images[0])
 material=d.buffer(b'\xff'*8+b'\0\0\0\xff'+struct.pack('>ff',1,0))
 mat=d.alloc(24);d.put(mat+4,'I',0x11);d.pointer(mat+8,tex);d.pointer(mat+12,material)
 # Source-alpha blending preserves transparent PNG pixels in the opaque draw pass.
 pe=bytes([0x11,0,0,0,1,4,5,15,3,7,0,7]) if m['format']=='RGBA8' else bytes([0x19,0,0,0,0,4,5,15,3,7,0,7])
 d.pointer(mat+20,d.buffer(pe))
 attrs=d.alloc(72);d.put(attrs,'IIIIBBHI',9,1,1,4,0,0,12,0);d.put(attrs+24,'IIIIBBHI',13,1,1,4,0,0,8,0);d.put(attrs+48,'I',255)
 l,t,r,b=box(polygon);width=r-l if mapping=='stretch' else repeat_width;vertices=[]
 for index in range(math.ceil((r-l)/width)):
  left=l+index*width;right=min(r,left+width)
  for tri in triangulate(polygon):
   part=[[x,y,0,0] for x,y in tri];part=clip(clip(part,0,left,True),0,right,False)
   for j in range(1,len(part)-1):
    for x,y,_,_ in (part[0],part[j],part[j+1]):
     u=(x-left)/width
     if mapping=='mirror' and index%2:u=1-u
     vertices.append((x,y,depth,u,(t-y)/(t-b)))
 if len(vertices)>65535:raise ValueError('Custom texture tiling produces too many vertices; increase the repeat width')
 dl=bytearray(struct.pack('>BH',0x90,len(vertices)))
 for vertex in vertices:dl+=struct.pack('>5f',*vertex)
 dl+=bytes(-len(dl)%32);pobj=d.alloc(24);d.pointer(pobj+8,attrs);d.put(pobj+12,'HH',0,len(dl)//32);d.pointer(pobj+16,d.buffer(dl,32))
 obj=d.alloc(16);d.pointer(obj+8,mat);d.pointer(obj+12,pobj)
 if not hasattr(d,'editor_materials'):d.editor_materials={}
 d.editor_materials[obj]=m['format']
 if len(images)>1:
  from world_mechanics import track
  period=len(images)*m['frameTicks'];keys=[(i*m['frameTicks'],i) for i in range(len(images))]+[(period,0)]
  aobj=d.alloc(16);d.put(aobj,'If',0x20000000,period);d.pointer(aobj+8,track(d,1,keys,interpolation=1))
  anim=d.alloc(24);d.pointer(anim+8,aobj);d.pointer(anim+12,table);d.put(anim+20,'HH',len(images),0)
  if not hasattr(d,'editor_tex_anims'):d.editor_tex_anims={}
  d.editor_tex_anims[obj]=anim
 return obj

def background(d,art):
 b=getattr(art,'editor_background',None)
 if not b:return None
 from modular_stage import rect
 return mesh(d,art.editor_media[b['media']],rect(*b['bounds']),depth=-2)

def append(d,art,first,solids_only=False,decorations_only=False):
 from modular_stage import rect
 pieces={c['id']:c for c in art.piece_catalog};draws=[]
 for i,(x,y,w,h,_) in enumerate([] if decorations_only else art.solids):
  c=pieces[art.terrain_skins[i]]
  if c.get('custom'):draws.append((c,getattr(art,'solid_contours',{}).get(i,rect(x,y+h,x+w,y)),0))
 if not solids_only and not decorations_only:
  for i,(x,y,w,_) in enumerate(art.platforms):
   c=pieces[art.platform_skins[i]]
   if c.get('custom'):draws.append((c,rect(x,y,x+w,y-c['height']),0))
 if decorations_only:
  # Draw before terrain: transparent foreground materials do not write depth.
  for obj in getattr(art,'editor_decorations',[]):draws.append((pieces[obj['piece']],rect(obj['x'],obj['y'],obj['x']+obj['width'],obj['y']-obj['height']),-.5))
 for c,poly,z in draws:
  obj=mesh(d,art.editor_media[c['media']],poly,z,c['mapping'],c['width'])
  if first is None:first=obj
  else:
   last=first
   while d.u(last+4):last=d.u(last+4)
   d.pointer(last+4,obj)
 return first

def install_animation(d):
 if not getattr(d,'editor_tex_anims',None):return
 groups=d.u(d.roots['map_head']+8);g=groups+104;root=d.u(g)
 def joint_tree(joint):
  if not joint:return None
  node=d.alloc(12);d.pointer(node,joint_tree(d.u(joint+8)));d.pointer(node+4,joint_tree(d.u(joint+12)))
  obj=d.u(joint+16);last=None
  while obj:
   mat=d.alloc(16)
   if obj in d.editor_tex_anims:d.pointer(mat+8,d.editor_tex_anims[obj])
   d.pointer(last if last is not None else node+8,mat);last=mat;obj=d.u(obj+4)
  return node
 table=d.alloc(8);d.pointer(table,joint_tree(root));d.pointer(g+8,table)

def restore_occluder_depth(d,obj):
 # Mario's final pipe pass restores depth after hidden plant geometry. Preserve
 # imported PNG alpha there, or this second draw paints transparent pixels black.
 if getattr(d,'editor_materials',{}).get(obj)!='RGBA8':return False
 d.pointer(d.u(obj+8)+20,d.buffer(bytes([0x31,0,0,0,1,4,5,15,7,4,0,7])))
 return True
