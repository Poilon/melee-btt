"""Native texture descriptors and GameCube block order, without a game ISO."""
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_grassland import Dat
from stage_texture import texture_scene


def archive():
    return Dat(struct.pack('>8I', 96, 64, 0, 0, 0, 0, 0, 0) + bytes(64))


class StageTexture(unittest.TestCase):
    def test_rgba8_preserves_transparency_and_separates_ar_gb_per_tile(self):
        from PIL import Image
        from encode_doc_chemicals import rgba8
        image=Image.new('RGBA',(8,4),(11,22,33,44))
        image.paste((55,66,77,0),(4,0,8,4))
        data=rgba8(image)
        self.assertEqual(data,bytes([44,11])*16+bytes([22,33])*16+
                         bytes([0,55])*16+bytes([66,77])*16)

    def test_native_scene_and_ledges_use_separate_draws(self):
        d = archive()
        first = texture_scene(d, [(160, 24, 30, 4), (-19, 432, 38, 4)])
        d = Dat(d.finish())
        dims, commands = [], []
        while first:
            m, p = d.u(first + 8), d.u(first + 12)
            self.assertEqual(d.u(m + 4), 0x11)
            pe=d.u(m+20)
            self.assertEqual(d.data[pe],0x19)  # depth test, no depth writes
            tex = d.u(m + 8)
            self.assertEqual(d.u(tex + 0x40), 0x50010)
            im = d.u(tex + 0x4c)
            w, h, fmt = struct.unpack_from('>HHI', d.data, im + 4)
            self.assertEqual(fmt, 14)
            self.assertEqual(d.u(im) % 32, 0)
            dims.append((w, h))
            dl = d.u(p + 16)
            opcode, count = struct.unpack_from('>BH', d.data, dl)
            self.assertEqual(opcode, 0x90)
            commands.append(count)
            if count == 12:
                # The top of each carved ledge exactly follows its collision.
                verts = [struct.unpack_from('>5f', d.data, dl + 3 + i * 20) for i in range(count)]
                self.assertEqual(verts[2], (190, 24, 0, 1, 0))
                self.assertEqual(verts[8], (19, 432, 0, 1, 0))
            else:
                verts=[struct.unpack_from('>5f',d.data,dl+3+i*20) for i in range(count)]
                self.assertTrue(all(v[2]==0 for v in verts))
            first = d.u(first + 4)
        self.assertEqual(dims, [(1024, 1024)] * 4 + [(128, 32)])
        self.assertEqual(commands, [6, 6, 6, 6, 12])

    def test_cmpr_subblocks_are_big_endian_in_gx_order(self):
        from PIL import Image
        from encode_stage_art import encode_cmpr
        image = Image.new('RGB', (8, 8))
        for color, rect in [('#ff0000', (0, 0, 4, 4)), ('#00ff00', (4, 0, 8, 4)),
                            ('#0000ff', (0, 4, 4, 8)), ('#ffffff', (4, 4, 8, 8))]:
            image.paste(color, rect)
        encoded = encode_cmpr(image)
        self.assertEqual(len(encoded), 32)
        for i, expected in enumerate((0xf800, 0x07e0, 0x001f, 0xffff)):
            self.assertEqual(struct.unpack_from('>HH', encoded, i * 8), (expected, expected))
            self.assertEqual(encoded[i * 8 + 4:i * 8 + 8], bytes(4))


if __name__ == '__main__':
    unittest.main()
