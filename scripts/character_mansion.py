"""Luigi's cutaway mansion: authored rooms and a climb from foyer to belfry.

All scenery is original geometry. Collision-bearing floors use the same extents
as their visible wooden/stone surfaces. Stair/attic ledges are native soft
platforms: jump through from below, land on top, or drop through.
"""
import math
import random
from build_grassland import Art, rgb
from stage_texture import MANOR_ASSETS, texture_scene
from painted_surfaces import fit_manor


class Mansion(Art):
    def __init__(self,spec,index=0):
        super().__init__()
        self.character,self.name,self.suffix,self.address,self.theme,_=spec
        self.name='The Crooked Manor'
        self.sky='#182d49'
        self.spawn=(-205,2)
        self.bounds=(-285,515,285,-45)
        self.preview_bounds=(-310,540,310,-65)
        self.targets=[(-192,25),(89,54),(215,69),(-105,124),(90,153),
                      (-215,168),(212,214),(-92,329),(90,410),(0,458)]
        self.points=[]
        self.rng=random.Random(1931)
        self.painted_scene=MANOR_ASSETS/'painted-manor.png'
        self.world_assets=MANOR_ASSETS
        self.landing_triangles=[]
        self.ledge_platforms=[]

    def model(self,d):
        # The painting replaces the flat scenery, while native ledge geometry
        # keeps every small landing visible at its exact collision position.
        first=texture_scene(d,self.ledge_platforms)
        detail=Art()
        detail.triangles=[t for t in self.triangles if t[0][2]<=-150]
        overlay=detail.model(d)
        d.pointer(overlay+4,first)
        return overlay

    def gradient(self,x,y,w,h,bottom,top,z):
        a=rgb(bottom);b=rgb(top)
        self.triangles.extend([[(x,y,z,a),(x+w,y,z,a),(x+w,y+h,z,b)],
                               [(x,y,z,a),(x+w,y+h,z,b),(x,y+h,z,b)]])

    def line(self,x,y,xx,yy,width,col,z=-4):
        d=math.hypot(xx-x,yy-y)
        if not d:return
        dx=-(yy-y)*width/d/2;dy=(xx-x)*width/d/2
        self.polygon([(x+dx,y+dy),(xx+dx,yy+dy),(xx-dx,yy-dy),(x-dx,y-dy)],col,z)

    def arch(self,x,y,w,h,col,z=-8):
        r=w/2
        self.rect(x,y,w,h-r,col,z)
        self.ellipse(x+r,y+h-r,r,r,col,z)

    def ring(self,x,y,rx,ry,width,col,z=-5):
        for i in range(40):
            a=i*math.tau/40;b=(i+1)*math.tau/40
            self.polygon([(x+math.cos(a)*rx,y+math.sin(a)*ry),
                (x+math.cos(b)*rx,y+math.sin(b)*ry),
                (x+math.cos(b)*(rx-width),y+math.sin(b)*(ry-width)),
                (x+math.cos(a)*(rx-width),y+math.sin(a)*(ry-width))],col,z)

    def window(self,x,y,w=28,h=55):
        self.arch(x-3,y-3,w+6,h+6,'#111827',-9)
        self.arch(x-1,y-1,w+2,h+2,'#b6bea0',-8.8)
        self.arch(x,y,w,h,'#c7fac3',-8.6)
        self.arch(x+2,y+2,w-4,h-4,'#78bcb6',-8.4)
        self.rect(x+3,y+3,w-6,h*.43,'#daf3ad',-8.2)
        self.rect(x+w/2-1,y,2,h,'#172e39',-8)
        self.rect(x,y+h*.48,w,2,'#203947',-8)
        self.rect(x-5,y-4,w+10,3,'#e3c998',-7.8)
        self.polygon([(x+2,y),(x+w-2,y),(x+w+24,y-23),(x-13,y-23)],'#53765a',-10)
        # Thick draped curtains, folded rather than a flat rectangle.
        for left in (True,False):
            edge=x-5 if left else x+w+5;sign=1 if left else -1
            self.polygon([(edge,y+h+2),(edge+sign*10,y+h-2),
                (edge+sign*4,y+18),(edge+sign*8,y),(edge,y)],'#864568',-7.5)
            self.line(edge+sign*2,y+h-2,edge+sign*2,y,1.3,'#c884a4',-7.4)
            self.line(edge,y+18,edge+sign*5,y+18,1.7,'#ffe0a0',-7.3)

    def candle(self,x,y,z=-4):
        for r,col in [(8,'#686540'),(5,'#a78949'),(2.6,'#ffd277')]:
            self.ellipse(x,y+10,r,r*1.35,col,z,16)
        self.rect(x-2,y-2,4,2,'#8e7757',z+.1)
        self.rect(x-.8,y,1.6,8,'#c4b69c',z+.2)
        self.ellipse(x,y+9,1.1,2.2,'#fff2b8',z+.3,12)

    def portrait(self,x,y,w,h,variant):
        self.rect(x+3,y-3,w,h,'#121e27',-6)
        for inset,col in [(0,'#352936'),(1,'#ebc379'),(2.5,'#564337'),(4,'#c69b5b'),(5,'#202b35')]:
            self.rect(x+inset,y+inset,w-inset*2,h-inset*2,col,-5.8+inset*.05)
        cx=x+w/2;cy=y+h*.57
        self.ellipse(cx,cy,w*.27,h*.29,'#34434a',-5.4)
        self.ellipse(cx,cy+3,w*.13,h*.16,['#dcc9a3','#a7d5b3','#d8b1a0'][variant%3],-5.3)
        self.polygon([(cx-w*.24,y+7),(cx-w*.14,cy-7),(cx+w*.14,cy-7),(cx+w*.24,y+7)],'#6d6270',-5.2)
        for dx in (-2,2):self.ellipse(cx+dx,cy+5,.6,.8,'#efe3b6',-5.1,8)
        for dx in (2,w-2):
            for dy in (2,h-2):self.ellipse(x+dx,y+dy,1.7,1.7,'#ffe3a0',-5.0,8)

    def room(self,x,y,w,h,wall):
        self.gradient(x,y,w,h,'#2c4b50',wall,-18)
        # Wallpaper diamonds / pinstripes and lower wooden wainscoting.
        for xx in range(int(x+8),int(x+w-5),14):
            self.line(xx,y+27,xx,y+h-5,.35,'#769c89',-17)
            for yy in range(int(y+40),int(y+h-5),19):
                self.ring(xx,yy,2,3.4,.45,'#afc58d',-16.9)
        self.rect(x,y,w,25,'#674a37',-16)
        for xx in range(int(x+3),int(x+w-6),22):
            ww=min(19,x+w-xx-2)
            self.rect(xx,y+3,ww,17,'#b28a57',-15.8)
            self.rect(xx+1,y+4,ww-2,15,'#72513d',-15.6)
            self.line(xx+2,y+5,xx+ww-2,y+5,.7,'#d2ad71',-15.4)
        for yy,col in [(y+25,'#e6bd80'),(y+23,'#816049'),(y+h-4,'#eddbb1'),(y+h-7,'#8e9386')]:
            self.rect(x,yy,w,1.7,col,-14)
        # Corners, ceiling moulding and ambient occlusion.
        self.rect(x,y,3,h,'#182e43',-13)
        self.rect(x+w-3,y,3,h,'#182e43',-13)
        self.rect(x,y+h-12,w,4,'#314e52',-13)

    def floor(self,x,y,w,h=8,stone=False,one_way=False,ledge_sprite=True):
        start=len(self.triangles)
        if one_way:
            self.platform_surface(x,y,w,2 if stone else 4)
            if ledge_sprite:self.ledge_platforms.append(self.platforms[-1])
        else:self.solid(x,y-h,w,h,2 if stone else 4)
        dark,mid,light=('#40546c','#819899','#d4dec0') if stone else ('#48303a','#a57a50','#ffe0a0')
        self.gradient(x,y-h,w,h,dark,mid,1)
        self.rect(x,y-1,w,1,light,1.2)
        self.rect(x,y-3,w,1,'#d0a86a',1.3)
        for xx in range(int(x+4),int(x+w-2),13):
            self.line(xx,y-h+1,xx,y-3,.5,dark,1.4)
            self.rect(xx+3,y-5,min(7,x+w-xx-4),.4,light,1.4)
        self.rect(x,y-h-2,w,2,'#111c26',-1)
        if one_way:
            # Carved gold end caps and a fine wood grain on the physical ledge.
            for xx in (x+1,x+w-2):
                self.gradient(xx,y-h+1,1,h-2,'#755128','#ffe7a4',1.5)
                self.ellipse(xx+.5,y-2,.3,.3,'#fff2bd',1.6,8)
            for k in range(3):
                yy=y-h+1+k*.65
                self.line(x+3,yy,x+w-3,yy+.25,.18,'#d29b57',1.5)
            self.landing_triangles.extend(self.triangles[start:])

    def balustrade(self,x,y,w):
        for xx in range(int(x+3),int(x+w-2),8):
            self.line(xx,y+1,xx,y+13,1,'#ccbc92',-2)
            self.ellipse(xx,y+7,1.4,2,'#dfcba0',-1.9,8)
        self.rect(x,y+13,w,1.8,'#eed3a1',-1.8)
        self.rect(x,y+15,w,.7,'#fff0b8',-1.7)

    def staircase(self,side,y):
        # Three alternating landings in an open stairwell. Supports/rails sit
        # behind the player. Floor edges leave the well open between storeys.
        xs=[175,215,175] if side>0 else [-175,-215,-175]
        self.rect(side*197-2,y,4,96,'#24313a',-8)
        prev=(side*150,y)
        for i,x in enumerate(xs):
            top=y+(i+1)*24
            self.floor(x-15,top,30,5,one_way=True)
            self.line(prev[0],prev[1]-3,x,top-3,3,'#aa8255',-4)
            self.line(prev[0],prev[1]+13,x,top+13,1.2,'#f6d596',-3)
            for k in range(1,5):
                a=k/5;xx=prev[0]+(x-prev[0])*a;yy=prev[1]+(top-prev[1])*a
                self.line(xx,yy,xx,yy+12,.75,'#adb69a',-3)
            prev=(x,top)

    def bookcase(self,x,y,w,h):
        self.rect(x+2,y-2,w,h,'#101d27',-6)
        self.rect(x,y,w,h,'#aa774b',-5.9)
        self.rect(x+3,y+3,w-6,h-7,'#1a252b',-5.8)
        for shelf in range(3):
            yy=y+6+shelf*(h-10)/3
            xx=x+5
            while xx<x+w-6:
                bw=self.rng.uniform(2.1,4.6);bh=self.rng.uniform(9,17)
                col=self.rng.choice(['#6f7f6b','#946c65','#8b825b','#596a7f','#9d8a71'])
                self.rect(xx,yy,bw,bh,col,-5.6)
                self.rect(xx+.5,yy+2,bw-1,.6,'#c5ad78',-5.5)
                xx+=bw+1
            self.rect(x+2,yy-2,w-4,2,'#edbe7d',-5.4)
        self.rect(x-3,y+h,w+6,3,'#e1bc82',-5.2)

    def roof(self,x,y,w,h):
        self.polygon([(x,y),(x+w*.5,y+h),(x+w,y)],'#172330',-12)
        self.polygon([(x+4,y+2),(x+w*.5,y+h-4),(x+w-4,y+2)],'#486d88',-11.8)
        for yy in range(5,int(h)-5,8):
            left=x+w*.5*yy/h;right=x+w-w*.5*yy/h
            self.line(left,y+yy,right,y+yy,.75,'#90b3bc',-11.6)
            for xx in range(int(left)+5,int(right)-3,12):self.line(xx,y+yy,xx+2,y+yy+5,.6,'#233644',-11.5)
        self.line(x,y,x+w*.5,y+h,2,'#b5d2cd',-11.3)
        self.line(x+w*.5,y+h,x+w,y,2,'#253340',-11.3)

    def build(self):
        self.gradient(-1200,-600,2400,1800,'#36576c','#152642',-150)
        self.ellipse(208,463,55,55,'#253746',-120)
        self.ellipse(208,463,47,47,'#3c515a',-119)
        self.ellipse(208,463,39,39,'#c6d0bd',-118)
        for x,y,rx,ry in [(188,480,8,5),(220,470,10,7),(209,445,6,5),(185,454,5,3)]:
            self.ellipse(x,y,rx,ry,'#a3b4ac',-117)
        for i in range(80):
            x=self.rng.uniform(-440,440);y=self.rng.uniform(50,620)
            self.ellipse(x,y,.35,.5,'#7c929a',-110,8)
        # Bare trees, cemetery and low mist around the silhouette.
        for side in (-1,1):
            x=side*283
            self.line(x,-35,x-side*16,234,8,'#12222e',-50)
            for j in range(5):
                yy=55+j*35;xx=x-side*j*3
                self.line(xx,yy,xx+side*(35+j*4),yy+35,3,'#172a35',-49)
                self.line(xx,yy+20,xx-side*26,yy+47,2,'#172a35',-49)
            for j in range(4):
                xx=side*(255+j*28)
                self.arch(xx,-20,15,20+j%2*9,'#3c4b51',-45)
                self.rect(xx+5,-8,5,1,'#87908b',-44)
        self.gradient(-500,-70,1000,95,'#40555c','#1d303e',-40)
        # Outer shell has a distinct tall silhouette and deep side reveals.
        self.rect(-246,-39,492,428,'#121d27',-23)
        self.gradient(-238,-30,476,424,'#374348','#53605b',-22)
        for side in (-1,1):
            x=-246 if side<0 else 230
            self.rect(x,-35,16,438,'#293c46',-12)
            for yy in range(-30,399,12):
                self.rect(x,yy,16,1,'#778077',-11.8)
                self.rect(x+(4 if yy%24 else 10),yy,1,11,'#1f343e',-11.7)
            self.roof(x-27,398,70,57)
            self.rect(x+7,452,1.5,24,'#91a7a3',-10)
            self.ellipse(x+7.8,476,2,2,'#abc0b3',-10,10)
        # Four storeys with rooms of visibly different purpose and colour.
        self.room(-229,0,375,96,'#67a588')
        self.room(-145,96,375,96,'#8777af')
        self.room(-229,192,375,96,'#528ba5')
        self.room(-145,288,375,96,'#a36483')
        # Open stairwells alternate sides. Wallpaper continues behind the stairs.
        for side,y in [(1,0),(-1,96),(1,192),(-1,288)]:
            self.room(146 if side>0 else -229,y,83,96,'#557f88')
            self.staircase(side,y)
        self.floor(-238,0,476,34,True)
        self.floor(-230,96,375,one_way=True,ledge_sprite=False)
        self.floor(-145,192,375,one_way=True,ledge_sprite=False)
        self.floor(-230,288,375,one_way=True,ledge_sprite=False)
        self.floor(-145,384,290,one_way=True,ledge_sprite=False)
        # Foyer: entrance, tiled runner, fireplace, clock, portrait.
        self.arch(-226,2,49,79,'#111e25',-9)
        self.arch(-221,3,39,70,'#4d5146',-8.8)
        self.rect(-202,3,1.5,64,'#947958',-8.6)
        self.ellipse(-198,29,1,1,'#d6b775',-8.5,10)
        self.portrait(-152,38,29,40,0)
        self.window(-81,30,28,49)
        self.window(-24,30,28,49)
        self.floor(62,32,56,5,True,one_way=True,ledge_sprite=False)
        # The mantel is the only collision: columns and hearth are scenery.
        for x in (67,105):self.gradient(x,0,8,27,'#545450','#879081',1)
        self.arch(74,0,30,25,'#182025',-6)
        for i in range(7):
            self.polygon([(77+i*3,1),(79+i*3,8+i%3*4),(82+i*3,1)],['#b26d47','#edb367','#d68d50'][i%3],-5)
        self.rect(83,34,17,14,'#837753',-6)
        self.ellipse(91.5,41,5,5,'#cbc0a0',-5.8)
        self.line(91.5,41,91.5,45,.7,'#384047',-5.7)
        self.line(91.5,41,94,39,.7,'#384047',-5.7)
        self.candle(54,40);self.candle(127,40)
        for xx in range(-166,58,16):self.rect(xx,0,11,.8,'#92615b',1.7)
        # Music room: grand piano platform, portraits, wall sconces.
        self.window(-124,123,24,53)
        self.portrait(-69,128,31,43,1);self.portrait(-20,128,31,43,2)
        self.platform_surface(64,129,54,4)
        self.gradient(64,96,54,33,'#151e28','#38434a',1)
        self.rect(64,129,54,2,'#a3a295',1.2)
        for i in range(18):
            self.rect(66+i*2.8,122,2.5,4,'#d9cbb1',1.3)
            if i%7 not in (2,6):self.rect(67+i*2.8,124,1.2,3,'#202b32',1.4)
        self.polygon([(67,131),(111,158),(115,157),(115,131)],'#37424a',-4)
        self.line(69,132,113,157,1.2,'#a38e71',-3.8)
        self.candle(42,142);self.candle(133,142)
        self.balustrade(-133,96,80)
        # Library: shelves, ladder and tall mullioned windows.
        for x in (-217,-157,-97):self.bookcase(x,195,47,69)
        self.window(-24,217,30,54);self.window(64,217,30,54)
        for xx in (-151,-140):self.line(xx,196,xx+11,259,1.5,'#ab8c64',-3)
        for yy in range(205,259,9):self.line(-150+(yy-196)*.175,yy,-139+(yy-196)*.175,yy,1,'#ccac7b',-2.9)
        self.balustrade(-45,192,73)
        # Upper bedroom: canopy bed, mirror, wardrobe, flaking plaster.
        # Match the painted mattress instead of the old box's lower edge.
        self.platform_surface(-119,317,60,4)
        self.gradient(-119,288,60,18,'#603f4e','#bd859d',1)
        self.rect(-117,304,56,2,'#ffdec5',1.2)
        for x in (-121,-61):
            self.rect(x,288,2,62,'#94785f',-3)
            self.ellipse(x+1,352,2,2,'#bd9a68',-2.9,10)
        self.rect(-124,348,68,4,'#836465',-2.8)
        for x in (-121,-66):self.rect(x,310,7,38,'#a9658b',-2.7)
        self.ring(-7,331,17,26,2,'#bda473',-5)
        self.ellipse(-7,331,14,23,'#526779',-5.1)
        self.line(-16,316,1,344,1.5,'#93a1a4',-4.9)
        self.bookcase(41,291,46,67)
        self.window(106,312,24,53)
        # Attic roof, beams, crates and a climb to the clock/bell.
        self.roof(-174,383,348,89)
        self.polygon([(-143,385),(0,463),(143,385)],'#614957',-10)
        for xx in (-125,-75,-25,25,75,125):
            self.line(xx,386,xx*.47,430,3,'#a8825a',-7)
        self.line(-140,386,0,463,4,'#efc891',-6)
        self.line(0,463,140,386,4,'#b4a079',-6)
        self.floor(-83,408,38,5,one_way=True)
        self.floor(-19,432,38,5,one_way=True)
        self.rect(-31,429,62,71,'#233442',-8)
        self.arch(-24,437,48,57,'#101b2a',-7.8)
        self.line(-22,484,22,484,3,'#a49b7b',-7.6)
        self.polygon([(-13,457),(-9,479),(9,479),(13,457)],'#938663',-7.4)
        self.ellipse(0,457,14,3,'#d7c393',-7.3)
        self.ellipse(0,455,2.5,4,'#756953',-7.2)
        self.roof(-41,498,82,32)
        # Small spectral silhouettes in windows, never obstacles or enemy items.
        for x,y in [(-12,61),(-110,154),(117,343)]:
            self.ellipse(x,y,5,7,'#ceffe0',-7)
            self.polygon([(x-5,y-2),(x-4,y-10),(x,y-6),(x+4,y-10),(x+5,y-2)],'#ceffe0',-7)
            for dx in (-1.6,1.6):self.ellipse(x+dx,y+1,.7,1.2,'#344b4c',-6.8,8)
        # A surviving narrow board provides a take-off over the broken basement.
        self.floor(-5,18,24,5,one_way=True)
        return fit_manor(self)
