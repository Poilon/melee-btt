"""A native LCD Fire rescue scene: printed facade, fire escapes and ambulance.

No simulated console casing and no factory machinery. Black ledges are physical;
light-grey printed scenery is backdrop. Geometry supplies both art and collision.
"""
from build_grassland import Art

INK='#26322c'
SCREEN='#d7d9ba'
PRINT='#a6ae92'
FAINT='#c2c8ab'


def stroke(a,x,y,xx,yy,w=1.5,color=INK):
    import math
    length=math.hypot(xx-x,yy-y)
    if not length:return
    dx=-(yy-y)*w/length/2;dy=(xx-x)*w/length/2
    a.polygon([(x+dx,y+dy),(xx+dx,yy+dy),(xx-dx,yy-dy),(x-dx,y-dy)],color,0)


def fireman(a,x,y,facing=1):
    a.ellipse(x,y+4,3.4,3.6,INK,0,n=12)
    a.rect(x-4,y+5,8,1.5,INK,0)
    a.polygon([(x-3,y),(x+3,y),(x+4,y-8),(x-4,y-8)],INK,0)
    stroke(a,x-1,y-7,x-4,y-14,3);stroke(a,x+1,y-7,x+5,y-14,3)
    stroke(a,x,y-2,x+facing*8,y-1,2.5)


def trampoline_mesh(d,m):
    a=Art();w=m['width']
    fireman(a,-6,0,1);fireman(a,w+6,0,-1)
    # Collision top is y=0, exactly the upper edge of the canvas.
    a.rect(0,-3,w,3,INK,0);a.rect(2,-2,w-4,1,SCREEN,0)
    from world_mechanics import colour_mesh
    return colour_mesh(d,a)


def build_fire(a):
    a.triangles=[];a.solids=[];a.platforms=[];a.solid_contours={}
    a.native_fire=True;a.name='Fire Rescue';a.sky=SCREEN
    a.bounds=(-220,238,220,-45);a.preview_bounds=(-230,245,230,-45)
    del a.painted_scene
    a.rect(-1200,-600,2400,1800,SCREEN,0)
    # Printed facade: pale surfaces never masquerade as collision walls.
    a.rect(-184,0,90,170,FAINT,0)
    for x in (-183,-95):a.rect(x,0,1.5,170,PRINT,0)
    for y in (32,74,116):
        for x in (-167,-131):
            a.rect(x,y+9,24,25,PRINT,0);a.rect(x+2,y+11,20,21,SCREEN,0)
            a.rect(x+11,y+11,2,21,PRINT,0)
        # Window curtains, rather than fake platforms across the screen.
        stroke(a,-164,y+31,-158,y+16,1,PRINT)
    for y in range(8,168,8):
        for x in range(-178,-96,18):stroke(a,x,y,x+9,y,.45,PRINT)
    # Pale flames and smoke identify Fire without suggesting damage volumes.
    for x,y in [(-160,179),(-132,183),(-106,177)]:
        a.polygon([(x-6,y),(x-5,y+9),(x-1,y+4),(x+2,y+18),(x+5,y+8),(x+6,y)],PRINT,0)
    for x,y in [(-154,214),(-114,225),(-69,216)]:a.ellipse(x,y,12,5,FAINT,0,n=16)
    # Native physical surfaces: ground, windows, roof, external fire escape.
    a.solid(-196,-10,392,10,16);a.rect(-196,-10,392,10,INK,0)
    ledges=[(-176,38,76),(-176,80,76),(-176,122,76),(-186,166,94),
            (-94,58,36),(-80,104,36),(118,38,72),(-90,142,38),(80,84,46)]
    for x,y,w in ledges:
        a.platform_surface(x,y,w,16);a.rect(x,y-3,w,3,INK,0)
    # Escape rails are printed, with steps marked by solid black treads above.
    for x,y,w in ledges[:6]+[ledges[7]]:
        stroke(a,x+3,y-5,x+3,y-12,1,PRINT)
        stroke(a,x+w-3,y-5,x+w-3,y-12,1,PRINT)
        stroke(a,x+3,y-12,x+w-3,y-12,1,PRINT)
    for y in range(63,139,7):stroke(a,-88,y,-81,y+4,1,PRINT)
    # Ambulance printed body; its black roof is the explicitly solid landing.
    a.rect(120,12,69,23,PRINT,0);a.rect(122,14,65,19,SCREEN,0)
    a.rect(167,24,17,9,PRINT,0);a.rect(169,25,13,6,SCREEN,0)
    a.rect(137,21,16,4,INK,0);a.rect(143,15,4,16,INK,0)
    for x in (133,178):
        a.ellipse(x,8,7,7,INK,0,n=16);a.ellipse(x,8,3,3,SCREEN,0,n=12)
    a.rect(129,35,13,3,PRINT,0)
    # Rescue ladder connects the ambulance to its elevated basket.
    stroke(a,170,38,119,81,2,PRINT);stroke(a,157,38,106,81,2,PRINT)
    for k in range(1,7):
        x=170-k*7;y=38+k*6;stroke(a,x,y,x-13,y,1,PRINT)
    for x in (82,124):stroke(a,x,84,x,96,1,PRINT)
    stroke(a,82,96,124,96,1,PRINT)
    a.authored_surfaces=[(-196,196,0)]+[(x,x+w,y) for x,y,w in ledges]
    a.spawn=(-178,2)
    return a
