import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from background_textures import install, PACK
from play_settings import read_ini


class BackgroundTextures(unittest.TestCase):
    def test_all_painted_worlds_have_valid_matching_tile_replacements(self):
        from export_background_textures import texture_hash
        self.assertEqual(texture_hash(b''), 0xef46db3751d8e999)
        rows = json.loads((PACK / 'manifest.json').read_text())['textures']
        expected = []
        for folder in (ROOT / 'assets/custom-stages/modular').iterdir():
            if not (folder / 'background.png').exists():
                continue
            scene = json.loads((folder / 'scene.json').read_text())
            for tile in scene['tiles']:
                _, _, w, h = tile['rect']
                name = f'tex1_{w}x{h}_{texture_hash((folder / tile["file"]).read_bytes()):016x}_14.png'
                row = next(r for r in rows if r['stage'] == folder.name and r['file'] == name)
                self.assertEqual(hashlib.sha256((PACK / name).read_bytes()).hexdigest(), row['sha256'])
                self.assertGreaterEqual(row['size'][0], w)
                self.assertEqual(row['size'][0] / w, row['size'][1] / h)
                expected.append((folder.name, name))
        self.assertEqual(sorted(expected), sorted((r['stage'], r['file']) for r in rows))
        self.assertEqual(len({r['stage'] for r in rows}), 25)

    def test_install_is_isolated_preserves_other_settings_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / 'User'
            profile.mkdir()
            with self.assertRaises(ValueError):
                install(profile)
            (profile / '.ttrc-custom-stage').write_text('character-worlds')
            (profile / 'Config').mkdir()
            config = profile / 'Config/GFX.ini'
            config.write_text('[Settings]\nEFBScale = 3\n[Hacks]\nEFBAccessEnable = True\n')
            other = profile / 'Load/Textures/GALE01/Other'
            other.mkdir(parents=True)
            (other / 'keep.png').write_bytes(b'untouched')
            install(profile)
            settings = read_ini(config)
            self.assertEqual(settings['Settings']['HiresTextures'], 'True')
            self.assertEqual(settings['Settings']['CacheHiresTextures'], 'False')
            self.assertEqual(settings['Settings']['EFBScale'], '3')
            self.assertEqual(settings['Hacks']['EFBAccessEnable'], 'True')
            self.assertEqual((other / 'keep.png').read_bytes(), b'untouched')
            files = list((other.parent / 'TTRC-Backgrounds').glob('*.png'))
            before = {f.name: f.stat().st_mtime_ns for f in files}
            install(profile)
            self.assertEqual(before, {f.name: f.stat().st_mtime_ns for f in files})

    def test_damaged_pack_does_not_enable_it_or_touch_existing_textures(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / 'User'
            profile.mkdir()
            (profile / '.ttrc-custom-stage').touch()
            pack = Path(tmp) / 'pack'
            pack.mkdir()
            name = 'tex1_1024x1024_0123456789abcdef_14.png'
            (pack / name).write_bytes(b'damaged')
            (pack / 'manifest.json').write_text(json.dumps(dict(version=1, textures=[dict(file=name, sha256='wrong')])))
            with self.assertRaises(ValueError):
                install(profile, pack)
            self.assertFalse((profile / 'Config/GFX.ini').exists())
            self.assertFalse((profile / 'Load').exists())
