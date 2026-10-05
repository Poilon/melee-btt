"""Per-world gameplay direction. Counts follow each route; there is no shared mix."""
import math

def ride(name,x,y,w,dx=0,dy=0,period=360,hold=45,angle=0,source=1,**options):
    return dict(name=name,x=x,y=y,width=w,dx=dx,dy=dy,period=period,hold=hold,
                angle=angle,source=source,kind='platform',orbit=False,**options)


def orbit_ride(*args,**kw):
    m=ride(*args,**kw);m['orbit']=True;return m


def gate(name,x,y,w,height,dy,period=420,hold=80):
    m=ride(name,x,y,w,dy=dy,period=period,hold=hold);m.update(kind='gate',height=height);return m


def light(name,x,y,w,period,windows,source=3):
    return ride(name,x,y,w,period=period,source=source,blink=windows)


def swing_vine():
    m=ride('Swinging grab vine',128,272,10,period=360,hold=0,angle=1,
           keepAnchor=True,gripOffset=[0,-134],grabbable=True,
           angleKeys=[(i*6,-.43*math.cos(2*math.pi*i/60)) for i in range(61)])
    m.update(kind='vine',height=4,outline=[[-5,-134],[5,-134],[5,-138],[-5,-138]])
    return m


RIDES={
 'Mr':[ride('Waterworks ferry',-82,-14,29,dx=92,period=330,hold=35,source=8)],
 'Ca':[ride('Pit-lane shuttle',-74,24,54,dx=96,period=180,hold=15,source=3)],
 'Cl':[ride('Canopy basket',-172,20,28,dy=212,period=560,hold=65,source=4),
       ride('Counterweight basket',134,220,26,dy=-195,period=470,hold=55,source=4)],
 'Dk':[ride('Western freight lift',-161,43,31,dy=68,period=390,hold=55,source=5),
       swing_vine()],
 'Dr':[ride('Service-shaft recovery tray',-90,8,24,dx=32,period=340,hold=40,source=7)],
 'Fc':[],
 'Fx':[],
 'Ic':[ride('Lower drifting floe',-150,64,38,dx=60,dy=18,period=360,source=3,material=15),
       ride('Crosswind floe',80,157,32,dx=-45,dy=36,period=420,source=4,material=15),
       ride('Summit floe',-122,235,35,dx=100,period=520,source=6,material=15)],
 'Kb':[orbit_ride('Dream orbit',-80,55,30,dx=108,dy=74,period=330,hold=0,source=5),
       orbit_ride('Outer dream orbit',-228,142,24,dx=70,dy=52,period=510,hold=0,source=5)],
 'Kp':[ride('Western furnace ferry',-147,-4,32,dx=73,period=340,hold=40,source=5),
       ride('Lowering chain bridge',62,96,70,angle=-55,keepAnchor=True,period=420,hold=65,source=13)],
 'Lk':[gate('Forest portcullis',-146,64,22,64,78,period=480,hold=90)],
 'Lg':[ride('Haunted dumbwaiter',-140,38,46,dy=304,period=660,hold=75)],
 'Ms':[ride('Castle drawbridge',-46,6,86,period=420,hold=100,angle=62,source=3),
       gate('Battlement portcullis',-92,204,18,62,76,period=540,hold=105)],
 'Mt':[orbit_ride('Suspended specimen',-64,92,40,dx=80,dy=34,period=360,hold=0,source=3)],
 'Ns':[ride('School maintenance lift',-81,50,36,dy=63,period=480,hold=90,source=8)],
 'Pe':[ride('Fountain recovery gondola',59,-34,25,dx=17,period=300,hold=35,source=3)],
 'Pc':[light('Intermittent contact ledge',30,120,28,240,[(0,1),(130,0),(240,1)],source=7)],
 'Pk':[ride('Generator inspection lift',-224,25,34,dy=151,period=440,source=2)],
 'Pr':[],
 'Ss':[ride('Shaft elevator',159,82,38,dy=91,period=340,source=5),
       light('Emergency ledge',120,222,34,360,[(0,1),(240,0),(360,1)],source=9)],
 'Sk':[light('Lower shadow step',-15,60,25,240,[(0,1),(105,0),(240,1)],source=2),
       light('Upper shadow step',-15,216,25,300,[(0,0),(120,1),(240,0),(300,0)],source=4)],
 'Ys':[ride('Drifting nest ledge',-64,13,25,dx=65,period=310,hold=30,source=1)],
 'Zd':[light('Left prism',-80,94,34,360,[(0,1),(180,0),(360,1)]),
       light('Middle prism',-17,111,34,360,[(0,0),(80,1),(260,0),(360,0)]),
       light('Right prism',46,94,34,360,[(0,0),(180,1),(360,0)])],
 'Gw':[dict(ride('First rescue team',-64,14,40,dx=66,period=300,hold=25),kind='trampoline'),
       dict(ride('Second rescue team',52,14,40,dx=63,period=420,hold=45),kind='trampoline')],
 'Fe':[ride('Siege bridge',-60,6,92,period=330,hold=75,angle=55,source=4)],
 'Gn':[ride('Undercroft ferry',-136,-12,28,dx=200,period=600,hold=60,source=6),
       ride('Throne lift',200,18,26,dy=150,period=480,hold=70,source=9)],
}

# Openings must be visible in the actual artwork. Other foundations stay solid
# until they are redesigned during the character-by-character playtests.
PITS={
 'Pk':[[-131.09324758842445, -69.27974276527331], [69.27974276527328, 131.7877813504823]],
 'Sk':[[-79.57334611697027, -34.96164908916586], [29.58293384467882, 70.39789069990411]],
 'Cl':[[-157.54794520547944, -76.5958904109589], [76.95890410958901, 168.80136986301375]],
 'Fc':[[-64.32897862232778, 49.168646080760084]],
 'Ca':[[-114.56230690010295, 41.90010298661184], [211.62203913491237, 315.0463439752832]],
 'Lk':[(-152.718009478673, -110.60071090047396), (109.57345971563979, 154.0876777251185)],
 'Gw':[(-80,112)],
}


# Grates belong to the electrical and volcanic worlds, not every stage.
# Optional visibility keys disable the contact collision along with the flame.
HAZARDS={

 'Pc':[('electric',181,20,[(0,1),(85,0),(180,1),(240,1)])],
 'Pk':[('electric',63,25),('electric',-92,22)],
 'Ss':[],
 'Fe':[('fire',62,30),('fire',-112,28,[(0,0),(90,1),(210,0),(240,0)])],
}
BUMPERS={'Fc':[(0,0,23)], 'Ca':[(0,0,32)],
         'Ys':[(0,0,18)], 'Dk':[(0,0,22)]}

# Every row is an authored encounter: target index, path, displacement, timing.
# Teleports may visit several rooms; orbit/arc tracks have their own geometry.
def patrol(i,dx,dy,period):return dict(target=i,kind='moving',pattern='patrol',dx=dx,dy=dy,period=period)
def orbit(i,dx,dy,period):return dict(target=i,kind='moving',pattern='orbit',dx=dx,dy=dy,period=period)
def arc(i,dx,dy,period):return dict(target=i,kind='moving',pattern='arc',dx=dx,dy=dy,period=period)
def teleport(i,places,dwell):return dict(target=i,kind='teleport',pattern='rooms',places=places,dwell=dwell,period=sum(dwell))

TARGET_PATTERNS={
 'Mr':[patrol(5,0,27,period=280)],
 'Ca':[patrol(0,48,0,180),patrol(2,42,0,240),patrol(3,35,0,210),patrol(7,40,0,300)],
 'Cl':[teleport(1,[(22,33)],[180,210]),teleport(4,[(-24,12)],[210,150]),teleport(7,[(14,12)],[150,240])],
 'Dk':[patrol(8,-22,0,330)],
 'Dr':[patrol(0,14,0,260),patrol(2,0,8,310),orbit(4,18,6,350)],
 'Fc':[patrol(3,-28,0,240),patrol(4,24,0,300),patrol(6,36,0,360)],
 'Fx':[patrol(5,22,0,310),patrol(7,0,12,380)],
 'Ic':[],
 'Kb':[arc(0,-18,10,360),orbit(2,-20,10,420),orbit(3,18,8,480),orbit(4,22,5,540),orbit(7,18,10,390),orbit(9,-18,8,450)],
 'Kp':[patrol(3,0,19,320)],
 'Lk':[arc(3,26,12,480),teleport(4,[(20,25)],[300,180])],
 'Lg':[teleport(1,[(110,28)],[180,240]),teleport(3,[(260,36)],[240,180]),
       teleport(4,[(-80,36)],[150,240]),teleport(6,[(130,-10),(180,54)],[180,150,210]),
       teleport(8,[(36,24)],[210,210])],
 'Ms':[],
 'Mt':[orbit(5,28,10,360),patrol(9,-24,0,240),
       teleport(0,[(28,10)],[120,180]),teleport(1,[(38,18)],[180,120]),
       teleport(2,[(22,24),(55,3)],[150,120,180]),teleport(3,[(35,18)],[120,240]),
       teleport(6,[(42,20)],[180,180]),teleport(7,[(35,-12),(-32,-8)],[120,180,150])],
 'Ns':[patrol(5,28,0,600)],
 'Pe':[arc(1,20,12,430),patrol(5,-23,0,380)],
 'Pc':[patrol(4,26,0,300),teleport(2,[(24,16)],[150,90]),
       teleport(6,[(-22,18)],[90,210]),teleport(7,[(25,8)],[180,120])],
 'Pk':[patrol(3,-22,0,240),patrol(4,28,0,360),teleport(6,[(22,24)],[150,210])],
 'Pr':[arc(0,-16,8,480),patrol(2,22,0,540),orbit(3,18,10,420),
       arc(5,22,12,600),patrol(6,-28,0,480),orbit(7,-18,8,540),patrol(8,24,0,660)],
 'Ss':[patrol(7,32,0,420),teleport(5,[(-20,44)],[240,180]),teleport(9,[(26,8)],[300,180])],
 'Sk':[teleport(0,[(20,12)],[120,180]),teleport(1,[(-22,-4)],[150,150]),
       teleport(2,[(26,18)],[90,210]),teleport(3,[(-26,18)],[180,120]),
       teleport(5,[(-16,18),(24,8)],[120,120,180]),teleport(6,[(26,24)],[150,210]),
       teleport(9,[(-26,0)],[180,180])],
 'Ys':[arc(2,17,12,370),patrol(6,0,-26,300),arc(9,25,9,340)],
 'Zd':[orbit(5,30,12,540),teleport(0,[(25,12)],[180,180]),teleport(3,[(24,20)],[120,240]),
       teleport(6,[(-28,15)],[240,120]),teleport(9,[(-22,20)],[150,210])],
 'Gw':[arc(4,70,36,300),arc(5,74,25,420),arc(8,-26,26,360)],
 'Fe':[patrol(6,25,0,300)],
 'Gn':[teleport(3,[(65,-14)],[190,230]),patrol(6,0,32,270)],
}

IDENTITIES={
 'Mr':'A brick aperture, river ferry and bent-pipe waterworks. Search the underside, intercept the river target, then climb around the tower.',
 'Ca':'A sprint circuit with opposite speed strips: boost right over the lower pit, then use the upper leftward strip for the return across the overpass gap. Both keep normal controls and cause no damage.',
 'Cl':'A split Kokiri canopy with long basket lifts, a wall-jump detour, a rooted Deku Baba and a summit chest.',
 'Dk':'Broken loading docks around a solid tree stump. Dodge the cargo barrel, catch the swinging vine knot and jump to the thorn-covered eastern branch.',
 'Dr':'A medicine production line: a pulsing cabinet leak guards the first climb, a reactive trough guards the high catwalk target and a ceiling-mounted dosing press controls the testing chamber.',
 'Fc':'Separated rooftops with Corneria aircraft running their original flight animations, wing collisions and attacks.',
 'Fx':'Five dock surfaces around an open flight corridor. Board the smaller native Corneria aircraft for the high central and far-side targets.',
 'Ic':'Fixed targets, three slippery moving floes and a dangerous recovery on the right.',
 'Kb':'Two orbiting dream platforms and six targets tracing small aerial loops.',
 'Kp':'Three keeps above lethal lava. Climb around solid ceilings, cross on a lowering bridge and time the erupting lava bubbles.',
 'Lk':'A forest temple with a rising shutter, a falling hand, boomerang pockets and outside Spin Attack returns.',
 'Lg':'Broken manor floors, a haunted dumbwaiter, roaming ghosts and targets that haunt different rooms.',
 'Ms':'Fixed targets during a castle traversal: drawbridge below, portcullis above.',
 'Mt':'An unstable containment room: six teleporters, including three-position cycles.',
 'Ns':'A mostly static rooftop route with one slow pursuit and a maintenance lift.',
 'Pe':'Six surviving surfaces around an open ravine. Jump to the western balcony, float below the solid bridge and descend to the eastern island; only a tiny passing gondola serves the low recovery target.',
 'Pc':'Short electrical windows, a disappearing contact ledge and three switching targets.',
 'Pk':'A long generator climb with live contacts and fast aerial firing lanes.',
 'Pr':'Seven airborne pursuits, with no new lift to replace multi-jump movement.',
 'Ss':'Alternating cave chambers, an emergency ledge, a shaft lift and a timed flame grate.',
 'Sk':'Seven vanishing targets and two out-of-phase shadow steps in a narrow ascent.',
 'Ys':'Two sheer craft cliffs over open sea. Jump from the western high ledge to lob an egg over the hanging block, curve a short throw into its underside pocket, and use the double jump to return from the low moving target.',
 'Zd':'Three sequential light bridges and a mix of orbiting and teleporting targets.',
 'Gw':'Fire rescue: climb the window sills, bounce with two moving firefighter teams, and chase arcs toward the ambulance.',
 'Fe':'A faster siege bridge under permanent and intermittent fire, with one high patrol.',
 'Gn':'A dark citadel with an undercroft ferry beneath a solid bastion, a crushing seal, a falling Wallmaster and a throne lift. Eight redundant ledges are gone; the low return needs Dark Dive.',
}
