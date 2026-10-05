"""Painted foreground bevels derived from the final collision contours.

These are native render geometry, not new collision or a debug-wire overlay.
All shading lies INSIDE the actual solid. Shared/internal edges disappear, and
soft platforms retain their open underside. No bitmap or actor is replaced.
"""
import math
from build_grassland import Art


def cross(a,b,c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def inside(p,poly):
    result=False;x,y=p
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            result=not result
    return result


def contours(art):
    result=[]
    for i,(x,y,w,h,_) in enumerate(art.solids):
        p=list(getattr(art,'solid_contours',{}).get(i,[(x,y+h),(x+w,y+h),(x+w,y),(x,y)]))
        # Remove collinear vertices before ear clipping, including pit seams.
        p=[v for j,v in enumerate(p) if abs(cross(p[j-1],v,p[(j+1)%len(p)]))>1e-7]
        if sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))>0:p.reverse()
        result.append(p)
    return result


def triangulate(poly):
    p=list(poly);out=[]
    while len(p)>3:
        for i,b in enumerate(p):
            a=p[i-1];c=p[(i+1)%len(p)]
            if cross(a,b,c)>=-1e-8:continue
            if any(all(cross(u,v,q)<=1e-8 for u,v in ((a,b),(b,c),(c,a)))
                   for j,q in enumerate(p) if j not in ((i-1)%len(p),i,(i+1)%len(p))):continue
            out.append((a,b,c));p.pop(i);break
        else:raise ValueError('Cannot triangulate solid contour')
    if len(p)==3:out.append(tuple(p))
    return out


def clip(poly,triangle):
    for a,b in zip(triangle,triangle[1:]+triangle[:1]):
        result=[]
        for p,q in zip(poly,poly[1:]+poly[:1]):
            cp,cq=cross(a,b,p),cross(a,b,q)
            if cp<=1e-8:result.append(p)
            if (cp<0)!=(cq<0):
                t=cp/(cp-cq);result.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
        poly=result
        if not poly:break
    return poly


def exposed_edges(polys):
    """Split touching/overlapping solids before lighting their exterior."""
    for index,poly in enumerate(polys):
        for a,b in zip(poly,poly[1:]+poly[:1]):
            dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
            if length<1e-6:continue
            normal=(dy/length,-dx/length);cuts={0.,1.}
            for j,other in enumerate(polys):
                if j==index:continue
                for c,d in zip(other,other[1:]+other[:1]):
                    ex,ey=d[0]-c[0],d[1]-c[1];den=dx*ey-dy*ex
                    if abs(den)>1e-8:
                        t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den
                        u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den
                        if 0<t<1 and -.00001<=u<=1.00001:cuts.add(t)
                    elif abs(cross(a,b,c))<1e-5:
                        for p in (c,d):
                            t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length*length)
                            if 0<t<1:cuts.add(t)
            cuts=sorted(cuts)
            for lo,hi in zip(cuts,cuts[1:]):
                if (hi-lo)*length<.05:continue
                mid=(lo+hi)/2
                outside=(a[0]+dx*mid-normal[0]*.02,a[1]+dy*mid-normal[1]*.02)
                if any(inside(outside,p) for j,p in enumerate(polys) if j!=index):continue
                yield index,(a[0]+dx*lo,a[1]+dy*lo),(a[0]+dx*hi,a[1]+dy*hi),normal


def geometry(art):
    out=Art()
    # Kirby has no solid walls; LCD already uses explicit black collision art.
    if not art.solids or getattr(art,'native_fire',False):return out
    polys=contours(art);triangles=[triangulate(p) for p in polys]
    cool=art.suffix in ('Dr','Fx','Fc','Pk','Pc','Ss','Mt','Ic')
    light=(191,220,231) if cool else (240,220,179)
    dark=(12,24,34) if cool else (34,25,29)
    # Existing Doc, Mario and Ness foreground work needs a lighter touch.
    strength=.6 if art.suffix in ('Dr','Mr','Ns') else 1.
    for index,a,b,n in exposed_edges(polys):
        width=1.5*strength
        if art.suffix=='Pk' and abs(n[0])>.9:width=2.5
        # Continuous lit bevel, not a bright uniform wireframe. Top and left
        # faces receive light; undersides and right edges carry deeper shadow.
        # Soft contact shadows retain the painted material. Only walkable top
        # edges get a restrained highlight; bright vertical rails look like a
        # collision-debug box, especially on organic stone and tree trunks.
        bands=[(0,.3,dark,210,155),(.3,1.,dark,155,60),(1.,2.,dark,60,0)]
        if n[1]<-.65:bands=[(0,.35,light,135,80),(.35,1.,dark,90,40),(1.,2.,dark,40,0)]
        for start,end,color,alpha0,alpha1 in bands:
            s,e=start*width,end*width
            quad=[(a[0]+n[0]*s,a[1]+n[1]*s),(b[0]+n[0]*s,b[1]+n[1]*s),
                  (b[0]+n[0]*e,b[1]+n[1]*e),(a[0]+n[0]*e,a[1]+n[1]*e)]
            for tri in triangles[index]:
                poly=clip(quad,tri)
                for i in range(1,len(poly)-1):
                    points=(poly[0],poly[i],poly[i+1])
                    if abs(cross(*points))<1e-8:continue
                    vertices=[]
                    for x,y in points:
                        t=max(0,min(1,((x-a[0])*n[0]+(y-a[1])*n[1]-s)/(e-s)))
                        vertices.append((x,y,.15,bytes((*color,round(alpha0+(alpha1-alpha0)*t)))))
                    out.triangles.append(vertices)
    return out


def append(d,art,first):
    tail=first
    while d.u(tail+4):tail=d.u(tail+4)
    if art.suffix=='Pk' and art.solids:
        from modular_stage import painted_polygons,rect
        skins=getattr(art,'terrain_skins',None)
        indices=[i for i in range(len(art.solids)) if skins[i]==getattr(art,'housing_asset','solid-3')] if skins is not None else [max(range(len(art.solids)),key=lambda i:art.solids[i][3])]
        draws=[]
        for i in indices:
            x,y,w,h,_=art.solids[i]
            poly=getattr(art,'solid_contours',{}).get(i,rect(x,y+h,x+w,y))
            draws.append((poly,[0,455,339,0]))
        if draws:
            housing=painted_polygons(d,art.world_assets/'solid-housing',draws)
            d.pointer(tail+4,housing)
            while d.u(tail+4):tail=d.u(tail+4)
    overlay=geometry(art)
    if not overlay.triangles:return
    obj=overlay.model(d);material=d.u(obj+8)
    # Vertex alpha, native source-alpha blend, no Z writes. It draws after the
    # painting in the same opaque stage pass, behind fighters and target items.
    d.put(material+4,'I',0x4002)
    d.pointer(material+20,d.buffer(bytes([0x19,0,0,0,1,4,5,15,3,7,0,7])))
    d.pointer(tail+4,obj)
