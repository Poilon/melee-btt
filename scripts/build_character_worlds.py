"""Author 26 themed Target Test courses in a separate Melee USA 1.02 disc.

Geometry is authored; painted artwork uses native HSD texture materials.
Each native stage keeps its ID and archive name but uses the simple Fox stage
callbacks, matching the three-group static map format. Addresses/layouts come
from doldecomp/melee GALE01 (StageData, grt*.c) and Ploaj/HSDLib.
"""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
from build_grassland import Art, Dat, build_stage, iso_table, write_iso, rgb
from character_mansion import Mansion
from character_layouts import LAYOUTS
from character_routes import apply_routes
from stage_texture import texture_scene
from painted_surfaces import fit_surfaces
from stage_access import validate_access
from world_mechanics import apply_mechanics, patch_hazard_callback
from world_challenge import dimensions

# character, world, native archive suffix, StageData RAM address, visual theme,
# ten landing heights along the route. Short steps allow even low jumpers through.
WORLDS = [
 ('Mario','Mushroom Mile','Mr',0x803E85A4,'mushroom',[0,18,36,18,0,20,40,60,40,20]),
 ('Captain Falcon','Mute City Circuit','Ca',0x803E8664,'race',[0,12,24,36,48,32,16,32,48,64]),
 ('Young Link','Kokiri Canopy','Cl',0x803E872C,'kokiri',[0,20,40,60,80,60,40,60,80,100]),
 ('Donkey Kong','Jungle Boardwalk','Dk',0x803E87EC,'jungle',[0,16,32,12,28,48,28,48,68,48]),
 ('Dr. Mario','Capsule Clinic','Dr',0x803E88AC,'clinic',[0,18,36,36,18,0,18,36,54,36]),
 ('Falco','Corneria Rooftops','Fc',0x803E8974,'city',[0,20,40,60,40,60,80,60,80,100]),
 ('Fox','Orbital Hangar','Fx',0x803E8A34,'space',[0,20,40,60,40,20,40,60,80,60]),
 ('Ice Climbers','Summit Steps','Ic',0x803E8AF4,'ice',[0,16,32,48,64,80,96,112,96,112]),
 ('Kirby','Dream Garden','Kb',0x803E8C0C,'dream',[0,20,40,60,80,100,80,60,80,100]),
 ('Bowser','Lava Keep','Kp',0x803E8CCC,'lava',[0,14,28,42,28,14,28,42,56,42]),
 ('Link','Forest Sanctuary','Lk',0x803E8D8C,'forest',[0,18,36,54,36,18,36,54,72,54]),
 ('Luigi','The Crooked Manor','Lg',0x803E8E4C,'mansion',[0,18,36,54,72,54,36,18,36,54]),
 ('Marth','Altean Ramparts','Ms',0x803E8F0C,'bluecastle',[0,18,36,54,72,72,54,36,54,72]),
 ('Mewtwo','Psychic Containment','Mt',0x803E8FCC,'psychic',[0,20,40,60,80,60,40,20,40,60]),
 ('Ness','Onett After School','Ns',0x803E908C,'town',[0,16,32,48,32,16,0,20,40,60]),
 ('Peach','Royal Gardens','Pe',0x803E914C,'garden',[0,16,32,48,64,48,32,48,64,80]),
 ('Pichu','Battery Workshop','Pc',0x803E920C,'battery',[0,12,24,36,24,12,24,36,48,60]),
 ('Pikachu','Power Plant','Pk',0x803E92CC,'power',[0,18,36,54,36,54,72,54,36,54]),
 ('Jigglypuff','Moonlight Recital','Pr',0x803E9394,'moon',[0,20,40,60,80,100,120,100,80,100]),
 ('Samus','Zebes Depths','Ss',0x803E9454,'alien',[0,18,36,54,72,54,36,18,36,54]),
 ('Sheik','Shadow Shrine','Sk',0x803E9514,'shadow',[0,20,40,60,80,100,80,60,40,60]),
 ('Yoshi','Eggshell Hills','Ys',0x803E95D4,'island',[0,20,40,20,40,60,80,60,40,60]),
 ('Zelda','Temple of Light','Zd',0x803E9694,'temple',[0,18,36,54,72,90,72,54,72,90]),
 ('Mr. Game & Watch','Fire Rescue','Gw',0x803E9754,'lcd',[0,16,32,48,64,48,32,16,32,48]),
 ('Roy','Ember Bastion','Fe',0x803E981C,'redcastle',[0,18,36,54,36,18,36,54,72,90]),
 ('Ganondorf','Dark Citadel','Gn',0x803E98DC,'citadel',[0,16,32,48,64,48,32,48,64,80]),
]
# sky, distant scenery, solid face, solid highlight / accent
PALETTES = {
 'mushroom':('8bd8ee','8bcea5','e4a75c','82df67'),
 'race':('131b3f','263866','273953','54f4ed'),
 'kokiri':('122d32','275c50','815a38','a7de68'),
 'jungle':('133c3f','286447','94643b','72d777'),
 'clinic':('ceeaf0','a8d7dd','fbf7e8','f47773'),
 'city':('eaac91','b5798a','526a89','b9e6ef'),
 'space':('09182c','20374f','41596d','65e3e9'),
 'ice':('203b65','487997','76becf','e7fcfc'),
 'dream':('edbbdc','c398d7','efb5ce','ffe399'),
 'lava':('281d30','51303b','664342','ffad53'),
 'forest':('163e42','285957','798b69','badb84'),
 'mansion':('181c38','2c3555','575373','c2d98e'),
 'bluecastle':('9cc4e1','789fc0','8796ac','e1e6df'),
 'psychic':('1b1939','373153','615d88','dcb5ff'),
 'town':('a4d9d9','6dadab','ce8c73','fff1b0'),
 'garden':('f6d6d5','c1d9b2','dfc5b4','fff0d0'),
 'battery':('efe1ad','d1c796','6b9799','fff185'),
 'power':('182e3d','30495a','657b86','f5d956'),
 'moon':('262443','554467','c8b5db','ffdec5'),
 'alien':('192b30','2d514b','5e7661','b2ea83'),
 'shadow':('202039','403753','75677d','be8ccc'),
 'island':('b3e7e7','8fcba9','efc2a1','d1ed93'),
 'temple':('e6d8b7','bfbaa1','d1c9b2','fff0af'),
 'lcd':('b7be9d','9ca789','303c34','67735c'),
 'redcastle':('6b3b49','935359','867071','ffbd83'),
 'citadel':('171422','302738','635a70','beb3cf'),
}

class WorldArt(Art):
    def __init__(self, spec, index):
        super().__init__()
        self.character,self.name,self.suffix,self.address,self.theme,self.heights=spec
        self.world_assets=Path(__file__).resolve().parents[1]/'assets/custom-stages/worlds'/self.suffix
        self.painted_scene=self.world_assets/'painted.png'
        self.sky,self.far,self.face,self.accent=['#'+c for c in PALETTES[self.theme]]
        # Vary horizontal spacing and stagger the platforms, with a conservative
        # maximum 22-unit rise and 22-unit edge gap. These are authored courses.
        self.points=[(-300+i*65+(0 if i in (0,9) else ((i+index)%3-1)*4),y)
                     for i,y in enumerate(self.heights)]
        self.targets=[(x+(3 if i%2 else -3),y+14) for i,(x,y) in enumerate(self.points)]
        self.spawn=(-317,2)
        self.layout=LAYOUTS.get(self.theme)
        if self.layout:
            self.targets=self.layout['targets'];self.spawn=self.layout['spawn']
            self.bounds=self.layout['bounds'];l,t,r,b=self.bounds
            self.preview_bounds=(l,t,r,-70)
            if (r-l)/(t+70)>2.4:
                extra=((r-l)/2.4-(t+70))/2
                self.preview_bounds=(l,t+extra,r,-70-extra)
            self.points=[]
        if self.suffix in ('Dr','Mr','Kp','Pe','Ys','Dk','Ca','Fc','Fx'):
            # Artwork includes a generous border beyond the playable camera box.
            self.preview_bounds=tuple(json.loads((self.world_assets/'scene.json').read_text())['bounds'])

    def model(self,d):
        if getattr(self,'native_fire',False):
            from world_mechanics import colour_mesh
            return colour_mesh(d,self)
        background=Art();background.rect(-1200,-600,2400,1800,self.sky,-150)
        first=background.model(d)
        d.pointer(first+4,texture_scene(d,directory=self.world_assets,cuts=getattr(self,'floor_voids',())))
        return first

    def star(self,x,y,r,color,z=-30):
        # Individual triangles avoid a concave polygon fan.
        points=[(x+math.sin(i*math.pi/5)*r*(1 if i%2==0 else .43),
                 y+math.cos(i*math.pi/5)*r*(1 if i%2==0 else .43)) for i in range(10)]
        for i in range(10):self.polygon([(x,y),points[i],points[(i+1)%10]],color,z)

    def cloud(self,x,y,r=18,color='#fff4ea'):
        for dx,dy,rr in [(-.7,0,.7),(0,.25,1),(.8,0,.65)]:
            self.ellipse(x+dx*r,y+dy*r,rr*r,rr*r*.6,color,-80)

    def tree(self,x,y,h,palm=False):
        self.rect(x-3,y,6,h,'#65553d',-35)
        if palm:
            for dx,dy in [(-35,8),(-25,22),(28,18),(38,0),(-28,-8),(24,-10)]:
                self.polygon([(x,y+h-4),(x+dx,y+h+dy),(x+dx*.6,y+h+dy+8)],self.accent,-34)
        else:
            for dx,dy,r in [(-14,-4,24),(15,0,25),(0,20,29)]:
                self.ellipse(x+dx,y+h+dy,r,r*.9,self.far,-36)
                self.ellipse(x+dx-3,y+h+dy+5,r*.8,r*.7,'#3e8063',-35.8)

    def tower(self,x,y,w,h,roof,banner=None):
        self.rect(x,y,w,h,self.far,-55)
        for yy in range(int(y+8),int(y+h),14):
            self.rect(x+2,yy,w-4,.7,self.face,-54.9)
        if roof:
            self.polygon([(x-6,y+h),(x+w/2,y+h+25),(x+w+6,y+h)],roof,-54)
        else:
            for xx in range(int(x),int(x+w),12):self.rect(xx,y+h,7,8,self.far,-55)
        for yy in range(int(y+15),int(y+h-10),25):
            self.panel(x+w*.4,yy,w*.2,12,self.accent,-53,border=1.5)
        if banner:
            self.rect(x+w*.65,y+h-34,10,25,banner,-52)
            self.polygon([(x+w*.65,y+h-34),(x+w*.65+5,y+h-40),(x+w*.65+10,y+h-34)],banner,-52)

    def triforce(self,x,y,s,z=-25):
        for dx,dy in [(0,s),(-s/2,0),(s/2,0)]:
            self.polygon([(x+dx,y+dy+s),(x+dx-s/2,y+dy),(x+dx+s/2,y+dy)],'#f8d17b',z)

    def backdrop(self):
        t=self.theme
        self.rect(-1100,-450,2200,1100,self.sky,-160)
        # Sky motifs and deep silhouettes are deliberately separate from playable surfaces.
        if t in ('space','race','moon','ice','psychic','shadow','mansion'):
            for i in range(64):
                x=-460+(i*137)%920;y=35+(i*67)%220
                self.ellipse(x,y,.65+(i%3)*.25,.65+(i%3)*.25,'#d8ddec',-130,8)
        if t in ('mushroom','island','dream','garden','town','bluecastle','city'):
            for i in range(7):self.cloud(-400+i*135,135+(i%3)*18,16+i%3*3)
        if t in ('mushroom','island','dream'):
            for i in range(9):
                x=-440+i*110;h=55+(i%3)*20
                self.ellipse(x,0,65,h,self.far,-90)
                if t!='dream':
                    for dx in (-5,5):self.ellipse(x+dx,h*.65,1.3,3,'#426464',-89)
            if t=='island':
                for x in (-325,-155,30,220,350):
                    self.ellipse(x,60,15,21,'#fff9df',-45)
                    for dx,dy in [(-6,4),(6,10),(3,-8)]:self.ellipse(x+dx,60+dy,4,5,'#78b998',-44)
            if t=='dream':
                for x,y in [(-250,100),(-90,145),(70,123),(265,156)]:self.star(x,y,16,'#fff0ab')
                for i,col in enumerate(['#df93b4','#ead1a2','#acd0ba','#a5bdcf']):
                    # Rainbow band across the backdrop, no collision.
                    for j in range(24):
                        a=j*math.pi/24;b=(j+1)*math.pi/24;r=145-i*6
                        self.polygon([(math.cos(a)*r,math.sin(a)*r-55),(math.cos(b)*r,math.sin(b)*r-55),
                         (math.cos(b)*(r-5),math.sin(b)*(r-5)-55),(math.cos(a)*(r-5),math.sin(a)*(r-5)-55)],col,-70)
        elif t in ('jungle','kokiri','forest'):
            for i in range(9):
                x=-430+i*105
                self.rect(x,-80,18,300,self.far,-95)
                self.tree(x+9,-5,70+(i%3)*22,t=='jungle')
            if t=='jungle':
                for x in range(-340,400,95):
                    for j in range(18):self.ellipse(x+math.sin(j*.19)*14,190-j*9,1.3,5,'#72a773',-50,8)
            elif t=='forest':
                for x in (-250,-20,210):
                    self.tower(x,-15,42,85,None)
                    self.triforce(x+20,78,10)
            else:
                for x in (-240,-15,220):
                    self.ellipse(x,34,24,32,'#a58655',-40)
                    self.ellipse(x,25,9,18,'#25433a',-39)
                    self.polygon([(x-35,55),(x,91),(x+35,55)],'#719d57',-38)
                    for dx in (-55,55):self.star(x+dx,90,2,'#cff5c9')
        elif t in ('bluecastle','redcastle','garden','temple','desert','lava','shadow','mansion'):
            if t=='mansion':
                self.ellipse(215,150,32,32,'#e6e5b7',-100)
                for x,w,h in [(-290,70,110),(-205,100,145),(-95,80,115),(0,110,175),(115,75,135),(200,80,110)]:
                    self.tower(x,-20,w,h,'#34314e')
                for x,y in [(-175,100),(65,80),(245,150)]:
                    self.ellipse(x,y,10,11,'#cbd9c0',-38)
                    self.polygon([(x-10,y),(x-10,y-13),(x-3,y-8),(x+3,y-13),(x+10,y-8),(x+10,y)],'#cbd9c0',-38)
                    for dx in (-3,3):self.ellipse(x+dx,y+2,1.3,2.5,'#424655',-37)
            elif t=='desert':
                self.ellipse(-200,153,35,35,'#f3d49b',-100)
                for x,y in [(-340,60),(-120,95),(100,65),(300,110)]:
                    self.polygon([(x-130,-40),(x,y),(x+140,-40)],self.far,-90)
                for x in (-230,-70,90,250):self.tower(x,-20,52,120,None,'#644653')
                self.triforce(0,150,20)
            elif t=='shadow':
                for x in (-315,-185,-55,75,205,335):
                    self.rect(x,-25,18,205,self.far,-70)
                    self.panel(x-6,145,30,12,self.face,-69)
                # Sheikah-inspired eye motif.
                self.ellipse(0,140,39,18,'#b595c6',-40)
                self.ellipse(0,140,28,11,self.sky,-39)
                self.ellipse(0,140,6,11,'#d2b6df',-38)
                self.polygon([(-5,116),(5,116),(0,101)],'#d2b6df',-38)
            elif t=='temple':
                for x in (-280,-170,130,240):
                    self.rect(x,-30,22,175,self.far,-60)
                    self.rect(x-6,135,34,12,self.face,-59)
                self.polygon([(-320,147),(0,220),(320,147)],self.face,-65)
                self.triforce(0,123,29)
                for x in (-90,70):self.panel(x,35,20,72,'#cfb7cc',-58)
            else:
                roof={'garden':'#d5889f','bluecastle':'#435e94','redcastle':'#783d51','lava':'#443140'}[t]
                for i,x in enumerate((-350,-230,-85,65,210,330)):
                    self.tower(x,-30,55,100+(i%3)*27,roof,roof)
                if t=='garden':
                    for x in range(-350,400,75):
                        self.ellipse(x,0,30,22,'#8db69a',-20)
                        for dx in (-15,0,15):self.ellipse(x+dx,12,4,4,'#efacb9',-19)
                if t in ('lava','redcastle'):
                    self.rect(-600,-75,1200,40,'#cd624b',-45)
                    for x in range(-540,600,45):
                        self.ellipse(x,-42,25,5,'#ffae58',-44)
                    for x in (-280,-140,0,140,280):
                        self.rect(x,50,4,14,'#997259',-39)
                        self.polygon([(x-5,64),(x+2,86),(x+9,64)],'#ffac5b',-38)
        elif t in ('space','city','race'):
            if t=='space':
                self.ellipse(170,120,53,53,'#577f94',-120)
                self.ellipse(156,130,39,34,'#94b8b9',-119)
                for x in (-370,-120,130,380):
                    self.rect(x,-50,7,300,'#38576c',-70)
                    self.rect(x+8,-50,2,300,'#608998',-69)
                self.rect(-500,190,1000,14,self.far,-65)
                # Arwing silhouette: four convex pieces.
                self.polygon([(-100,90),(-50,111),(10,90),(-45,80)],'#a9c7cf',-45)
                self.polygon([(-50,110),(-125,135),(-80,95)],'#6a98b8',-44)
                self.polygon([(-45,110),(15,135),(-5,95)],'#6a98b8',-44)
                self.polygon([(-65,97),(-48,120),(-31,97)],'#e4eded',-43)
            else:
                for i in range(17):
                    x=-440+i*55;h=50+(i*37)%95
                    self.rect(x,-40,40,h,self.far,-80)
                    for yy in range(0,h-45,12):
                        for dx in (8,23):self.rect(x+dx,yy,5,4,'#c4c6bd',-79)
                if t=='race':
                    for y in (15,60,115):
                        self.rect(-480,y,960,3,'#687cbc',-65)
                        self.rect(-480,y-5,960,1,'#b881d6',-64)
                    for x in (-230,60,265):
                        self.polygon([(x-30,85),(x-20,96),(x+20,96),(x+35,85)],'#6496d2',-40)
                        self.rect(x-10,96,15,5,'#cfe8de',-39)
                else:
                    for x in (-250,0,250):
                        self.rect(x,70,4,45,'#536f8a',-40)
                        self.ellipse(x+2,118,12,3,'#e2dbcd',-39)
        elif t in ('clinic','battery','power','psychic','alien'):
            if t=='alien':
                for i in range(16):
                    x=-420+i*58;h=45+(i*17)%60
                    self.polygon([(x-40,-60),(x-22,h),(x+5,h+16),(x+34,-60)],self.far,-80)
                    self.polygon([(x-20,260),(x+5,155-i%3*20),(x+30,260)],self.far,-80)
                for x in (-265,-80,110,290):
                    self.ellipse(x,105,17,21,'#67af9a',-43)
                    self.ellipse(x,109,12,14,'#a1d6aa',-42)
                    for dx in (-7,7):self.polygon([(x+dx-3,91),(x+dx,82),(x+dx+3,92)],'#eab897',-41)
            else:
                for x in range(-440,500,70):self.rect(x,-70,1,310,self.far,-120)
                for y in range(-50,240,45):self.rect(-500,y,1000,1,self.far,-120)
                for i,x in enumerate((-285,-135,15,165,315)):
                    if t=='clinic':
                        self.panel(x-28,40,56,85,'#eaf7ec',-60)
                        self.rect(x-4,133,8,25,'#ed8e87',-50);self.rect(x-12,142,24,8,'#ed8e87',-50)
                        self.ellipse(x,73,13,13,['#ee817e','#83b9cb','#dfc978'][i%3],-45)
                        for dx in (-4,4):self.rect(x+dx,76,2,3,'#416379',-44)
                    elif t=='psychic':
                        self.panel(x-26,25,52,120,'#7c7b9e',-60)
                        self.panel(x-21,38,42,94,'#aaa2c0',-59)
                        self.ellipse(x,82,12,20,'#6c648b',-58)
                        for k in range(6):self.ellipse(x+(-8 if k%2 else 10),48+k*13,2,2,'#d7c8e6',-57)
                        self.rect(x-30,145,60,7,self.face,-55)
                    else:
                        self.panel(x-20,25,40,87,self.face,-60)
                        self.rect(x-9,112,18,6,self.accent,-59)
                        self.rect(x-13,32,26,68,self.far,-58)
                        # Lightning bolt split into convex triangles.
                        self.polygon([(x+5,95),(x-10,68),(x+4,70)],self.accent,-57)
                        self.polygon([(x-4,75),(x+10,77),(x-6,48)],self.accent,-57)
                        for xx in range(int(x-26),int(x+28),8):self.rect(xx,128,5,4,self.accent,-55)
                if t=='power':
                    for y in (10,160):self.rect(-450,y,900,5,'#526b78',-70)
        elif t=='ice':
            for i,x in enumerate(range(-470,600,150)):
                h=110+i%3*40
                self.polygon([(x-130,-65),(x,h),(x+130,-65)],self.far,-90)
                self.polygon([(x-32,h-43),(x,h),(x+32,h-43)],'#cbe4e7',-89)
            for i in range(4):
                for j in range(24):self.rect(-420+j*36,180+i*8+math.sin(j*.23+i)*16,37,4,['#67aaa7','#81c2b8','#76a9bd','#7486af'][i],-100)
        elif t=='town':
            for i,x in enumerate(range(-360,400,130)):
                col=['#e3b999','#d5aaaf','#9ec3b8'][i%3]
                self.panel(x,-10,90,72,col,-70)
                self.polygon([(x-8,62),(x+45,98),(x+98,62)],'#7c6d78',-69)
                for dx in (13,58):self.panel(x+dx,23,19,22,'#eae8bf',-68)
                self.panel(x+38,-10,17,32,'#a97b68',-68)
            self.rect(-460,-30,920,15,'#819f9b',-60)
            for x in range(-420,450,50):self.rect(x,-23,22,2,'#e6d8aa',-59)
        elif t=='moon':
            self.ellipse(190,147,36,36,'#ffe2b9',-100)
            self.ellipse(204,155,30,30,self.sky,-99)
            for i,x in enumerate(range(-320,380,95)):
                self.cloud(x,45+i%3*23,25,'#6e5e84')
                self.star(x+20,150+i%2*30,7,'#e8cda7')
                self.rect(x-12,90,1.8,17,'#b9a0bd',-35)
                self.ellipse(x-16,90,5,3,'#b9a0bd',-34)
        elif t=='lcd':
            self.panel(-380,-70,770,300,'#b7be9d',-120,border=8)
            for x in range(-330,360,85):
                self.rect(x,132,32,3,self.far,-90)
                self.rect(x,97,32,3,self.far,-90)
                self.rect(x,62,32,3,self.far,-90)
                for dx in (0,29):self.rect(x+dx,63,3,70,self.far,-90)
            # Flat LCD skyline and little clock.
            self.ellipse(0,178,18,18,self.face,-60)
            self.ellipse(0,178,15,15,self.sky,-59)
            self.rect(-1,177,2,12,self.face,-58);self.rect(-1,177,10,2,self.face,-58)
        return self

    def platform(self,x,y,w,i):
        t=self.theme;h=9
        pillars=t in ('mushroom','city','lava','bluecastle','redcastle','desert','town','temple','forest')
        if pillars:h=y+36
        self.solid(x-w/2,y-h,w,h,4)
        self.panel(x-w/2,y-h,w,h,self.face,2,border=1)
        self.rect(x-w/2+1,y-3,w-2,2,self.accent,2.3)
        if t in ('space','race','power','battery','psychic','clinic'):
            self.rect(x-w/2+4,y-h+2,w-8,1,self.accent,2.2)
            for dx in (-w/2+5,w/2-5):self.ellipse(x+dx,y-5,1,1,'#e7e8d5',2.4,8)
        elif t in ('jungle','kokiri'):
            for dx in range(-int(w/2)+6,int(w/2),10):self.rect(x+dx,y-h+1,1,h-2,'#4e513c',2.3)
            for dx in (-w/2+4,w/2-4):self.rect(x+dx,y-h,2,h+3,'#e1ba7d',2.4)
        elif t=='ice':
            for dx in (-w/2+8,0,w/2-8):
                self.polygon([(x+dx-4,y-h),(x+dx,y-h-9),(x+dx+4,y-h)],self.accent,1)
        elif t in ('dream','moon','island','garden'):
            for dx in (-w/2+7,0,w/2-7):self.ellipse(x+dx,y-5,3,2,self.accent,2.3)
        elif t in ('mansion','shadow','lcd'):
            for dx in range(-int(w/2)+5,int(w/2)-2,9):self.rect(x+dx,y-7,5,1,self.accent,2.3)
        else:
            for yy in range(int(y-h+8),int(y-4),12):
                self.rect(x-w/2+1,yy,w-2,.7,self.far,2.2)
                self.rect(x+(0 if yy%24<12 else -w/4),yy,1,11,self.far,2.2)
        if t=='mushroom' and i in (2,5,8):
            # The pipe is the solid platform itself, no deceptive background collision.
            self.panel(x-w/2,y-8,w,8,'#73bf64',2.5)
            self.rect(x-w/2+5,y-h+2,5,h-11,'#b2e389',2.5)
        if t=='clinic':
            self.rect(x,y-h+1,w/2-1,h-2,'#7dbbcf',2.2)
        if t=='alien':
            for dx in (-w/2+7,w/2-7):self.ellipse(x+dx,y-6,2.5,2,'#cbec9a',2.3)

    def gradient(self,x,y,w,h,bottom,top,z):
        a=rgb(bottom);b=rgb(top)
        self.triangles.extend([[(x,y,z,a),(x+w,y,z,a),(x+w,y+h,z,b)],
                               [(x,y,z,a),(x+w,y+h,z,b),(x,y+h,z,b)]])

    def structure(self):
        t=self.theme
        # Give tall levels their own silhouette, extending well beyond the old
        # horizon. These silhouettes explain the playable branches/ledges.
        if t in ('kokiri','jungle'):
            trunks=[(0,260,55)] if t=='kokiri' else [(-223,170,48),(0,234,55),(230,210,48)]
            for x,h,w in trunks:
                self.gradient(x-w/2,-40,w,h+40,'#343b32','#806c46',-12)
                for j in range(8):
                    xx=x-w/2+4+j*w/9
                    self.polygon([(xx,-30),(xx+2,h*.4),(xx-3,h*.8),(xx+1,h)],'#b5955b',-11.8)
                for dx,dy,r in [(-42,0,53),(39,14,58),(0,44,65)]:
                    self.ellipse(x+dx,h+dy,r,r*.6,'#286050',-20)
                    self.ellipse(x+dx-6,h+dy+7,r*.8,r*.43,'#4d8b62',-19.8)
        if t=='ice':
            self.polygon([(-170,-45),(-98,162),(0,317),(113,152),(173,-45)],'#477689',-15)
            self.polygon([(-98,162),(0,317),(0,-45),(-170,-45)],'#80a7ae',-14.8)
            self.polygon([(-44,246),(0,317),(53,235),(18,252),(3,240),(-14,261)],'#d4e8df',-14.5)
        if t in ('space','power','psychic','battery'):
            l,top,r,_=self.bounds
            self.gradient(l+15,-30,r-l-30,top-20,'#142633',self.far,-25)
            for xx in range(int(l+20),int(r-15),30):
                self.rect(xx,-15,2,top-24,'#405261',-24)
                self.rect(xx+3,-15,.6,top-24,'#75827e',-23.9)
            if t=='space':
                self.ellipse(0,92,59,53,'#607c88',-20)
                self.ellipse(0,92,51,45,'#142534',-19.8)
                self.ellipse(13,99,23,23,'#71979d',-19.7)
        if t in ('alien','shadow'):
            l,top,r,_=self.bounds
            self.gradient(l+15,-60,r-l-30,top+35,'#14242d',self.far,-25)
            for i in range(11):
                x=l+22+i*(r-l-44)/10
                self.polygon([(x-12,top+10),(x,top-65-(i%3)*13),(x+17,top+10)],'#1b3038',-20)
        for index,(x,y,w,h) in enumerate(self.layout['surfaces']):
            if y>0 and h<=22 and index not in self.layout.get('solidIndices',[]):self.platform_surface(x,y,w,4)
            else:self.solid(x,y-h,w,h,4)
            if t in ('kokiri','jungle'):
                self.gradient(x,y-h,w,h,'#3f3c2e','#a98a51',1)
                self.rect(x,y-1.2,w,1.2,'#bfac73',1.2)
                for yy in range(int(y-h+3),int(y-2),5):
                    self.rect(x+3,yy,w-6,.55,'#665638',1.3)
                for xx in range(int(x+7),int(x+w-4),21):
                    self.ellipse(xx,y-h/2,3.8,min(h*.28,7),'#74603d',1.4,12)
            elif t in ('ice','dream','moon','island'):
                self.gradient(x,y-h,w,h,self.face,self.accent,1)
                self.rect(x,y-1,w,1,'#e7eedc',1.2)
                for xx in range(int(x+6),int(x+w-3),12):
                    self.polygon([(xx,y-h),(xx+4,y-h-5),(xx+7,y-h)],self.face,.8)
                if t=='ice':
                    self.polygon([(x+2,y-h+2),(x+w*.35,y-3),(x+w*.6,y-h+2)],'#b5d7d3',1.4)
                else:
                    for xx in range(int(x+8),int(x+w-5),17):self.ellipse(xx,y-3,5,2,'#eee4c5',1.4)
            elif t in ('space','race','power','psychic','battery','clinic'):
                self.gradient(x,y-h,w,h,'#1a2c36',self.face,1)
                self.rect(x,y-2,w,2,self.accent,1.2)
                self.rect(x+2,y-h+2,w-4,1,'#738789',1.3)
                for xx in range(int(x+6),int(x+w-5),24):
                    self.rect(xx,y-h+4,1,max(1,h-8),'#8d9c91',1.4)
                    self.ellipse(xx,y-5,1,1,'#d0dbc5',1.5,8)
                if t in ('power','battery') and h>40:
                    for yy in range(int(y-h+10),int(y-10),16):self.rect(x+7,yy,w-14,5,self.accent,1.6)
                if t=='clinic':
                    self.rect(x+w/2,y-h+2,w/2-2,max(1,h-5),'#ae777d',1.6)
            elif t in ('alien','forest','desert'):
                self.gradient(x,y-h,w,h,'#2c3e40',self.face,1)
                self.rect(x,y-2,w,2,self.accent,1.2)
                for k in range(max(1,int(w/22))):
                    xx=x+4+k*22;hh=min(h-3,9+k%3*6)
                    self.polygon([(xx,y-3),(min(xx+18,x+w-2),y-3),(min(xx+10,x+w-2),y-hh)],self.far,1.3)
                if t=='alien':
                    for xx in range(int(x+10),int(x+w-8),29):self.ellipse(xx,y-6,2.5,2,'#c0d59a',1.5,12)
            elif t=='lcd':
                self.rect(x,y-h,w,h,'#303c34',1)
                self.rect(x+2,y-h+2,w-4,max(1,h-4),'#6f7a61',1.2)
                for xx in range(int(x+4),int(x+w-3),12):self.rect(xx,y-3,6,1,'#b7be9d',1.3)
            else:
                self.gradient(x,y-h,w,h,'#3c3d44',self.face,1)
                self.rect(x,y-2,w,2,self.accent,1.2)
                for yy in range(int(y-h+4),int(y-4),12):
                    self.rect(x+1,yy,w-2,.6,self.far,1.3)
                    for xx in range(int(x+7+(yy%24)),int(x+w-4),28):self.rect(xx,yy,.6,10,self.far,1.4)
                if t in ('bluecastle','redcastle','lava','temple') and w>100:
                    for xx in range(int(x+8),int(x+w-7),26):
                        self.rect(xx,y-h+2,10,4,'#b1a18a',1.5)
        return self

    def build(self):
        if self.suffix=='Gw':
            from character_fire import build_fire
            return build_fire(self)
        self.backdrop()
        if self.layout:return fit_surfaces(self.structure())
        # A low recovery floor for grounded themes; aerial worlds use only the
        # authored stepping islands. Decorative backgrounds never block movement.
        aerial=self.theme in ('space','ice','dream','moon','race','shadow','island')
        if not aerial:
            self.solid(-342,-90,675,54,2)
            self.panel(-342,-90,675,54,self.face,1)
            self.rect(-341,-39,673,2,self.accent,1.2)
        for i,(x,y) in enumerate(self.points):self.platform(x,y,50+(i%3)*2,i)
        # A small visible starting flag and endpoint beacon.
        self.rect(-320,0,1.5,16,self.accent,-3)
        self.polygon([(-318.5,16),(-307,12),(-318.5,8)],self.accent,-3)
        x,y=self.points[-1]
        self.rect(x+19,y,1.5,27,self.accent,-3)
        self.ellipse(x+19.7,y+28,2.5,2.5,self.accent,-3)
        return fit_surfaces(self)


def dol_sections(prefix):
    base=struct.unpack_from('>I',prefix,0x420)[0]
    sections=[]
    for i in range(18):
        off=struct.unpack_from('>I',prefix,base+i*4)[0]
        address=struct.unpack_from('>I',prefix,base+0x48+i*4)[0]
        size=struct.unpack_from('>I',prefix,base+0x90+i*4)[0]
        if size:sections.append((address,base+off,size))
    return base,sections


def patch_callbacks(prefix):
    data=bytearray(prefix);base,sections=dol_sections(data)
    def offset(address):
        for start,off,size in sections:
            if start<=address<start+size:return off+address-start
        raise ValueError(f'DOL address not mapped: {address:08x}')
    fox=offset(0x803E8A34);template=data[fox:fox+52]
    # Fail closed on another executable revision or unexpected StageData layout.
    if struct.unpack_from('>I',template,12)[0]!=0x80220B84:raise ValueError('Unexpected Fox callbacks')
    for _,_,suffix,address,_,_ in WORLDS:
        p=offset(address);nameptr=struct.unpack_from('>I',data,p+8)[0]
        n=offset(nameptr);expected=f'/GrT{suffix}.dat\0'.encode()
        if data[n:n+len(expected)]!=expected:raise ValueError(f'Unexpected archive pointer: {suffix}')
        # Keep original grkind + filename; replace callbacks, flags, dynamic-joint
        # tables. Every archive now has the same static three-model-group schema.
        data[p+4:p+8]=template[4:8]
        data[p+12:p+52]=template[12:52]
    patch_hazard_callback(data,offset)
    from world_mechanics import patch_boost_callback
    patch_boost_callback(data,offset)
    from corneria_arwings import patch_callback
    patch_callback(data,offset)
    from world_chest import patch_callback as patch_chest
    patch_chest(data,offset)
    from native_props import patch_wind
    patch_wind(data,offset)
    from native_encounters import patch_callback as patch_retail
    patch_retail(data,offset)
    from world_items import patch_callback as patch_items
    patch_items(data,offset)
    return bytes(data)


def dol_digest(path):
    with path.open('rb') as f:
        f.seek(0x420);base=struct.unpack('>I',f.read(4))[0];f.seek(base);header=f.read(0x100)
        end=max(struct.unpack_from('>I',header,i*4)[0]+struct.unpack_from('>I',header,0x90+i*4)[0] for i in range(18))
        f.seek(base);return hashlib.sha256(f.read(end)).hexdigest()


def validate_art(art):
    if len(art.targets)!=10:raise ValueError('Every course needs ten targets')
    for i,(x,y) in enumerate(art.targets):
        for sx,sy,w,h,_ in art.solids:
            if sx-7<x<sx+w+7 and sy-7<y<sy+h+7:
                raise ValueError(f'{art.character}: target {i+1} intersects solid geometry')
    for i,(x,y) in enumerate(art.targets):
        if any(sx-7<x<sx+w+7 and abs(y-sy)<7 for sx,sy,w,_ in art.platforms):
            raise ValueError(f'{art.character}: target {i+1} intersects a soft platform')
    # Connectivity of surfaces replaces the old left-to-right staircase rule.
    # This is a structural check, not a simulation of every character's moves.
    surfaces=[(x,x+w,y+h) for x,y,w,h,_ in art.solids]+[(x,x+w,y) for x,y,w,_ in art.platforms]
    if art.suffix in ('Dk','Ca','Fc','Gn','Fx','Cl','Kb'):
        from stage_access import audit_landings
        surfaces=audit_landings(art)
    reachable={i for i,(l,r,y) in enumerate(surfaces) if l<=art.spawn[0]<=r and abs(y+2-art.spawn[1])<.01}
    # Painted rims can shift a nominal 42-unit step by a few units. Check the
    # character's audited jump budget, with margin, rather than the blockout grid.
    profile=getattr(art,'movement_profile',{})
    from stage_access import climb_budget
    climb=climb_budget(art) if profile else 42
    changed=True
    while changed:
        changed=False
        for i,(l,r,y) in enumerate(surfaces):
            if i in reachable:continue
            if any(-(220 if art.suffix=='Fc' else 120)<=y-surfaces[j][2]<=climb and max(l-surfaces[j][1],surfaces[j][0]-r,0)<=(105 if art.suffix=='Ns' else 75 if art.suffix=='Kb' else 50) for j in reachable):
                reachable.add(i);changed=True
    for i,(x,y) in enumerate(art.targets):
        edge,height=(24,60) if hasattr(art,'route_notes') else (20,42)
        if not any(l-edge<=x<=r+edge and (7<=y-top<=height or (-30<=y-top<=-7 and (j>=len(art.solids) or x<l-7 or x>r+7))) for j,(l,r,top) in enumerate(surfaces) if j in reachable):
            raise ValueError(f'{art.character}: target {i+1} lacks a reachable supporting surface')
    if not any(l<=art.spawn[0]<=r and abs(y+2-art.spawn[1])<.01 for l,r,y in surfaces):
        raise ValueError('Spawn must be on a platform')
    if hasattr(art,'movement_profile'):art.access_audit=validate_access(art)


def preview_world(art,path):
    from PIL import Image,ImageDraw,ImageOps
    left,top,right,bottom=getattr(art,'preview_bounds',(-360,210,360,-90))
    scale=1440/(right-left);im=Image.new('RGB',(1440,round((top-bottom)*scale)),art.sky);draw=ImageDraw.Draw(im)
    if hasattr(art,'painted_scene'):
        scene=json.loads((art.painted_scene.parent/'scene.json').read_text())
        il,it,ir,ib=scene['bounds']
        painted=Image.open(art.painted_scene).convert('RGB').resize(
            (round((ir-il)*scale),round((it-ib)*scale)),Image.Resampling.LANCZOS)
        im.paste(painted,(round((il-left)*scale),round((top-it)*scale)))
        if scene.get('platformCopies'):
            source=Image.open(art.painted_scene).convert('RGB')
            for copy in scene['platformCopies']:
                x,y,w=copy['surface'];h=copy['height']
                patch=source.crop(copy['sourcePixels']).resize((round(w*scale),round(h*scale)),Image.Resampling.LANCZOS)
                im.paste(patch,(round((x-left)*scale),round((top-y)*scale)))
        if hasattr(art,'ledge_platforms'):
            ledge=Image.open(art.painted_scene.parent/'ledge.png').convert('RGB')
            for x,y,w,_ in art.ledge_platforms:
                im.paste(ledge.resize((round(w*scale),round(7*scale)),Image.Resampling.LANCZOS),
                         (round((x-left)*scale),round((top-y)*scale)))
        draw=ImageDraw.Draw(im)
    triangles=[] if hasattr(art,'painted_scene') else art.triangles
    for tri in sorted(triangles,key=lambda t:t[0][2]):
        coords=[((x-left)*scale,(top-y)*scale) for x,y,z,c in tri]
        if len({c for x,y,z,c in tri})==1:
            draw.polygon(coords,fill=tuple(tri[0][3][:3]));continue
        x0=max(0,int(min(x for x,y in coords)));x1=min(im.width,int(max(x for x,y in coords))+1)
        y0=max(0,int(min(y for x,y in coords)));y1=min(im.height,int(max(y for x,y in coords))+1)
        if x1<=x0 or y1<=y0:continue
        low=min(tri,key=lambda v:v[1]);high=max(tri,key=lambda v:v[1])
        def color_at(pixel_y):
            a=max(0,min(1,((top-pixel_y/scale)-low[1])/(high[1]-low[1])))
            return tuple(round(low[3][i]*(1-a)+high[3][i]*a) for i in range(3))
        gradient=ImageOps.colorize(Image.linear_gradient('L').resize((x1-x0,y1-y0)),color_at(y0),color_at(y1))
        mask=Image.new('L',(x1-x0,y1-y0));ImageDraw.Draw(mask).polygon([(x-x0,y-y0) for x,y in coords],fill=255)
        im.paste(gradient,(x0,y0),mask)
    for x,y in art.targets:
        for r,c in [(7,'#fff9e7'),(5.6,'#e84057'),(3.4,'#fff9e7'),(1.6,'#e84057')]:
            draw.ellipse(((x-left-r)*scale,(top-y-r)*scale,(x-left+r)*scale,(top-y+r)*scale),fill=c)
    im.save(path)
    return im


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--iso',type=Path,required=True);ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--no-preview',action='store_true');ap.add_argument('--stage-only',action='store_true')
    ap.add_argument('--editor-project',type=Path)
    ap.add_argument('--online',action='store_true',help='Add the native online Stadium menu')
    args=ap.parse_args()
    from stage_project import projects_from_document
    projects=projects_from_document(json.loads(args.editor_project.read_text()) if args.editor_project else None,{s[2] for s in WORLDS})
    if args.iso.resolve()==args.output.resolve():ap.error('Keep the original ISO; choose another output')
    _,_,entries=iso_table(args.iso);entry=next(e for e in entries if e[1]=='GrTFx.dat')
    from corneria_arwings import load as load_corneria
    load_corneria(args.iso)
    from native_encounters import load as load_retail
    load_retail(args.iso)
    with args.iso.open('rb') as f:f.seek(entry[2]);source=f.read(entry[3])
    if hashlib.sha256(source).hexdigest()!='1cbe99c391ed027fe87b582f4891cb5f4c80b30d9ba703a804d61010ee6682c2':
        raise ValueError('Expected the original USA 1.02 Fox archive')
    out=args.output.parent;out.mkdir(parents=True,exist_ok=True)
    stage_dir=out/'character-worlds';stage_dir.mkdir(exist_ok=True)
    archives={};manifest={'name':'Character Worlds','version':5,'courses':[],'stageHashes':{}}
    previews=[]
    for i,spec in enumerate(WORLDS):
        art=(Mansion(spec,i) if spec[4]=='mansion' else WorldArt(spec,i)).build()
        apply_routes(art);validate_art(art)
        apply_mechanics(art)
        if art.suffix in projects:
            from stage_project import apply as apply_editor_project
            apply_editor_project(art,projects[art.suffix])
        data,_=build_stage(source,art,art.targets,art.spawn,tuple(rgb(art.sky)[:3]),getattr(art,'bounds',(-365,205,350,-25)))
        name=f'GrT{art.suffix}.dat'
        # Ground_801C28CC looks up this native StKind in the archive's stage
        # parameter table before callbacks run. Keep each original ID/music row.
        entry=next(e for e in entries if e[1]==name)
        with args.iso.open('rb') as f:f.seek(entry[2]);original=Dat(f.read(entry[3]))
        gp=original.roots['grGroundParam']
        if original.u(gp+0xb4)!=1:raise ValueError('Expected one native stage parameter row')
        native=original.u(gp+0xb0);d=Dat(data);row=d.u(d.roots['grGroundParam']+0xb0)
        d.data[row:row+0x64]=original.data[native:native+0x64]
        data=d.finish()
        archives[name]=data;(stage_dir/name).write_bytes(data)
        manifest['stageHashes'][name]=hashlib.sha256(data).hexdigest()
        manifest['courses'].append({'character':art.character,'name':art.name,'stageFile':name,
          'targets':art.targets,'spawn':art.spawn,'solids':art.solids,'platforms':art.platforms,'bounds':getattr(art,'bounds',(-365,205,350,-25)),
          'routes':art.route_notes,'signatureTargets':getattr(art,'signature_targets',[]),'movement':{k:art.movement_profile[k] for k in ('source','sourceSha256','ballisticJumpApex','ballisticAirJumpApex','airSpeed')},
          'artwork':'native LCD geometry' if getattr(art,'native_fire',False) else 'painted','solidContours':getattr(art,'solid_contours',{}),
          'dimensions':dimensions(art),'gameplay':art.gameplay_identity,'accessAudit':art.access_audit,'mechanisms':art.mechanisms,'pits':art.pits,'targetCycles':art.target_cycles,
          'sourceElements':getattr(art,'native_source_elements',[]),'wind':getattr(art,'wind',None),
          'referenceTriangles':len(art.triangles)})
        if not args.no_preview:previews.append(preview_world(art,stage_dir/f'{art.suffix}.png'))
    if not args.stage_only:
        callback=patch_callbacks
        if args.online:
            from online_menu import add_archives,patch as online_patch
            menus=add_archives(args.iso,entries);archives.update(menus)
            manifest['onlineVersion']=1
            manifest['menuHashes']={name:hashlib.sha256(data).hexdigest() for name,data in menus.items()}
            callback=lambda data:online_patch(patch_callbacks(data))
        write_iso(args.iso,args.output,archives,callback,b'Custom Melee BTT - 26 Target Test worlds')
        manifest['dolSha256']=dol_digest(args.output)
    args.output.with_suffix('.json').write_text(json.dumps(manifest,indent=2)+'\n')
    if previews:
        from PIL import Image,ImageDraw,ImageFont,ImageOps
        sheet=Image.new('RGB',(1440,7*180),'#101820');draw=ImageDraw.Draw(sheet)
        try:font=ImageFont.truetype('DejaVuSans.ttf',13)
        except OSError:font=ImageFont.load_default()
        for i,im in enumerate(previews):
            x=(i%4)*360;y=(i//4)*180
            thumb=ImageOps.contain(im,(352,147))
            sheet.paste(thumb,(x+4+(352-thumb.width)//2,y+27))
        draw=ImageDraw.Draw(sheet)
        for i,spec in enumerate(WORLDS):
            draw.text(((i%4)*360+8,(i//4)*180+7),spec[0]+' / '+spec[1],fill='#f2ede2',font=font)
        sheet.save(args.output.with_suffix('.png'))
    print(json.dumps({'name':manifest['name'],'courses':len(archives),'output':str(args.output)}))

if __name__=='__main__':main()
