"""Fit collision boundaries to the finished painting, without altering its pixels.

Anchors are [left, right, top] in source-image pixels, in blockout surface order.
The image dimensions/hash bind each tracing to the exact artwork it describes.
Targets and spawn retain their relative position on their original support.
"""
import json


def fit_manor(art):
    scene=json.loads((art.painted_scene.parent/'scene.json').read_text())
    tracing=scene['paintedFloors']
    if tracing['sourceSha256']!=scene['sourceSha256']:raise ValueError('Re-trace the manor artwork')
    iw,ih=tracing['size'];l,t,r,b=scene['bounds']
    def xy(px,py):return l+px/iw*(r-l),t-py/ih*(t-b)
    px,pr,py,pb=tracing['foundation'];x,y=xy(px,py);right,bottom=xy(pr,pb)
    old=art.solids[0];fraction=(art.spawn[0]-old[0])/old[2]
    art.solids[0]=(x,bottom,right-x,y-bottom,old[4])
    art.spawn=(x+fraction*(right-x),y+2)
    for index,(px,pr,py) in tracing['platforms'].items():
        index=int(index);x,y=xy(px,py);right,_=xy(pr,py)
        art.platforms[index]=(x,y,right-x,art.platforms[index][3])
    # Preserve target support identities while cutting the actual painted gaps.
    art.authored_surfaces=[(x,x+w,y+h) for x,y,w,h,_ in art.solids]+[(x,x+w,y) for x,y,w,_ in art.platforms]
    art.mansion_gaps=[]
    platforms=[]
    for index,(x,y,w,material) in enumerate(art.platforms):
        gap=tracing.get('floorGaps',{}).get(str(index))
        if gap:
            left,right=(xy(px,0)[0] for px in gap)
            if not x<left<right<x+w:raise ValueError('Manor gap outside its floor')
            platforms.extend([(x,y,left-x,material),(right,y,x+w-right,material)])
            art.mansion_gaps.append((left,right,y))
        else:platforms.append((x,y,w,material))
    art.platforms=platforms
    if tracing.get('foundationGap'):
        left,right=(xy(px,0)[0] for px in tracing['foundationGap'])
        x,y,w,h,m=art.solids[0]
        art.solids=[(x,y,left-x,h,m),(right,y,x+w-right,h,m)]
        art.mansion_gaps.append((left,right,y+h))
    return art


def fit_surfaces(art):
    scene = json.loads((art.world_assets / 'scene.json').read_text())
    tracing = scene.get('collisionTracing')
    if tracing is None:
        return art
    if tracing['sourceSha256'] != scene['sourceSha256']:
        raise ValueError('Collision tracing belongs to different artwork')
    width, height = tracing['size']
    left, top, right, bottom = scene['bounds']
    if art.layout:
        original = list(art.layout['surfaces'])
    else:
        original = [(x,y+h,w,h) for x,y,w,h,_ in art.solids]
    if len(original) != len(tracing['surfaces']):
        raise ValueError('Incomplete painted collision tracing: ' + art.suffix)
    fitted = []
    for px, pr, py in tracing['surfaces']:
        if not (0 <= px < pr <= width and 0 <= py < height):
            raise ValueError('Invalid painted surface anchor')
        fitted.append((left+px/width*(right-left), top-py/height*(top-bottom),
                       (pr-px)/width*(right-left)))
    def relocate(point):
        x,y = point
        options = [(i,s) for i,s in enumerate(original)
                   if s[0]-20 <= x <= s[0]+s[2]+20 and s[1] <= y]
        i,(ox,oy,ow,_) = max(options,key=lambda item:item[1][1])
        nx,ny,nw = fitted[i]
        return (nx+(x-ox)/ow*nw,ny+(y-oy))
    art.targets = [relocate(p) for p in art.targets]
    art.spawn = relocate(art.spawn)
    solids, platforms = [], []
    art.solid_contours={}
    art.no_lower_ledges=set()
    for i,(x,y,w,h) in enumerate(original):
        nx,ny,nw = fitted[i]
        if i in tracing.get('removedSurfaces',[]):continue
        old_solid = next((s for s in art.solids if s[:4] == (x,y-h,w,h)),None)
        if old_solid is None:
            material = next(s[3] for s in art.platforms if s[:3] == (x,y,w))
            intervals=[(nx,nx+nw)]
            for pl,pr in tracing.get('surfaceGaps',{}).get(str(i),[]):
                gl=left+pl/width*(right-left);gr=left+pr/width*(right-left)
                if not nx<gl<gr<nx+nw:raise ValueError('Gap outside painted platform')
                intervals=[part for l,r in intervals for part in [(l,min(r,gl)),(max(l,gr),r)] if part[1]>part[0]]
            platforms.extend((l,ny,r-l,material) for l,r in intervals)
        else:
            # Keep stacked walls joined to the floor below after adjusting tops.
            supports = [(j,s) for j,s in enumerate(original) if j != i
                        and abs(s[1]-(y-h)) < .01
                        and s[0] <= x+.01 and s[0]+s[2] >= x+w-.01]
            floor = fitted[supports[0][0]][1] if supports else ny-h
            if ny <= floor:
                raise ValueError('Painting reverses a solid surface')
            solids.append((nx,floor,nw,ny-floor,old_solid[4]))
            if i in tracing.get('noLowerLedges',[]):art.no_lower_ledges.add(len(solids)-1)
            outline=tracing.get('solidOutlines',{}).get(str(i))
            if outline:
                contour=[(left+px/width*(right-left),top-py/height*(top-bottom)) for px,py in outline]
                if len(contour)<4 or contour[:2]!=[(nx,ny),(nx+nw,ny)]:
                    # Float sums may round differently; verify against pixels.
                    if len(contour)<4 or outline[:2]!=[[tracing['surfaces'][i][0],tracing['surfaces'][i][2]],
                                                     [tracing['surfaces'][i][1],tracing['surfaces'][i][2]]]:
                        raise ValueError('Solid outline must start on its traced floor')
                art.solid_contours[len(solids)-1]=contour
                floor=min(y for x,y in contour)
                wall_left=min(x for x,y in contour);wall_right=max(x for x,y in contour)
                solids[-1]=(wall_left,floor,wall_right-wall_left,ny-floor,old_solid[4])
    if art.suffix=='Gn':
        # The jagged vertical facades are walls, not steep walkable ramps.
        art.steep_contour_walls=True
        art.no_lower_ledges=set(range(len(solids)))
    art.solids,art.platforms = solids,platforms
    art.authored_surfaces = [(x,x+w,y) for x,y,w in fitted]
    for copy in scene.get('platformCopies',[]):
        x,y,w = copy['surface']
        art.platforms.append((x,y,w,4))
        art.authored_surfaces.append((x,x+w,y))
    art.platform_copies = scene.get('platformCopies',[])
    if 'spawnSurface' in tracing:
        x,y,w=fitted[tracing['spawnSurface']]
        art.spawn=(x+w*tracing.get('spawnFraction',.5),y+2)
    if art.suffix=='Ns':art.bounds=(art.bounds[0],225,art.bounds[2],art.bounds[3])
    art.collision_tracing = tracing
    return art
