"""Roster-wide layout checks; these do not replace native gameplay tests."""
import json
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_character_worlds import WORLDS, WorldArt, Mansion, validate_art
from character_routes import apply_routes, unobstructed, ROOT
from build_grassland import Dat
from stage_texture import texture_scene


class CharacterRoutes(unittest.TestCase):
    def test_all_characters_have_clear_varied_targets_and_original_motion_data(self):
        for index, spec in enumerate(WORLDS):
            with self.subTest(character=spec[0]):
                art = (Mansion(spec,index) if spec[2]=='Lg' else WorldArt(spec,index)).build()
                apply_routes(art)
                validate_art(art)
                self.assertEqual(len(set(art.targets)),10)
                self.assertTrue(all(unobstructed(art,*p) for p in art.targets))
                self.assertGreaterEqual(len({n['setup'] for n in art.route_notes}),4)
                self.assertTrue(all(n['optionalShortcut'] for n in art.route_notes))
                self.assertGreater(art.movement_profile['ballisticJumpApex'],10)
                source='PlPp.dat' if spec[2]=='Ic' else 'Pl'+spec[2]+'.dat'
                self.assertEqual(art.movement_profile['source'],source)
                self.assertEqual(len(art.movement_profile['sourceSha256']),64)

    def test_every_painted_scene_is_native_encodable_and_matches_layout_coordinates(self):
        records=json.loads((ROOT/'art-direction.json').read_text())
        self.assertEqual({r['suffix'] for r in records},{s[2] for s in WORLDS if s[2]!='Lg'})
        for r in records:
            with self.subTest(character=r['character']):
                index,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]==r['suffix'])
                art=WorldArt(spec,index)
                self.assertEqual(list(getattr(art,'preview_bounds',(-360,210,360,-90))),r['bounds'])
                scene=json.loads((ROOT/r['suffix']/'scene.json').read_text())
                self.assertEqual(scene['bounds'],r.get('textureBounds',r['bounds']))
                d=Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))
                texture_scene(d,directory=ROOT/r['suffix'])
                # Leave room for the native stage groups, collision and joints.
                self.assertLess(len(d.finish()),3*1024*1024)


if __name__=='__main__':unittest.main()
