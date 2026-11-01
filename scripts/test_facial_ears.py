#!/usr/bin/env python3
"""Offline sculpted ear geometry regressions; no Blender or network."""
import math
import unittest
from facial_ears import build_ear_geometry, SEGMENTS, RINGS, CENTER_X, CENTER_Y, CENTER_Z


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

    def test_recessed_concha_and_sculpted_cartilage(self):
        positions = self.g["positions"]
        concha = positions[0][2]
        antihelix = positions[1 + 2 * SEGMENTS + SEGMENTS // 4][2]
        helix = positions[1 + 3 * SEGMENTS + SEGMENTS // 4][2]
        outer = positions[1 + 4 * SEGMENTS + SEGMENTS // 4][2]
        self.assertLess(concha, CENTER_Z)
        self.assertGreater(antihelix - concha, 0.012)
        self.assertGreater(helix - concha, 0.015)
        self.assertLess(outer, helix - 0.010)
        # The curved cartilage ridges are not constant-depth planar rings.
        for ring in (2, 3):
            depths = [p[2] for p in positions[1 + ring * SEGMENTS:1 + (ring + 1) * SEGMENTS]]
            self.assertGreater(max(depths) - min(depths), 0.002)

    def test_lobe_tapers_relative_to_upper_ear(self):
        ring = 4
        upper = self.g["positions"][1 + ring * SEGMENTS + SEGMENTS // 8]
        lower = self.g["positions"][1 + ring * SEGMENTS + 7 * SEGMENTS // 8]
        self.assertAlmostEqual(upper[1] - CENTER_Y, CENTER_Y - lower[1], places=8)
        self.assertGreater(abs(upper[0] + CENTER_X), abs(lower[0] + CENTER_X) * 1.2)

    def test_front_facing_winding_and_smooth_normals(self):
        for a, b, c in zip(*[iter(self.g["indices"])] * 3):
            p, q, r = [self.g["positions"][v[0]] for v in (a, b, c)]
            cross_z = (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0])
            self.assertGreater(cross_z, 0)
        for n in self.g["normals"]:
            self.assertTrue(all(math.isfinite(v) for v in n))
            self.assertAlmostEqual(math.sqrt(sum(v*v for v in n)), 1.0, places=6)
            self.assertGreater(n[2], 0.15)
        left, right = self.g["normals"][:self.per_ear], self.g["normals"][self.per_ear:]
        for a, b in zip(left, right):
            self.assertAlmostEqual(a[0], -b[0], places=8)
            self.assertAlmostEqual(a[1], b[1], places=8)
            self.assertAlmostEqual(a[2], b[2], places=8)

    def test_invalid_head_joint(self):
        for bad in (-1, 256, True, 1.25, "Head"):
            with self.assertRaises(ValueError):
                build_ear_geometry(bad)


if __name__ == "__main__":
    unittest.main()
