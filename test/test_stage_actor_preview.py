"""Regression coverage for original Ice Mountain actors in editor previews."""
import math
from pathlib import Path
import struct
import sys
import unittest
from unittest.mock import patch
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from export_editor_actors import envelope_matrix,joint_parts,shade_preview
from build_grassland import Dat


def archive():
    d=Dat(struct.pack('>8I',544,512,0,0,0,0,0,0)+bytes(512))
    return d


class ActorPreview(unittest.TestCase):
    def test_rigid_skeleton_vertex_uses_bone_pose_without_inverse_bind(self):
        d=archive();struct.pack_into('>I',d.data,20,2)
        struct.pack_into('>I',d.data,100,120)
        struct.pack_into('>IfI',d.data,120,200,1.,0)
        bone=np.eye(4);bone[0,3]=10
        inv=np.eye(4);inv[0,3]=-8
        np.testing.assert_allclose(envelope_matrix(d,100,0,16,{200:bone},{200:inv})@np.array([1,0,0,1]),[11,0,0,1])
        # Non-skeleton-root draw nodes retain the inverse-bind path.
        struct.pack_into('>I',d.data,20,0)
        np.testing.assert_allclose(envelope_matrix(d,100,0,16,{200:bone},{200:inv})@np.array([1,0,0,1]),[3,0,0,1])

    def test_blended_vertices_keep_both_inverse_bind_matrices(self):
        d=archive();struct.pack_into('>I',d.data,20,2)
        struct.pack_into('>I',d.data,100,120)
        struct.pack_into('>IfIfI',d.data,120,200,.25,220,.75,0)
        a=np.eye(4);a[0,3]=10;b=np.eye(4);b[0,3]=20
        inv=np.eye(4);inv[0,3]=-8
        np.testing.assert_allclose(envelope_matrix(d,100,0,16,{200:a,220:b},{200:inv,220:inv})@np.array([1,0,0,1]),[10.5,0,0,1])

    def test_shared_strip_corners_are_transformed_exactly_once(self):
        d=archive();struct.pack_into('>I',d.data,32,100)
        struct.pack_into('>9f',d.data,36,0,0,0,1,1,1,0,0,0)
        struct.pack_into('>I',d.data,112,140)
        a=[1.,0.,0.,1.,1.,1.,1.,0.,0.]
        b=[2.,0.,0.,1.,1.,1.,1.,0.,0.]
        c=[1.,1.,0.,1.,1.,1.,1.,0.,0.]
        # Triangle strips reuse their original vertex rows.
        with patch('export_editor_actors.vertices',return_value=[a,b,c,b,c,a]):
            model=joint_parts(d,16)
        rows=model[0]['vertices']
        self.assertEqual(len({id(v) for v in rows}),6)
        shade_preview(model,math.pi/2)
        for i,j in [(0,5),(1,3),(2,4)]:np.testing.assert_allclose(rows[i],rows[j])
        np.testing.assert_allclose(rows[0][:3],[0,0,-1],atol=1e-12)
        self.assertEqual(a[0],1.)


if __name__=='__main__':unittest.main()
