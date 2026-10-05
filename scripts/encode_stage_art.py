"""Prepare painted stage artwork as native CMPR tiles (authoring only).

Requires Pillow and NumPy. The portable stage builder reads the encoded files
directly and has no image-library dependency. No artwork is generated here.
"""
import argparse
import hashlib
import json
from pathlib import Path


def encode_cmpr(image):
    import numpy as np
    a = np.asarray(image.convert('RGB'), dtype=np.float32)
    h, w, _ = a.shape
    if w % 8 or h % 8:
        raise ValueError('CMPR dimensions must be multiples of eight')
    blocks = a.reshape(h // 4, 4, w // 4, 4, 3).transpose(0, 2, 1, 3, 4).reshape(-1, 16, 3)
    lo, hi = blocks.min(1), blocks.max(1)
    # Fit the block's colour axis, then refine the two RGB565 endpoints.
    axis = hi - lo
    projection = (blocks * axis[:, None]).sum(2)
    rows = np.arange(len(blocks))
    hi, lo = blocks[rows, projection.argmax(1)], blocks[rows, projection.argmin(1)]

    def quantize(c):
        c = np.clip(c, 0, 255)
        r = np.rint(c[:, 0] * 31 / 255).astype(np.uint16)
        g = np.rint(c[:, 1] * 63 / 255).astype(np.uint16)
        b = np.rint(c[:, 2] * 31 / 255).astype(np.uint16)
        return r << 11 | g << 5 | b

    def decode(c):
        r, g, b = (c >> 11) & 31, (c >> 5) & 63, c & 31
        return np.stack([(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)], 1).astype(np.float32)

    for iteration in range(3):
        q0, q1 = quantize(hi), quantize(lo)
        c0, c1 = np.maximum(q0, q1), np.minimum(q0, q1)
        p0, p1 = decode(c0), decode(c1)
        palette = np.stack([p0, p1, (5 * p0 + 3 * p1) / 8, (3 * p0 + 5 * p1) / 8], 1)
        indices = ((blocks[:, :, None, :] - palette[:, None, :, :]) ** 2).sum(3).argmin(2)
        if iteration == 2:
            break
        alpha = np.array([1, 0, 5 / 8, 3 / 8], dtype=np.float32)[indices]
        beta = 1 - alpha
        aa, bb, ab = (alpha * alpha).sum(1), (beta * beta).sum(1), (alpha * beta).sum(1)
        ax, bx = (blocks * alpha[:, :, None]).sum(1), (blocks * beta[:, :, None]).sum(1)
        determinant = aa * bb - ab * ab
        valid = determinant > 1e-5
        denominator = np.maximum(determinant, 1e-5)[:, None]
        hi = np.where(valid[:, None], (ax * bb[:, None] - bx * ab[:, None]) / denominator, p0)
        lo = np.where(valid[:, None], (bx * aa[:, None] - ax * ab[:, None]) / denominator, p1)
    encoded = np.empty((len(blocks), 8), dtype=np.uint8)
    encoded[:, 0], encoded[:, 1] = c0 >> 8, c0 & 255
    encoded[:, 2], encoded[:, 3] = c1 >> 8, c1 & 255
    indices = indices.reshape(-1, 4, 4)
    encoded[:, 4:] = (indices[:, :, 0] << 6) | (indices[:, :, 1] << 4) | (indices[:, :, 2] << 2) | indices[:, :, 3]
    # GX 8x8 tiles each contain TL, TR, BL, BR 4x4 blocks, big-endian rows.
    return encoded.reshape(h // 8, 2, w // 8, 2, 8).transpose(0, 2, 1, 3, 4).tobytes()


def main():
    from PIL import Image
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('image', type=Path)
    ap.add_argument('output', type=Path)
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    # Four hardware-sized tiles, preserving the source scene's world mapping.
    source = Image.open(args.image).convert('RGB')
    image = source.resize((2048, 2048), Image.Resampling.LANCZOS)
    scene = {'format': 'GX_CMPR_1', 'size': [2048, 2048], 'bounds': [-310, 540, 310, -65],
             'sourceSha256': hashlib.sha256(args.image.read_bytes()).hexdigest(), 'tiles': []}
    previous=args.output/'scene.json'
    if previous.exists():
        tracing=json.loads(previous.read_text()).get('paintedFloors')
        if tracing:
            if tracing['sourceSha256']!=scene['sourceSha256']:raise ValueError('Re-trace the changed manor painting')
            scene['paintedFloors']=tracing
    for y in (0, 1024):
        for x in (0, 1024):
            data = encode_cmpr(image.crop((x, y, x + 1024, y + 1024)))
            name = f'scene-{y // 1024}-{x // 1024}.cmpr'
            (args.output / name).write_bytes(data)
            scene['tiles'].append({'file': name, 'rect': [x, y, 1024, 1024], 'sha256': hashlib.sha256(data).hexdigest()})
    # Reuse the painting's carved ledge as a native sprite at each exact
    # collision position. Source coordinates are normalized to the original.
    crop = tuple(round(v * (source.width if i % 2 == 0 else source.height))
                 for i, v in enumerate((961 / 1269, 1053 / 1239, 1026 / 1269, 1070 / 1239)))
    ledge = source.crop(crop).resize((128, 32), Image.Resampling.LANCZOS)
    data = encode_cmpr(ledge)
    (args.output / 'ledge.cmpr').write_bytes(data)
    ledge.save(args.output / 'ledge.png')
    scene['ledge'] = {'file': 'ledge.cmpr', 'rect': [0, 0, 128, 32], 'sha256': hashlib.sha256(data).hexdigest()}
    (args.output / 'scene.json').write_text(json.dumps(scene, indent=2) + '\n')
    print('Encoded four 1024px CMPR tiles (2 MiB total).')


if __name__ == '__main__':
    main()
