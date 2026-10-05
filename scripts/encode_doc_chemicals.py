"""Authoring-only extraction and GX RGBA8 encoding of the lab sprite sheet."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'assets/custom-stages/worlds/Dr'


def rgba8(image):
    import numpy as np
    a = np.asarray(image.convert('RGBA'), dtype=np.uint8)
    h, w, _ = a.shape
    if w % 4 or h % 4: raise ValueError('RGBA8 uses 4x4 tiles')
    blocks = a.reshape(h//4,4,w//4,4,4).transpose(0,2,1,3,4).reshape(-1,16,4)
    return np.concatenate((blocks[:,:,[3,0]].reshape(-1,32),
                           blocks[:,:,[1,2]].reshape(-1,32)),axis=1).tobytes()


def main():
    from PIL import Image
    source = Image.open(ROOT / 'chemicals.png').convert('RGBA')
    # Split mechanical mounting points from the reacting liquid/moving head.
    parts = {
        'basin': ([18,265,853,579], [512,192]),
        'glob': ([876,222,1315,499], [256,160]),
        'nozzle': ([1315,165,1659,549], [192,216]),
        'cap': ([1703,16,2143,194], [256,104]),
        'shaft': ([1853,214,1986,350], [64,64]),
        'press': ([1832,350,2014,696], [128,244]),
    }
    manifest = {'sourceSha256': hashlib.sha256((ROOT/'chemicals.png').read_bytes()).hexdigest(), 'sprites':{}}
    for name,(box,size) in parts.items():
        sprite = source.crop(box).resize(size, Image.Resampling.LANCZOS)
        data = rgba8(sprite); filename = 'chemical-'+name+'.rgba8'
        (ROOT/filename).write_bytes(data)
        manifest['sprites'][name] = dict(file=filename,size=size,sourcePixels=box,
                                         sha256=hashlib.sha256(data).hexdigest())
    (ROOT/'chemicals.json').write_text(json.dumps(manifest,indent=2)+'\n')


if __name__ == '__main__': main()
