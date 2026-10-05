"""Authoring-only: export lossless Dolphin replacements for painted backdrops.

Use approved artwork and the original tile UVs. Optional background-hd.png
masters contain separately authored detail; ordinary sources stay unchanged.
"""
import ctypes
import ctypes.util
import hashlib
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/custom-stages/background-textures'


def texture_hash(data):
    # Dolphin's tex1 naming uses XXH64 of the complete encoded GX tile, seed 0.
    lib = ctypes.CDLL(ctypes.util.find_library('xxhash'))
    lib.XXH64.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint64]
    lib.XXH64.restype = ctypes.c_uint64
    return lib.XXH64(data, len(data), 0)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = []
    for folder in sorted((ROOT / 'assets/custom-stages/modular').iterdir()):
        source = folder / 'background.png'
        if not source.exists():
            continue
        if (folder / 'background-hd.png').exists():
            source = folder / 'background-hd.png'
        scene = json.loads((folder / 'scene.json').read_text())
        original = Image.open(source).convert('RGB')
        w, h = scene['size']
        # Integer multiples preserve the exact border shared by adjacent tiles.
        # Luigi's 1254px source exceeds its 1024px native texture; retain it.
        scale = max(1, math.ceil(max(original.width / w, original.height / h)))
        image = original.resize((w * scale, h * scale), Image.Resampling.LANCZOS)
        for tile in scene['tiles']:
            encoded = (folder / tile['file']).read_bytes()
            if hashlib.sha256(encoded).hexdigest() != tile['sha256']:
                raise ValueError('Outdated background tile: ' + str(folder))
            x, y, tw, th = tile['rect']
            name = f'tex1_{tw}x{th}_{texture_hash(encoded):016x}_14.png'
            image.crop((x*scale, y*scale, (x+tw)*scale, (y+th)*scale)).save(OUTPUT / name)
            records.append(dict(stage=folder.name, file=name,
                                source=source.name,
                                sha256=hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest(),
                                sourceSize=list(original.size), size=[tw*scale, th*scale]))
    (OUTPUT / 'manifest.json').write_text(json.dumps(dict(version=1, textures=records), indent=2)+'\n')
    print(f'{len(records)} lossless tiles for {len({r["stage"] for r in records})} backgrounds')


if __name__ == '__main__':
    main()
