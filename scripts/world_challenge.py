"""Course dimensions and deliberately awkward target approaches.

Painting and physical geometry share one uniform transform. Fighter physics,
attack hitboxes and target size stay native. These are authored routes, not RNG.
"""
import math
import struct

SCALE={'Mr':1.0,'Ca':1.18,'Cl':1.10,'Dk':1.05,'Dr':1.0,'Fc':1.06,
       'Fx':.90,'Ic':1.10,'Kb':1.10,'Kp':1.0,'Lk':.92,'Lg':1.08,
       'Ms':.96,'Mt':.72,'Ns':1.16,'Pe':1.0,'Pc':.68,'Pk':.86,
       'Pr':1.23,'Ss':1.10,'Sk':.90,'Ys':1.1,'Zd':.94,'Gw':1.0,
       'Fe':1.03,'Gn':.92}

# (target, support, fraction, horizontal offset, height, intended approach).
# Different numbers of difficult encounters, at different parts of each route.
TRIALS={
 'Mr':[],
 'Ca':[(6,2,.18,0,-34,'Leave the overpass from below; carry momentum into the return jump.'),
       (8,2,1,38,21,'Commit beyond the far end of the track before turning back.')],
 'Cl':[],
 'Dk':[], 
 'Dr':[(2,4,.75,0,-24,'Reverse the aerial beneath the access catwalk, staying outside the solid cabinet.'),
       (7,14,.6,0,38,'Reach the chamber roof before the high output target.'),
       (9,7,.5,0,-50,'Drop into the open service shaft and recover to its narrow ledge or the passing tray.')],
 'Fc':[],
 'Fx':[],
 'Ic':[(2,2,.75,0,-29,'Drop below the icy landing and return before drifting past the next floe.'),
       (5,6,.1,15,-30,'Attack beneath the upper shelf, keeping the second jump for the return.'),
       (8,9,.2,0,56,'Reach the summit before committing to the high hammer hit.')],
 'Kb':[],
 'Kp':[],
 'Lk':[],
 'Lg':[(2,1,1,50,19,'Cross the foyer to the target beyond the furniture, then return to the stairwell.'),
       (5,11,.85,0,55,'Leave the middle landing for a high hit; the dumbwaiter provides a timed alternative.'),
       (9,21,.7,0,65,'Reach the attic before using the last jump above the roof beam.')],
 'Ms':[(2,1,0,-46,36,'Climb the exterior marble steps, then drift outside the tower for the sword hit.'),
       (4,9,.15,0,-33,'Drop under the central battlement and turn the sword back toward the wall.'),
       (6,10,.8,0,61,'Keep the double jump for the high target above the keep.'),
       (7,12,1,35,-30,'Round the outer rampart; save Dolphin Slash for the return.')],
 'Mt':[(4,9,.1,0,66,'Leave the containment ring for the high target, saving Teleport for a return.'),
       (8,4,1,49,-25,'Get outside the lower chamber before attacking back toward the wall.')],
 'Ns':[],
 'Pe':[],
 'Pc':[(0,10,0,-45,-25,'Go outside the lower battery casing and use Agility to return.'),
       (3,7,.4,0,-31,'Drop through the tiny ledge and attack before the contact window changes.'),
       (8,5,1,44,-23,'Round the large battery from the outside instead of jumping straight up.')],
 'Pk':[(1,2,.75,0,-25,'Catch the target below the western coil and Quick Attack back toward the lift.'),
       (5,10,.82,0,67,'Climb above the generator; use Thunder or spend the double jump.'),
       (7,7,1,38,-29,'Drop past the right coil, then angle the return toward a safe ledge.')],
 'Pr':[(1,2,0,-39,-30,'Leave the moon path for a low outside target and budget the return jumps.'),
       (4,5,.65,0,-36,'Descend beneath the middle moon instead of following the upward route.'),
       (9,9,.9,0,66,'Save enough jumps for the high final detour; do not spend them chasing earlier targets.')],
 'Ss':[(2,1,.45,0,-34,'Enter the underside of the first cave shelf from its open shaft.'),
       (4,7,0,-36,36,'Leave the staircase for the outside cave pocket.'),
       (6,11,0,-40,63,'Use the small chamber block to set up a high missile or aerial.')],
 'Sk':[(4,5,.8,0,-33,'Drop through the shadow ledge and hit beneath it before the next step disappears.'),
       (7,8,1,40,-29,'Commit outside the upper staircase, then recover inward with Vanish.'),
       (8,9,.18,0,63,'Reach the shrine roof before the final high detour.')],
 'Ys':[], 
 'Zd':[(1,3,.7,0,-34,'Reach beneath the temple balcony from the side.'),
       (4,7,.3,0,-34,'Drop beneath the central beam and return through the sequential light platforms.'),
       (8,4,1,42,41,'Approach the outer temple target before using Farore’s Wind to return.')],
 'Gw':[(1,2,.7,0,-23,'Fall below the middle window and return around its sill.'),
       (3,4,.8,0,58,'Reach the burning roof before taking the high rescue target.'),
       (9,7,1,25,-22,'Go beyond the ambulance and recover to its roof.')],
 'Fe':[(1,3,.3,0,-32,'Attack beneath the western rampart while descending.'),
       (7,12,1,35,-30,'Drop outside the eastern steps and keep Blazer for the return.'),
       (8,10,.2,0,53,'Leave the staircase for a high sword hit instead of following it directly.')],
 'Gn':[],
}


def apply_trials(art):
    from character_routes import unobstructed
    floors=getattr(art,'authored_surfaces',None)
    if floors is None:
        from character_routes import surfaces
        floors=surfaces(art)
    art.world_scale=SCALE[art.suffix]
    # Native targets keep their radius when the scene is compacted. Lift the
    # existing low lanes by exactly the lost clearance, rather than shrink hits.
    for i,n in enumerate(art.route_notes):
        x,y=art.targets[i];height=y-n['support'][2]
        if 0<height<12 and height*art.world_scale<9:
            y=n['support'][2]+9/art.world_scale
            art.targets[i]=(x,y);n['position']=(x,y)
    art.trials=[]
    l,t,r,b=getattr(art,'bounds',(-365,205,350,-25))
    for _,support,fraction,offset,height,_ in TRIALS[art.suffix]:
        a,z,top=floors[support];x=a+(z-a)*fraction+offset;y=top+height
        l=min(l,x-20);r=max(r,x+20);t=max(t,y+20);b=min(b,y-20)
    art.bounds=(l,t,r,b)
    for index,support,fraction,offset,height,hint in TRIALS[art.suffix]:
        l,r,top=floors[support];x=round(l+(r-l)*fraction+offset,2);y=round(top+height,2)
        if not unobstructed(art,x,y):raise ValueError(f'{art.suffix}: trial {index+1} intersects scenery at {x,y}')
        if any(math.hypot(x-xx,y-yy)<17 for j,(xx,yy) in enumerate(art.targets) if j!=index):
            raise ValueError(f'{art.suffix}: trial {index+1} overlaps another target')
        art.targets[index]=(x,y)
        art.route_notes[index].update(position=(x,y),setup='technical',hint=hint,support=[l,r,top])
        art.trials.append(index)
    return art


def scale_archive(d,art):
    """Uniformly transform rendering, static collision and native camera points.

    Animated islands inherit the stage root matrix; their LOCAL vertices must
    not also be scaled. Target items read world anchor positions and stay native.
    """
    s=getattr(art,'world_scale',1)
    if s==1:return
    m=d.roots['map_head'];groups=d.u(m+8)
    root=d.u(groups+104);d.put(root+32,'3f',s,s,1)
    c=d.roots['coll_data'];vp=d.u(c);gp=d.u(c+36)
    start,count=struct.unpack_from('>2h',d.data,gp+36)
    for i in range(start,start+count):
        x,y=struct.unpack_from('>2f',d.data,vp+8*i);d.put(vp+8*i,'2f',x*s,y*s)
    box=struct.unpack_from('>4f',d.data,gp+20);d.put(gp+20,'4f',*(v*s for v in box))
    anchor=d.u(d.u(groups)+8)
    while anchor:
        x,y=struct.unpack_from('>2f',d.data,anchor+44);d.put(anchor+44,'2f',x*s,y*s);anchor=d.u(anchor+12)


def dimensions(art):
    s=art.world_scale
    points=[(x*s,y*s) for x,y in art.targets]
    return {'scale':s,'targetSpan':[round(max(x for x,y in points)-min(x for x,y in points),2),
                                   round(max(y for x,y in points)-min(y for x,y in points),2)],
            'technicalTargets':[i+1 for i in art.trials],
            'coordinates':'Authored coordinates; multiply by scale for native world positions.'}


def validate_scaled_clearance(art):
    from copy import copy
    from character_routes import unobstructed
    if not getattr(art,'native_fire',False):
        import json
        l,t,r,b=json.loads((art.world_assets/'scene.json').read_text())['bounds']
        positions=list(art.targets)+[(x,y) for cycle in art.target_cycles for _,x,y in cycle['keys']]
        margin=24 if art.suffix in ('Dr','Mr','Kp','Pe','Ys','Dk') else 12
        if any(not (l+margin<x<r-margin and b+margin<y<t-margin) for x,y in positions):
            raise ValueError(art.suffix+': target extends beyond the illustrated play area')
    s=art.world_scale;scaled=copy(art)
    scaled.solids=[(x*s,y*s,w*s,h*s,m) for x,y,w,h,m in art.solids]
    scaled.platforms=[(x*s,y*s,w*s,m) for x,y,w,m in art.platforms]
    scaled.bounds=tuple(v*s for v in art.bounds)
    points=[(x*s,y*s) for x,y in art.targets]
    for i,(x,y) in enumerate(points):
        if not unobstructed(scaled,x,y):raise ValueError(f'{art.suffix}: native-size target {i+1} intersects compact scenery')
        if any(math.hypot(x-xx,y-yy)<12 for xx,yy in points[:i]):
            raise ValueError(f'{art.suffix}: native-size targets overlap after scaling')
    for cycle in art.target_cycles:
        samples=[(x*s,y*s) for _,x,y in cycle['keys']]
        if cycle['kind']=='moving':
            samples=[(x+(xx-x)*i/32,y+(yy-y)*i/32)
                     for (x,y),(xx,yy) in zip(samples,samples[1:]) for i in range(33)]
        if any(not unobstructed(scaled,x,y) for x,y in samples):
            raise ValueError(f'{art.suffix}: native-size target path {cycle["target"]+1} intersects compact scenery')
