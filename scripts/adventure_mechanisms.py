"""Character-specific encounters using the original textured game models.

Enemy bodies and projectiles use Melee's stage contact damage, not ported enemy
AI. In particular rock contacts cannot be reflected or destroyed by attacks.
"""
import json
from pathlib import Path
from stage_entities import actor

ASSETS=Path(__file__).resolve().parents[1]/'assets/custom-stages/retail-actors'


def model(name,kind,x,top,width,**motion):
    spec=json.loads((ASSETS/kind/'model.json').read_text())
    m=actor(name,kind,x,top,width,width*spec['aspect'],**motion)
    m.update(damage=12,growth=105,baseKnockback=60,element=0)
    return m


def dropped_hand(x,floor,period=390,delay=110):
    m=model('Wallmaster ceiling ambush','wallmaster',x,300,38,dy=-1,period=period,hold=0)
    top=floor+m['height']
    m.update(damage=18,baseKnockback=75,
        yKeys=[(0,300),(delay,300),(delay+35,top+60),(delay+49,top),
               (delay+100,top),(delay+180,300),(period,300)])
    return m


def sortie(name,kind,left,right,top,width,period,delay=20,peaceful=False):
    m=model(name,kind,left,top,width,dx=right-left,period=period,hold=0)
    # Hidden reset; no reverse flight through a landing after the visible pass.
    m.update(xKeys=[(0,left),(delay,left),(delay+135,right),(period-1,right),(period,left)],
             blink=[(0,0),(delay,1),(delay+135,0),(period,0)])
    m['flipX']=right<left
    if peaceful:m.update(kind='decoration',visualDepth=-20)
    return m


def rock_shot(x,y,dx,dy,delay,period=310):
    m=model('Octorok stone shot','rock',x,y,8,dx=dx,dy=dy,period=period,hold=0)
    m.update(xKeys=[(0,x),(delay,x),(delay+90,x+dx),(period-1,x+dx),(period,x)],
        yKeys=[(0,y),(delay,y),(delay+90,y+dy),(period-1,y+dy),(period,y)],
        blink=[(0,0),(delay,1),(delay+90,0),(period,0)],damage=9,baseKnockback=45)
    return m


def configure(art):
    s=art.suffix;floors=art.authored_surfaces
    if s=='Gn':
        art.mechanisms.append(dropped_hand(48,floors[7][2]))
    elif s in ('Fx','Fc'):
        # The complete retail actors are installed after stage scaling. No
        # authored aircraft trajectories, floor meshes or laser timer here.
        art.mechanisms=[]
        art.retail_corneria=True
        art.aircraft_scale=.48 if s=='Fx' else .55
    elif s=='Lk':
        art.mechanisms.append(dropped_hand(3,floors[10][2],period=430,delay=165))
    elif s=='Cl':
        y=floors[10][2];plant=model('Deku Baba on the upper branch','deku',-100,y+34.4,18)
        art.mechanisms.append(plant)
        # The original treasure chest is a solid piece of the summit landing.
        chest=model('Kokiri summit chest','chest',-23,floors[16][2]+16,18)
        chest.update(kind='gate',height=16,outline=[(0,0),(18,0),(18,-16),(0,-16)],opensTarget=5)
        art.mechanisms.append(chest)
