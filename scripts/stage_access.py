"""Conservative structural access audit for foreground walls and landing routes.

This is not a Melee physics emulator. It splits floors at walls first, so the
base beneath a 140-unit tower cannot falsely connect both sides of that tower.
Arcs are bounded by the fighter's jump budget, with a small body clearance.
"""
import math


def climb_budget(art):
    p=art.movement_profile
    if art.suffix=='Ns':
        # Route permits a double jump followed by PK Thunder 2; native input
        # validation is recorded separately from this structural reach bound.
        return 120 / 1.16
    if art.suffix=='Kb':
        # Native controller probe: 78.84 units using four aerial jumps.
        # Reserve the fifth jump and a small margin; moving clouds refill jumps.
        return 76 / 1.10
    if art.suffix=='Pe':
        # Native full-hop + animation-driven double jump measured 62.59 units
        # with real controller inputs (terrain-pass / Pe-jump). Its attribute
        # airJumpMultiplier alone substantially underestimates this character.
        return 61
    if art.suffix in ('Ys','Fc','Ca'):
        from world_challenge import SCALE
        return (p['ballisticJumpApex']+p['ballisticAirJumpApex']-10)/SCALE[art.suffix]
    return max(42,min(65,p['ballisticJumpApex']+p['ballisticAirJumpApex']-10))


def walkable_segments(art):
    floors=[(x,x+w,y+h) for x,y,w,h,_ in art.solids]+[(x,x+w,y) for x,y,w,_ in art.platforms]
    segments=[]
    for l,r,y in floors:
        intervals=[(l,r)]
        for bx,by,bw,bh,_ in art.solids:
            if by+bh<=y+.01 or by>=y+12:continue
            clipped=[]
            for a,b in intervals:
                if bx>=b or bx+bw<=a:clipped.append((a,b));continue
                if a<bx:clipped.append((a,bx))
                if bx+bw<b:clipped.append((bx+bw,b))
            intervals=clipped
        segments += [(a,b,y) for a,b in intervals if b-a>=6]
    return segments


def audit_landings(art):
    floors=walkable_segments(art)
    if art.suffix in ('Dk','Ca','Fc','Gn','Fx','Cl','Kb'):
        # Moving supports/grips provide the intermediate landings.
        # Sample its swept route for structural possibilities; timing and
        # carriage still need native input tests, not this static graph.
        from world_gameplay import RIDES
        for m in RIDES[art.suffix]:
            if m['kind']=='vine':
                # Knot endpoints at both extremes and through the centre. This
                # graph only checks possible routes; hanging needs native tests.
                for _,angle in m['angleKeys'][::6]:
                    gx,gy=m['gripOffset'];x=m['x']+gx*math.cos(angle)-gy*math.sin(angle)
                    y=m['y']+gx*math.sin(angle)+gy*math.cos(angle)
                    floors.append((x-5,x+5,y))
                continue
            for t in ((i/8 for i in range(9)) if art.suffix=='Cl' else (0,.25,.5,.75,1)):
                x=m['x']+m['dx']*t;y=m['y']+m['dy']*t
                if m.get('orbit'):
                    x=m['x']+m['dx']*(.5-.5*math.cos(2*math.pi*t))
                    y=m['y']+m['dy']*.5*math.sin(2*math.pi*t)
                floors.append((x,x+m['width'],y))
    if art.suffix in ('Fx','Fc'):
        # Real observed native flight positions, NOT fictitious service lifts.
        # This graph establishes possible boarding/exit geometry, not timing.
        import json
        from pathlib import Path
        from world_challenge import SCALE
        data=json.loads((Path(__file__).resolve().parents[1]/'assets/custom-stages/mechanisms/corneria-access.json').read_text())
        s=SCALE[art.suffix];size=.65 if art.suffix=='Fx' else 1.0
        for x,y in data['samples']:
            floors.append(((x-66.615*size)/s,(x+.22*size)/s,(y+1.6775*size)/s))
    return floors


def access_graph(art):
    floors=audit_landings(art)
    p=art.movement_profile
    # The five-jump characters and Peach have special jump/float tables not
    # represented by the single air-jump attribute. Retain a modest route cap.
    climb=climb_budget(art)
    speed=p['airSpeed'];gap=max(50,min(75,speed*65))
    if art.suffix=='Ns':gap=105
    if art.suffix=='Kb':gap=75
    def free(x,y):
        return not any(bx-2<x<bx+bw+2 and by-12<y<by+bh-.05 for bx,by,bw,bh,_ in art.solids)
    def path(a,b):
        al,ar,ay=a;bl,br,by=b
        if by-ay>climb or ay-by>(220 if art.suffix=='Fc' else 120) or max(bl-ar,al-br,0)>gap:return False
        starts=[al+3,al+min(18,(ar-al)/2),(al+ar)/2,ar-min(18,(ar-al)/2),ar-3];ends=[bl+3,bl+min(18,(br-bl)/2),(bl+br)/2,br-min(18,(br-bl)/2),br-3]
        if max(al,bl)<min(ar,br):
            shared=(max(al,bl)+min(ar,br))/2;starts.append(shared);ends.append(shared)
        for ax in starts:
            for bx in ends:
                if abs(bx-ax)>gap+30:continue
                # An ordinary traversal, a full hop and a double-jump detour.
                heights=[0,climb*.5,climb-abs(by-ay)*.5]
                if by<ay:
                    # A lower destination tilts the chord downward. Account
                    # for that drop so a full hop can clear the departure lip;
                    # the actual apex stays exactly climb above the start.
                    heights.append((math.sqrt(climb)+math.sqrt(climb+ay-by))**2/4)
                for height in heights:
                    if height<0:continue
                    if all(free(ax+(bx-ax)*t,ay+(by-ay)*t+4*height*t*(1-t)) for t in (i/40 for i in range(1,40))):
                        return True
        return False
    edges={i:[] for i in range(len(floors))}
    for i,a in enumerate(floors):
        for j,b in enumerate(floors):
            if i!=j and path(a,b):edges[i].append(j)
    reachable={i for i,(l,r,y) in enumerate(floors) if l<=art.spawn[0]<=r and abs(y+2-art.spawn[1])<.01}
    todo=list(reachable)
    while todo:
        for j in edges[todo.pop()]:
            if j not in reachable:reachable.add(j);todo.append(j)
    return floors,edges,reachable


def validate_access(art):
    floors,edges,reachable=access_graph(art)
    missing=[]
    for i,(x,y) in enumerate(art.targets):
        if not any(l-25<=x<=r+25 and -30<=y-h<=60 for j,(l,r,h) in enumerate(floors) if j in reachable):missing.append(i+1)
    if missing:raise ValueError(f'{art.character}: targets without a wall-clear route from spawn: {missing}')
    return {'reachableLandings':len(reachable),'landings':len(floors)}
