"""Install lossless scenery only in TTRC's isolated custom-stage profile."""
import hashlib
import json
from pathlib import Path
import re
import shutil
from play_settings import read_ini, write_ini

PACK = Path(__file__).resolve().parents[1] / 'assets/custom-stages/background-textures'


def install(profile, pack=PACK):
    if not (profile / '.ttrc-custom-stage').is_file():
        raise ValueError('Background textures require an isolated custom-stage profile')
    manifest = json.loads((pack / 'manifest.json').read_text())
    if manifest.get('version') != 1:
        raise ValueError('Unsupported background texture pack')
    records = manifest['textures']
    # Validate the entire pack before changing the profile.
    for row in records:
        if not re.fullmatch(r'tex1_\d+x\d+_[0-9a-f]{16}_14\.png', row['file']):
            raise ValueError('Invalid background texture filename')
        if hashlib.sha256((pack / row['file']).read_bytes()).hexdigest() != row['sha256']:
            raise ValueError('Damaged background texture: ' + row['file'])
    destination = profile / 'Load/Textures/GALE01/TTRC-Backgrounds'
    destination.mkdir(parents=True, exist_ok=True)
    names = {row['file'] for row in records}
    for row in records:
        target = destination / row['file']
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == row['sha256']:
            continue
        shutil.copyfile(pack / row['file'], target)
    # This directory is owned by this installer; unrelated texture packs stay.
    for old in destination.glob('tex1_*.png'):
        if old.name not in names:
            old.unlink()
    config_path = profile / 'Config/GFX.ini'
    graphics = read_ini(config_path)
    if not graphics.has_section('Settings'):
        graphics['Settings'] = {}
    graphics['Settings']['HiresTextures'] = 'True'
    # Load the selected world's textures on demand, not all 25 at startup.
    graphics['Settings']['CacheHiresTextures'] = 'False'
    write_ini(config_path, graphics)
