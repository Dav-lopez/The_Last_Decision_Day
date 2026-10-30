#!/usr/bin/env python3
"""Offline, deterministic, bounded hair detail geometry tests."""
import math
import unittest
from hair_detail import build_hair_detail


def sample(triangles=180):
    positions, normals, indices, joints, weights = [], [], [], [], []
    for i in range(triangles):
        x = i * .02
        base = len(positions)
        positions += [(x, 1.7, 0), (x+.012, 1.7, 0), (x, 1.72, 0)]
        normals += [(0, 0, 1)] * 3
        indices += [base, base+1, base+2]
        joints += [(4, 0, 0, 0)] * 3
        weights += [(1., 0., 0., 0.)] * 3
    return positions, normals, indices, joints, weights


class HairDetailTests(unittest.TestCase):
    def test_nonflat_surface_and_triangle_winding(self):
        g = build_hair_detail(*sample(4))
        self.assertIsNotNone(g)
        self.assertEqual(len(g['positions']), 24)
        self.assertEqual(len(g['indices']), 4 * 4 * 3)
        self.assertGreater(max(p[2] for p in g['positions']) - min(p[2] for p in g['positions']), .001)
        for a, b, c in zip(*[iter(g['indices'])]*3):
            p, q, r = (g['positions'][v[0]] for v in (a, b, c))
            self.assertGreater((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]), 0)

    def test_deterministic_bounded_output(self):
        args = sample(500)
        a = build_hair_detail(*args)
        self.assertEqual(a, build_hair_detail(*args))
        self.assertLessEqual(len(a['positions']), 112*6)
        self.assertLessEqual(len(a['indices']), 112*12)
        self.assertTrue(all(math.isclose(math.sqrt(sum(n*n for n in normal)), 1) for normal in a['normals']))

    def test_skinning_preserves_joint_influence(self):
        args = list(sample(1))
        args[3] = [(5, 6, 0, 0), (5, 6, 0, 0), (6, 5, 0, 0)]
        args[4] = [(.75, .25, 0, 0), (.75, .25, 0, 0), (.8, .2, 0, 0)]
        g = build_hair_detail(*args)
        for j, w in zip(g['joints'], g['weights']):
            self.assertEqual(set(j[:2]), {5, 6})
            self.assertAlmostEqual(sum(w), 1)
            self.assertTrue(all(0 <= x <= 1 for x in w))

    def test_degenerate_mesh_does_not_create_artifacts(self):
        args = list(sample(1))
        args[0] = [(0, 0, 0)] * 3
        self.assertIsNone(build_hair_detail(*args))
        self.assertIsNone(build_hair_detail([], [], [], [], []))

    def test_invalid_inputs_fail_closed(self):
        for bad in (0, 513, 2.5, True):
            with self.assertRaises(ValueError):
                build_hair_detail(*sample(1), max_strands=bad)
        args = list(sample(1))
        args[2] = [0, 1, 999]
        with self.assertRaises(ValueError):
            build_hair_detail(*args)
        args = list(sample(1))
        args[4][0] = (float('nan'), 0, 0, 0)
        with self.assertRaises(ValueError):
            build_hair_detail(*args)


if __name__ == '__main__':
    unittest.main()
