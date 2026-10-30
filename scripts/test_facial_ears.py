#!/usr/bin/env python3
"""Offline outer-ear geometry regressions (standard library only)."""
import math
import unittest
from facial_ears import build_ear_geometry, SEGMENTS, RINGS, CENTER_Z


class EarGeometryTests(unittest.TestCase):
    def setUp(self):
        self.g = build_ear_geometry(42)
        self.per_ear = 1 + len(RINGS) * SEGMENTS

    def test_vertex_count_and_head_skinning(self):
        self.assertEqual(len(self.g["positions"]), 2 * self.per_ear)
        self.assertEqual(len(self.g["indices"]), 2 * SEGMENTS * (1 + 2 * (len(RINGS) - 1)) * 3)
        self.assertTrue(all(j == (42, 0, 0, 0) for j in self.g["joints"]))
        self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in self.g["weights"]))

    def test_bilateral_symmetry_and_face_bounds(self):
        left, right = self.g["positions"][:self.per_ear], self.g["positions"][self.per_ear:]
        for a, b in zip(left, right):
            self.assertAlmostEqual(a[0], -b[0], places=8)
            self.assertAlmostEqual(a[1], b[1], places=8)
            self.assertAlmostEqual(a[2], b[2], places=8)
        self.assertTrue(all(0.08 < abs(x) < 0.15 and 1.625 < y < 1.705 and 0 < z < 0.05
                            for x, y, z in self.g["positions"]))

    def test_helix_relief_is_not_flat(self):
        z = [p[2] for p in self.g["positions"]]
        self.assertGreater(max(z) - min(z), 0.014)
        self.assertGreater(z[1 + SEGMENTS], CENTER_Z)
        self.assertLess(z[1 + 2 * SEGMENTS], CENTER_Z)

    def test_front_facing_winding_and_smooth_normals(self):
        for a, b, c in zip(*[iter(self.g["indices"])] * 3):
            p, q, r = [self.g["positions"][v[0]] for v in (a, b, c)]
            cross_z = (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0])
            self.assertGreater(cross_z, 0)
        for n in self.g["normals"]:
            self.assertTrue(all(math.isfinite(v) for v in n))
            self.assertAlmostEqual(math.sqrt(sum(v*v for v in n)), 1.0, places=6)
            self.assertGreater(n[2], 0.15)

    def test_invalid_head_joint(self):
        for bad in (-1, 256, True, 1.25, "Head"):
            with self.assertRaises(ValueError):
                build_ear_geometry(bad)


if __name__ == "__main__":
    unittest.main()
