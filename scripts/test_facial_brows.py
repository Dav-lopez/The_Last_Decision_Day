#!/usr/bin/env python3
"""Regression tests for skinned bilateral brow fibres and morph isolation."""
import math
import unittest
from facial_brows import BROW_TARGETS, ROWS, STROKES_PER_ROW, build_brow_geometry


class BrowGeometryTests(unittest.TestCase):
    def setUp(self):
        self.geo = build_brow_geometry(42)

    def test_bounded_head_skinned_triangles_with_forward_winding(self):
        g = self.geo
        count = 2 * ROWS * STROKES_PER_ROW * 3
        self.assertEqual(len(g["positions"]), count)
        self.assertEqual(len(g["indices"]), count)
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in g["weights"]))
        for i in range(0, count, 3):
            a, b, c = (g["positions"][g["indices"][k][0]] for k in range(i, i + 3))
            self.assertGreater((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]), 0)
        for x, y, z in g["positions"]:
            self.assertTrue(0.025 < abs(x) < 0.085)
            self.assertTrue(1.705 < y < 1.725)
            self.assertTrue(0.09 < z < 0.098)

    def test_brow_morphs_are_nonzero_bounded_and_bilateral(self):
        g = self.geo
        self.assertEqual(g["names"], BROW_TARGETS)
        for name, target in zip(g["names"], g["targets"]):
            self.assertEqual(len(target), len(g["positions"]))
            self.assertTrue(any(abs(d[1]) > 0.0001 for d in target))
            for (x, _, _), (dx, dy, dz) in zip(g["positions"], target):
                self.assertTrue(all(math.isfinite(v) for v in (dx, dy, dz)))
                self.assertLessEqual(abs(dy), 0.006 + 1e-9)
                self.assertEqual((dx, dz), (0, 0))
                if name.endswith("Left") and x > 0:
                    self.assertEqual(dy, 0)
                if name.endswith("Right") and x < 0:
                    self.assertEqual(dy, 0)
        self.assertTrue(all(d[1] >= 0 for d in g["targets"][0]))
        self.assertTrue(all(d[1] <= 0 for target in g["targets"][1:] for d in target))

    def test_geometry_is_deterministic_and_rejects_bad_joint(self):
        self.assertEqual(self.geo, build_brow_geometry(42))
        for bad in (-1, 256, True, 1.4, "Head", None):
            with self.assertRaises(ValueError):
                build_brow_geometry(bad)


if __name__ == "__main__":
    unittest.main()
