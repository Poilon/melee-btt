"""Character-aware target routes, with optional shortcuts rather than forced moves.

Jump attributes and hitbox radii are audited from the user's USA 1.02 disc.
Bone-local offsets are used only as a design cue, never as world-space reach.
All targets retain a nearby aerial/melee approach as well as the named trick.
"""
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/'assets/custom-stages/worlds'
# Three characteristic tools: horizontal option, aerial option, high option.
TOOLS={
 'Mr':('Fireball bounce','back air','up air'),
 'Ca':('dash into knee','back air','up air'),
 'Cl':('boomerang / fire arrow','forward air','up air'),
 'Dk':('Giant Punch','back air','up air'),
 'Dr':('Megavitamin bounce','back air','up air'),
 'Fc':('short-hop laser','down air','up air'),
 'Fx':('Blaster lane','back air','up air'),
 'Ic':('Ice Shot','forward-air hammer','up-air hammer'),
 'Kb':('forward aerial drift','back air','multi-jump up air'),
 'Kp':('Fire Breath','forward air','up air'),
 'Lk':('boomerang / arrow','forward air','up air'),
 'Lg':('straight Fireball','back air','up air'),
 'Ms':('forward smash tip','forward-air arc','up-air sword arc'),
 'Mt':('Shadow Ball','back-air tail','up-air tail'),
 'Ns':('PK Fire / yo-yo','back air','up air / PK Thunder'),
 'Pe':('turnip throw','float forward air','up air'),
 'Pc':('Thunder Jolt','back air','Thunder'),
 'Pk':('Thunder Jolt','neutral air','Thunder'),
 'Pr':('drifting forward air','back air','multi-jump up air'),
 'Ss':('missile / Charge Shot','forward air','up air'),
 'Sk':('grounded Needles','forward air','up air'),
 'Ys':('Egg Throw arc','back air','double-jump up air'),
 'Zd':("Din's Fire",'forward-air kick','up air'),
 'Gw':('Chef arc','back air','up air'),
 'Fe':('close forward smash','forward air','up air'),
 'Gn':('forward tilt','back air','up air'),
}


def surfaces(art):
    return [(x,x+w,y+h) for x,y,w,h,_ in art.solids]+[(x,x+w,y) for x,y,w,_ in art.platforms]


def unobstructed(art,x,y):
    if any(sx-7<x<sx+w+7 and sy-7<y<sy+h+7 for sx,sy,w,h,_ in art.solids):return False
    if any(sx-7<x<sx+w+7 and abs(y-sy)<7 for sx,sy,w,_ in art.platforms):return False
    l,t,r,b=getattr(art,'bounds',(-365,205,350,-25))
    return l+8<x<r-8 and b+8<y<t-8


def apply_routes(art):
    profile=json.loads((ROOT/'movement.json').read_text())['characters'][art.suffix]
    from target_encounters import ENCOUNTERS
    horizontal,aerial,upper=TOOLS[art.suffix]
    floors=getattr(art,'authored_surfaces',surfaces(art))
    targets=[];notes=[]
    for i,(support,fraction,height,offset) in enumerate(ENCOUNTERS[art.suffix]):
        l,r,top=floors[support]
        x,y=round(l+(r-l)*fraction+offset,2),round(top+height,2)
        if not unobstructed(art,x,y):
            raise ValueError(f'{art.character}: encounter {i+1} intersects the foreground at {(x,y)}')
        if any(math.hypot(x-a,y-b)<17 for a,b in targets):
            raise ValueError(f'{art.character}: encounter {i+1} overlaps another target')
        targets.append((x,y))
        kind='underside' if height<0 else 'edge' if offset else 'high' if height>=30 else 'lane' if height<=12 else 'aerial'
        hint={'underside':'catch this target below the landing, then recover',
              'edge':'reach around the outside of the ledge',
              'high':'take the upper detour or reach up with an aerial',
              'lane':'sweep through the low firing lane',
              'aerial':'catch this target while crossing the gap'}[kind]
        notes.append({'target':i+1,'position':targets[-1],'setup':kind,
                      'move':horizontal if kind=='lane' else upper if kind=='high' else aerial,
                      'hint':hint,'support':[l,r,top],'optionalShortcut':True})
    art.targets=targets;art.route_notes=notes;art.movement_profile=profile
    return art
