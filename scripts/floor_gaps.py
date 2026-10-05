"""Remove broad bottom safety floors; draw matching openings in the stage mesh."""
import json
STAGES={'Ic','Ms','Mt','Ns','Pc','Pr','Ss','Zd','Fe'}

def apply_floor_gaps(art):
 if art.suffix not in STAGES or not art.solids:return
 from world_mechanics import clip_polygon
 x,y,w,h,material=art.solids[0];top=y+h
 scene=json.loads((art.world_assets/'scene.json').read_text());left,ceiling,right,bottom=scene['bounds']
 if w<(right-left)*.55:return
 # Keep only a small launch island, real tower supports and small low-target
 # landings. These are gameplay supports, not a continuous rescue floor.
 protected=[(art.spawn[0]-22,art.spawn[0]+22)]
 for sx,sy,sw,sh,_ in art.solids[1:]:
  if sy<top+2 and sy+sh>top+5:protected.append((sx-3,sx+sw+3))
 for tx,ty in art.targets:
  if top+4<ty<top+28:protected.append((tx-14,tx+14))
 if art.suffix=='Mt':protected.append((x+w-42,x+w))
 intervals=[]
 for a,b in sorted(protected):
  a,b=max(x,a),min(x+w,b)
  if a>=b:continue
  if intervals and a<=intervals[-1][1]+35:intervals[-1]=(intervals[-1][0],max(intervals[-1][1],b))
  else:intervals.append((a,b))
 gaps=[];last=x
 for a,b in intervals:
  if a-last>=35:gaps.append((last,a))
  last=b
 if x+w-last>=35:gaps.append((last,x+w))
 if not gaps:return
 # Complement the holes, retaining tiny strips adjacent to a structural wall.
 kept=[];last=x
 for a,b in gaps:
  if a>last:kept.append((last,a))
  last=b
 if last<x+w:kept.append((last,x+w))
 contours=getattr(art,'solid_contours',{});poly=contours.get(0,[(x,top),(x+w,top),(x+w,y),(x,y)])
 n=len(kept);old_ledges=getattr(art,'no_lower_ledges',set())
 art.solids=[(a,y,b-a,h,material) for a,b in kept]+art.solids[1:]
 art.solid_contours={**{i:clip_polygon(poly,a,b) for i,(a,b) in enumerate(kept)},**{i+n-1:p for i,p in contours.items() if i}}
 art.no_lower_ledges={i+n-1 for i in old_ledges if i}|(set(range(n)) if 0 in old_ledges else set())
 art.floor_voids=[[a,bottom,b,top+.6] for a,b in gaps]
 for a,b in gaps:art.pits.append(dict(left=a,right=b,top=top,bottom=art.bounds[3]-75,name='Open bottomless gap'))
 art.gameplay_identity+=' Bottom safety floor removed: recover onto the small remaining islands or fall out.'
