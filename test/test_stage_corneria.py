"""The BTT host imports retail actors, not authored aircraft flight/laser logic."""
import bisect
import struct
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_grassland import Dat,iso_table
import corneria_arwings as native
from adventure_mechanisms import configure
ROOT=Path(__file__).resolve().parents[1]
ISO=ROOT/'Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso'


def empty():return Dat(struct.pack('>8I',96,64,0,0,0,0,0,0)+bytes(64))


class Corneria(unittest.TestCase):
    def test_aircraft_have_no_authored_routes_or_shot_timers(self):
        for suffix in ('Fx','Fc'):
            art=SimpleNamespace(suffix=suffix,authored_surfaces=[],mechanisms=[{'obsolete':True}])
            configure(art)
            self.assertTrue(art.retail_corneria)
            self.assertEqual(art.mechanisms,[])

    def test_public_root_replacement_does_not_duplicate_itemdata(self):
        d=empty();native.add_root(d,'itemdata',8);native.add_root(d,'other',12)
        native.add_root(d,'itemdata',16);r=Dat(d.finish())
        self.assertEqual(struct.unpack_from('>I',r.header,12)[0],2)
        self.assertEqual(r.roots,{'itemdata':16,'other':12})

    @unittest.skipUnless(ISO.exists(),'Requires local retail disc')
    def test_original_animation_model_and_article_blocks_are_copied_unchanged(self):
        native.load(ISO);d=empty();groups=native.SOURCE.u(native.SOURCE.roots['map_head']+8)
        for i in (1,2,10):native.copy_record(d,groups+52*i,52)
        native.copy_block(d,native.SOURCE.roots['yakumono_param'])
        native.copy_block(d,native.SOURCE.u(native.SOURCE.roots['itemdata']))
        self.assertGreater(len(d.corneria_blocks),500)
        for source,dest in d.corneria_blocks.items():
            end=native.SOURCE.cuts[bisect.bisect_right(native.SOURCE.cuts,source)]
            raw=bytearray(native.SOURCE.data[source:end])
            for r in native.SOURCE.pointers:
                if source<=r<end:struct.pack_into('>I',raw,r-source,d.corneria_blocks[native.SOURCE.u(r)])
            self.assertEqual(d.data[dest:dest+len(raw)],raw)

    @unittest.skipUnless(ISO.exists(),'Requires local retail disc')
    def test_current_patch_preserves_retail_flight_except_host_adapters(self):
        from build_character_worlds import dol_sections,patch_callbacks
        with ISO.open('rb') as f:old=f.read(0x500000)
        new=patch_callbacks(old);_,sections=dol_sections(old)
        def off(address):return next(o+address-a for a,o,n in sections if a<=address<a+n)
        changed=[a for a in range(0x801dccfc,0x801e2fcc,4) if old[off(a):off(a)+4]!=new[off(a):off(a)+4]]
        self.assertEqual(len(changed),5)
        self.assertEqual([a for a in changed if 0x801df000<=a],[0x801df1a0,0x801df4fc,0x801df528])
        self.assertEqual(sum(0x801dd534<=a<0x801dd620 for a in changed),1)
        self.assertEqual(sum(0x801de024<=a<0x801de4bc for a in changed),1)
        # Both retired modules are no longer reachable through any custom stage.
        from build_character_worlds import WORLDS
        for _,_,suffix,address,_,_ in WORLDS:
            callback=struct.unpack_from('>I',new,off(address)+12)[0]
            self.assertNotEqual(callback,0x80221c14,suffix)


if __name__=='__main__':unittest.main()

class EditedCorneria(unittest.TestCase):
    @unittest.skipUnless(ISO.exists(),'Requires local retail disc')
    def test_added_bumper_bindings_follow_retail_islands(self):
        from test_stage_project import art,base
        from stage_project import apply
        from build_grassland import build_stage
        import copy
        native.load(ISO)
        _,_,entries=iso_table(ISO)
        _,_,off,size=next(row for row in entries if row[1]=='GrTFx.dat')
        with ISO.open('rb') as f:f.seek(off);raw=f.read(size)
        a=art('Fx');p=copy.deepcopy(base('Fx')['project'])
        p['additions']=[dict(kind='bumper',variant='red',name='Red Fox bumper',x=0,y=120,width=40,dx=40,dy=0,period=240,hold=0)]
        apply(a,p)
        from native_encounters import load as load_retail
        load_retail(ISO)
        data,_=build_stage(raw,a,a.targets,a.spawn,bounds=a.bounds)
        d=Dat(data);group=d.u(d.roots['map_head']+8)+104
        self.assertEqual(d.u(group+36),1)
        self.assertEqual(struct.unpack_from('>3h',d.data,d.u(group+32)),(9,2,11))
        self.assertEqual(d.u(d.roots['coll_data']+40),10)
        config=d.u(d.roots['yakumono_param'])
        self.assertEqual(d.u(config+8),0)
        params=d.u(config+4)
        self.assertEqual(struct.unpack_from('>4f',d.data,params+0x3c),(30.,30.,45.,60.))
        descriptor=d.u(d.roots['yakumono_param']+4)
        self.assertEqual(d.u(descriptor+4),10)
        a=art('Fc');data,_=build_stage(raw,a,a.targets,a.spawn,bounds=a.bounds)
        d=Dat(data);config=d.u(d.roots['yakumono_param'])
        self.assertEqual(d.u(config+8),1)
        params=d.u(config+4)
        self.assertEqual(struct.unpack_from('>4f',d.data,params+0x3c),(120.,180.,120.,180.))
        self.assertEqual(bytes(d.data[params+0x74:params+0x84]),bytes(native.SOURCE.data[native.SOURCE.roots['yakumono_param']+0x74:native.SOURCE.roots['yakumono_param']+0x84]))
