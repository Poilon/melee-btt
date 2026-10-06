import base64,copy,json,struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_grassland import Dat
from editor_media import validate_media,mesh,install_animation,restore_occluder_depth
from stage_project import ProjectError

def empty():return Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
def asset():return dict(id='test',name='Loop',width=8,height=8,format='RGBA8',frameTicks=30,frames=[base64.b64encode(bytes([i])*256).decode() for i in (0,255)])
class Media(unittest.TestCase):
 def test_reject_damaged_media_and_references(self):
  p={'media':[asset()],'background':{'media':'test','bounds':[-300,200,300,-100]}};validate_media(p)
  for key,value in [('width',7),('frameTicks',False),('frames',['AAAA']),('format','path/to/file')]:
   bad=copy.deepcopy(p);bad['media'][0][key]=value
   with self.assertRaises(ProjectError):validate_media(bad)
  p['background']['media']='missing'
  with self.assertRaises(ProjectError):validate_media(p)
 def test_pipe_occluder_keeps_imported_alpha_while_restoring_depth(self):
  d=empty();obj=mesh(d,asset(),[[0,8],[8,8],[8,0],[0,0]])
  self.assertTrue(restore_occluder_depth(d,obj));pe=d.u(d.u(obj+8)+20)
  self.assertEqual(bytes(d.data[pe:pe+12]),bytes([0x31,0,0,0,1,4,5,15,7,4,0,7]))
  self.assertFalse(restore_occluder_depth(d,0))
 def test_texture_animation_native_image_table_and_material_alignment(self):
  d=empty();m=asset();first=mesh(d,m,[[-40,40],[40,40],[40,-40],[-40,-40]],mapping='repeat',repeat_width=32)
  second=mesh(d,m,[[0,10],[10,10],[10,0],[0,0]])
  pe=d.u(d.u(first+8)+20);self.assertEqual(bytes(d.data[pe:pe+12]),bytes([0x11,0,0,0,1,4,5,15,3,7,0,7]))
  self.assertEqual(len(d.editor_images),1);d.pointer(first+4,second)
  root=d.joint(dobj=first);groups=d.alloc(3*52);d.pointer(groups+104,root);head=d.alloc(64);d.pointer(head+8,groups);d.roots['map_head']=head
  install_animation(d);table=d.u(groups+112);joint=d.u(table);mat=d.u(joint+8)
  for obj in (first,second):
   texanim=d.u(mat+8);self.assertEqual(texanim,d.editor_tex_anims[obj]);self.assertEqual(struct.unpack_from('>H',d.data,texanim+20)[0],2)
   aobj=d.u(texanim+8);self.assertEqual(struct.unpack_from('>f',d.data,aobj+4)[0],60);self.assertEqual(d.data[d.u(aobj+8)+12],1)
   images=d.u(texanim+12);self.assertEqual(d.u(images+8),0);self.assertEqual(d.data[d.u(d.u(images))],0);self.assertEqual(d.data[d.u(d.u(images+4))],255);mat=d.u(mat)
  self.assertEqual(mat,0)
if __name__=='__main__':unittest.main()
