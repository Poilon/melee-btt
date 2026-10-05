"""Native collision encoding used by the authored courses (no ISO needed)."""
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_grassland import Art, Dat


def encode(art):
    # Minimal archive containing a collision root, with space for its header.
    body = bytes(64)
    tail = struct.pack('>2I', 4, 0) + b'coll_data\0'
    header = struct.pack('>8I', 32 + len(body) + len(tail), len(body), 0, 1, 0, 0, 0, 0)
    dat = Dat(header + body + tail)
    art.collisions(dat)
    dat = Dat(dat.finish())
    root = dat.roots['coll_data']
    vertices, count, lines, line_count = struct.unpack_from('>4I', dat.data, root)
    return ([struct.unpack_from('>2f', dat.data, vertices + i * 8) for i in range(count)],
            [struct.unpack_from('>6hHBB', dat.data, lines + i * 16) for i in range(line_count)],
            struct.unpack_from('>10h', dat.data, root + 16))


class StageCollisions(unittest.TestCase):
    def test_manor_furniture_and_storeys_have_no_blocking_undersides(self):
        from build_character_worlds import WORLDS, validate_art
        from character_mansion import Mansion
        art=Mansion(next(spec for spec in WORLDS if spec[4]=='mansion')).build()
        validate_art(art)
        vertices, lines, _=encode(art)
        for index in range(len(art.platforms)):
            left,top,width,_=art.platforms[index]
            matches=[line for line in lines if abs(vertices[line[0]][0]-left)<.001
                     and abs(vertices[line[0]][1]-top)<.001
                     and abs(vertices[line[1]][0]-(left+width))<.001
                     and abs(vertices[line[1]][1]-top)<.001]
            self.assertEqual(len(matches),1)
            self.assertEqual(matches[0][2:8],(-1,-1,-1,-1,1,1))
        # Two foundation halves border the basement gap; every floor remains soft.
        self.assertEqual(len(art.solids),2)
        self.assertEqual(len(art.platforms),26)
        self.assertEqual(len(art.ledge_platforms),15)
        self.assertEqual(len(lines),34)
        for l,r,y in art.mansion_gaps:
            self.assertFalse(any(line[6]==1 and min(vertices[line[0]][0],vertices[line[1]][0])<(l+r)/2<max(vertices[line[0]][0],vertices[line[1]][0])
                                 and abs(vertices[line[0]][1]-y)<.001 for line in lines))

    def test_mario_pipe_lower_collars_are_solid_but_cannot_be_grabbed(self):
        from build_character_worlds import WORLDS,WorldArt
        i,spec=next((i,s) for i,s in enumerate(WORLDS) if s[2]=='Mr')
        art=WorldArt(spec,i).build();vertices,lines,_=encode(art)
        contour=art.solid_contours[next(iter(art.no_lower_ledges))]
        top=max(y for x,y in contour);found=[]
        for line in lines:
            a,b=vertices[line[0]],vertices[line[1]]
            if line[6]==1 and any(abs(a[0]-x)<.001 and abs(a[1]-y)<.001 for x,y in contour):
                found.append(line)
                self.assertEqual(line[7],2 if abs(a[1]-top)<.001 else 0)
        self.assertEqual(len(found),3)

    def test_soft_platform_has_only_an_upward_floor(self):
        art = Art()
        art.platform_surface(160, 24, 30, 4)
        vertices, lines, groups = encode(art)
        self.assertEqual(vertices, [(160, 24), (190, 24)])
        self.assertEqual(lines, [(0, 1, -1, -1, -1, -1, 1, 1, 4)])
        self.assertEqual(groups, (0, 1, 1, 0, 1, 0, 1, 0, 0, 0))

    def test_mixed_surfaces_preserve_closed_solid_neighbours(self):
        art = Art()
        art.solid(-20, -10, 40, 10, 2)
        art.platform_surface(5, 24, 30, 4)
        vertices, lines, groups = encode(art)
        self.assertEqual(len(vertices), 6)
        self.assertEqual(groups, (0, 2, 2, 1, 3, 1, 4, 1, 0, 0))
        self.assertEqual(lines[1][2:8], (-1, -1, -1, -1, 1, 1))
        current = 0
        visited = []
        for _ in range(4):
            visited.append(current)
            following = lines[current][3]
            self.assertEqual(lines[following][2], current)
            self.assertEqual(lines[current][1], lines[following][0])
            current = following
        self.assertEqual(current, 0)
        self.assertEqual(set(visited), {0, 2, 3, 4})


if __name__ == '__main__':
    unittest.main()
