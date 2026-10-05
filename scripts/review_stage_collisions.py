"""Generate an offline foreground/target inspection sheet from the built manifest.

SVG boundaries overlay the unchanged paintings. This is an authoring aid, never
an in-game debug outline. Open the HTML and toggle solids/platforms/targets.
"""
import argparse
import base64
import html
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--manifest',type=Path,default=ROOT/'build/custom-stage/Character Worlds.json')
    ap.add_argument('--output',type=Path,default=ROOT/'build/custom-stage/foreground-review.html')
    args=ap.parse_args();manifest=json.loads(args.manifest.read_text());cards=[]
    for course in manifest['courses']:
        suffix=course['stageFile'][3:-4]
        directory=ROOT/'assets/custom-stages'/('manor' if suffix=='Lg' else 'worlds/'+suffix)
        scene=json.loads((directory/'scene.json').read_text());l,t,r,b=scene['bounds']
        image=directory/('painted-manor.png' if suffix=='Lg' else 'painted.png')
        data=base64.b64encode(image.read_bytes()).decode()
        def picture(uri,x,y,w,h):return f'<image href="data:image/png;base64,{uri}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="none"/>'
        items=[picture(data,l,-t,r-l,t-b)]
        if course.get('artwork')=='native LCD geometry':
            from build_character_worlds import WORLDS,WorldArt
            i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]==suffix)
            art=WorldArt(spec,i).build();l,t,r,b=art.preview_bounds;items=[]
            for tri in art.triangles:
                points=' '.join(f'{x},{-y}' for x,y,z,c in tri)
                colour='#'+tri[0][3][:3].hex()
                items.append(f'<polygon points="{points}" fill="{colour}"/>')
        if suffix=='Lg':
            ledge=base64.b64encode((directory/'ledge.png').read_bytes()).decode()
            # The painted floor overrides leave the original 14 sprite ledges.
            for i in list(range(12))+[19,20]:
                x,y,w,_=course['platforms'][i];items.append(picture(ledge,x,-y,w,7))
        for copy in ([] if course.get('artwork')=='native LCD geometry' else scene.get('platformCopies',[])):
            sx,sy,sr,sb=copy['sourcePixels'];x,y,w=copy['surface'];h=copy['height']
            iw,ih=scene['collisionTracing']['size']
            items.append(f'<svg x="{x}" y="{-y}" width="{w}" height="{h}" viewBox="{sx} {sy} {sr-sx} {sb-sy}" preserveAspectRatio="none">'+picture(data,0,0,iw,ih)+'</svg>')
        for i,(x,y,w,h,_) in enumerate(course['solids']):
            contour=course.get('solidContours',{}).get(str(i),[(x,y+h),(x+w,y+h),(x+w,y),(x,y)])
            points=' '.join(f'{px},{-py}' for px,py in contour)
            items.append(f'<polygon class="solid" points="{points}"/>')
        for x,y,w,_ in course['platforms']:
            items.append(f'<path class="platform" d="M {x} {-y} h {w}"/>')
        for i,(x,y) in enumerate(course['targets']):
            items.append(f'<g class="target"><circle cx="{x}" cy="{-y}" r="6"/><text x="{x}" y="{-y+2}">{i+1}</text></g>')
        dims=course.get('dimensions',{});span=dims.get('targetSpan')
        size=f" · {span[0]:g} × {span[1]:g} units" if span else ''
        title=html.escape(course['character']+' — '+course['name']+size)
        cards.append(f'<article><h2>{title}</h2><svg viewBox="{l} {-t} {r-l} {t-b}">'+''.join(items)+'</svg></article>')
    page='''<!doctype html><meta charset="utf-8"><title>Character Worlds — foreground audit</title>
<style>body{margin:0;background:#111821;color:#eef3fa;font:16px system-ui}header{position:sticky;top:0;padding:16px;background:#182333;z-index:1}label{margin-right:22px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;padding:20px}h2{font-size:16px}svg{width:100%;max-height:90vh}.solid{fill:#ff805a20;stroke:#ff805a;stroke-width:.6}.platform{fill:none;stroke:#28ffbb;stroke-width:.8}.target circle{fill:#ed305fcc;stroke:#fff;stroke-width:.5}.target text{fill:white;text-anchor:middle;font:6px sans-serif}.hide-solid .solid,.hide-platform .platform,.hide-target .target{display:none}</style>
<header>Foreground audit · <label><input type="checkbox" checked data-layer="solid">Solid outlines</label><label><input type="checkbox" checked data-layer="platform">One-way floors</label><label><input type="checkbox" checked data-layer="target">Targets</label></header><main>'''+''.join(cards)+'''</main><script>for(const input of document.querySelectorAll('input'))input.onchange=()=>document.body.classList.toggle('hide-'+input.dataset.layer,!input.checked)</script>'''
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(page)
    print(args.output)


if __name__=='__main__':main()
