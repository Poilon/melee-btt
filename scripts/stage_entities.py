"""Textured retail actors, deterministic native paths and stage contact hits.

Visuals are imported original models; see retail_actors.py and asset provenance.
These remain contact hazards, not the source games' enemy AI.
"""
from world_gameplay import ride
import math


def ballistic(m, rise, airtime, delay, drift=0, lava_y=-43.3333333333, exit_y=-450):
    """Constant gravity through a complete off-screen descent and deep reset.

    y(t)=y0+v0*t-g*t*t/2. This is frame-exact ballistic motion rather than
    interpolation between a bottom hold and a top hold. No companion update loop.
    """
    period=m['period']
    if airtime<=0 or rise<=0 or delay<1 or exit_y>=m['y']:
        raise ValueError('Invalid lava projectile flight')
    gravity=8*rise/(airtime*airtime);velocity=gravity*airtime/2
    x,y=m['x'],m['y']
    duration=math.ceil((velocity+math.sqrt(velocity**2+2*gravity*(y-exit_y)))/gravity)
    if delay+duration+1>=period:raise ValueError('Lava projectile needs an off-screen cooldown')
    parked_y=y+velocity*duration-gravity*duration*duration/2
    ys=[(0,parked_y)];xs=[(0,x)];visible=[];facing=[(0,0)]
    if delay>1:ys.append((delay-1,parked_y));xs.append((delay-1,x))
    for t in range(duration+1):
        frame=delay+t;py=y+velocity*t-gravity*t*t/2
        ys.append((frame,py));xs.append((frame,x+drift*t/airtime))
        # Ease around the apex instead of snapping when vertical velocity
        # crosses zero. Rotate the visual around its centre, not its top edge.
        turn=max(0,min(1,(t/airtime-.34)/.32))
        facing.append((frame,-math.pi*turn*turn*(3-2*turn)))
        if py>lava_y:visible.append(frame)
    ys.append((period,parked_y));xs.extend([(delay+duration+1,x),(period,x)])
    facing.extend([(delay+duration+1,0),(period,0)])
    m.update(y=parked_y,dy=rise,dx=drift,yKeys=ys,xKeys=xs,
             facingKeys=facing,
             blink=[(0,0),(visible[0],1),(delay+duration,0),(period,0)],
             flight=dict(gravity=gravity,velocityY=velocity,velocityX=drift/airtime,
                         delay=delay,airtime=airtime,lavaY=lava_y,launchY=y,
                         duration=duration,exitY=exit_y))
    return m


def actor(name,entity,x,y,w,h,**motion):
    m=ride(name,x,y,w,**motion)
    m.update(kind='bumper',entity=entity,height=h,
             outline=[[w*.25,0],[w*.75,0],[w,-h*.25],[w,-h*.7],[w*.75,-h],[w*.25,-h],[0,-h*.7],[0,-h*.25]])
    return m


def configure(art):
    if art.suffix=='Mr':
        l,r,top=art.authored_surfaces[16];bottom=min(y for _,y in art.solid_contours[8])
        x=(l+r)/2-11;h=34
        up=actor('Upper pipe Piranha Plant','plant',x,top-.6,22,h,dy=h,period=360,hold=40)
        up['yKeys']=[(0,top-.6),(90,top-.6),(130,top+h-.6),(220,top+h-.6),(260,top-.6),(360,top-.6)]
        down=actor('Lower pipe Piranha Plant','plant',x,bottom+h+.6,22,h,dy=-h,period=420,hold=40)
        down.update(flipY=True,yKeys=[(0,bottom+h+.6),(45,bottom+h+.6),(85,bottom+.6),(160,bottom+.6),(200,bottom+h+.6),(420,bottom+h+.6)])
        up['outline']=[[5,0],[17,0],[22,-7],[20,-15],[14,-19],[13,-34],[9,-34],[8,-19],[2,-15],[0,-7]]
        down['outline']=[[x,-h-y] for x,y in reversed(up['outline'])]
        art.mechanisms += [up,down]
        art.entity_occluders=[dict(sourcePixels=[1522,337,1593,523],surface=[l,top,r-l],height=top-bottom)]
    elif art.suffix=='Lg':
        # Patrols cross the approaches to the piano and the library stairwell.
        art.mechanisms += [actor('Music-room Boo','ghost',-62,151,28,19.5,dx=118,period=390,hold=50),
                           actor('Library Boo','ghost',111,237,34,23.7,dy=45,period=330,hold=40)]
    elif art.suffix=='Kp':
        art.mechanisms += [
            ballistic(actor('Western lava bubble','fireball',-140,-48,18,21,period=290),
                      rise=125,airtime=128,delay=24),
            ballistic(actor('Drawbridge lava bubble','fireball',90,-48,23,26,period=430),
                      rise=160,airtime=144,delay=105,drift=32),
        ]
        for m in art.mechanisms:
            if m.get('entity')=='fireball':m.update(damage=16,growth=110,baseKnockback=75,element=1)
