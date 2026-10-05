"""Add Leaderboard, Account and Companion to Stadium; retain the three retail modes."""
import hashlib,json,struct
from pathlib import Path
from build_grassland import Dat
ROOT=Path(__file__).resolve().parent
HOOK=0x80221d00
LOOPS=0x80221e00
DESCRIPTIONS=LOOPS+64

def append_public(d,name,value):
 nroot,nref=struct.unpack_from('>2I',d.header,12)
 roots=d.tail[:nroot*8];refs=d.tail[nroot*8:(nroot+nref)*8];names=d.tail[(nroot+nref)*8:]
 d.tail=roots+struct.pack('>II',value,len(names))+refs+names+name.encode()+b'\0'
 h=bytearray(d.header);struct.pack_into('>I',h,12,nroot+1);d.header=bytes(h)

def add_menu(source,module,relocs,label):
 d=Dat(source)
 # The shared cursor supports up to seven rows. The Stadium's fourth label is
 # a new frame, not a replacement for any of the original labels or modes.
 root=d.roots['MenMainCursor_Top_matanim_joint'];found=[]
 def walk(p):
  while p:
   m=d.u(p+8)
   while m:
    t=d.u(m+8)
    while t:
     if struct.unpack_from('>H',d.data,t+20)[0]==58:found.append(t)
     t=d.u(t)
    m=d.u(m)
   if d.u(p):walk(d.u(p))
   p=d.u(p+4)
 walk(root)
 if len(found)!=1:raise ValueError('Unexpected menu texture animation')
 t=found[0];oldtable=d.u(t+12);table=d.alloc(61*4)
 for i in range(58):d.pointer(table+i*4,d.u(oldtable+i*4))
 image=d.alloc(24);d.pointer(image,d.buffer(label,32));d.put(image+4,'HHI',176,32,2);d.pointer(table+58*4,image)
 # The account label is native text, updated from the signed-in identity.
 blank=d.alloc(24);d.pointer(blank,d.buffer(bytes(176*32),32));d.put(blank+4,'HHI',176,32,2);d.pointer(table+59*4,blank);d.pointer(table+60*4,blank)
 d.pointer(t+12,table);d.put(t+20,'H',61)
 a=d.u(t+8);f=d.u(a+8);raw=d.data[d.u(f+16):d.u(f+16)+d.u(f+4)]
 if d.data[f+12:f+15]!=bytes([1,0x82,0]):raise ValueError('Unexpected menu image track')
 p=0
 def varint():
  nonlocal p
  n=0;shift=0
  while True:
   byte=raw[p];p+=1;n|=(byte&127)<<shift
   if byte<128:return n
   shift+=7
 packet=varint();keys=[];frame=0
 if packet&15!=1:raise ValueError('Expected constant texture keys')
 for _ in range((packet>>4)+1):
  value=raw[p]/4;p+=1;delta=varint();keys.append((frame,value));frame+=delta
 if any(frame in (166,168,170) for frame,_ in keys):raise ValueError('Online menu frames already occupied')
 keys.extend([(166,58),(168,59),(170,60)]);keys.sort()
 from world_mechanics import track
 replacement=track(d,1,keys,interpolation=1);d.pointer(replacement,d.u(f));d.pointer(a+8,replacement)
 code=d.buffer(module,32)
 for q in relocs:d.pointer(code+q,code+struct.unpack_from('>I',module,q)[0])
 state=d.alloc(1024,32);d.put(state,'II',0x5454524f,1);d.pointer(state+8,code);d.pointer(state+12,code);d.put(state+16,'I',len(module))
 append_public(d,'TTRCOnline',state)
 return d.finish()

def add_description(source,mapping):
 d=Dat(source);root=d.roots['SIS_MenuData'];count=0
 while root+count*4 in d.reloc:count+=1
 if count!=1604:raise ValueError('Unexpected menu string table')
 table=d.alloc((count+3)*4)
 for i in range(count):d.pointer(table+i*4,d.u(root+i*4))
 original=d.u(root+0xa8*4)
 # Copy the retail description's font/style controls up to the first glyph.
 prefix=bytes(d.data[original:original+16]) # 16 10 ... 06 00000000, followed by 18
 for index,message in enumerate(['View online records and watch replays.','Log in or manage your Custom Melee BTT account.','Open the companion in your browser.']):
  text=bytearray(prefix+b'\x18')
  for c in message:
   if c==' ':text+=b'\x1a'
   else:text+=mapping[c]
  text+=b'\x19\x0f\x0d\0'
  d.pointer(table+(count+index)*4,d.buffer(text))
 nroot=struct.unpack_from('>I',d.header,12)[0];tail=bytearray(d.tail)
 for i in range(nroot):
  if struct.unpack_from('>I',tail,i*8)[0]==root:struct.pack_into('>I',tail,i*8,table)
 d.tail=bytes(tail)
 return d.finish()

def patch_dol(data,offset,hook):
 assert len(hook)<=LOOPS-HOOK
 def patch(a,before,after):
  p=offset(a)
  if struct.unpack_from('>I',data,p)[0]!=before:raise ValueError(f'Unexpected online hook at {a:x}')
  struct.pack_into('>I',data,p,after)
 data[offset(HOOK):offset(HOOK)+len(hook)]=hook
 patch(0x8022c7f8,0x4bffce2d,0x48000001|((HOOK-0x8022c7f8)&0x3fffffc))
 # Start with five rows; the archive adds Companion while signed in.
 table=0x803eb6b0+9*20
 patch(table,0x803eb5c4,LOOPS)
 p=offset(table+12)
 if data[p]!=3:raise ValueError('Unexpected Stadium row count')
 data[p]=5
 data[offset(LOOPS):offset(LOOPS)+36]=data[offset(0x803eb5c4):offset(0x803eb5c4)+36]
 for i in (3,4):data[offset(LOOPS)+i*12:offset(LOOPS)+(i+1)*12]=data[offset(0x803eb5c4):offset(0x803eb5c4)+12]
 patch(table+8,0x804d4b48,DESCRIPTIONS)
 struct.pack_into('>5H',data,offset(DESCRIPTIONS),0xa8,0xa9,0xaa,1604,1605)
 # Open Stadium at boot; existing HRC/Multi-Man routes remain intact.
 patch(0x8022ddf4,0x88030000,0x48000001|((HOOK+196-0x8022ddf4)&0x3fffffc))

def assets():
 meta=json.loads((ROOT/'native/online-menu.json').read_text())
 for name,digest in meta['hashes'].items():
  if hashlib.sha256((ROOT/'native'/name).read_bytes()).hexdigest()!=digest:raise ValueError('Native menu changed; run scripts/build_online_menu.py')
 return ((ROOT/'native/online-menu.bin').read_bytes(),meta['relocations'],(ROOT/'native/leaderboard-label.ia4').read_bytes(),(ROOT/'native/online-menu-hook.bin').read_bytes())

def add_archives(iso,rows):
 from build_character_worlds import dol_sections
 module,relocs,label,_=assets()
 with iso.open('rb') as f:
  raw=f.read(0x500000);_,sections=dol_sections(raw)
  def at(a):
   start,off,size=next(s for s in sections if s[0]<=a<s[0]+s[2]);return off+a-start
  mapping={}
  for i in range(288):
   sjis=raw[at(0x8040c8c0)+i*2:at(0x8040c8c0)+i*2+2];sis=raw[at(0x8040c680)+i*2:at(0x8040c680)+i*2+2]
   try:
    c=sjis.decode('shift_jis');c=chr(ord(c)-0xfee0) if len(c)==1 and 0xff01<=ord(c)<=0xff5e else c;mapping[c]=sis
   except UnicodeDecodeError:pass
  result={}
  for name in ['MnMaAll.usd','MnMaAll.dat','SdMenu.usd','SdMenu.dat']:
   _,_,offset,size=next(r for r in rows if r[1]==name);f.seek(offset);source=f.read(size)
   result[name]=add_menu(source,module,relocs,label) if name.startswith('Mn') else add_description(source,mapping)
 return result

def patch(prefix):
 from build_character_worlds import dol_sections
 data=bytearray(prefix);_,sections=dol_sections(data)
 def offset(a):
  start,off,size=next(s for s in sections if s[0]<=a<s[0]+s[2]);return off+a-start
 patch_dol(data,offset,assets()[3])
 return bytes(data)
