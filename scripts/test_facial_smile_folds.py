#!/usr/bin/env python3
"""Offline topology, shading and bilateral expression regressions for smile folds."""
import math
import unittest
from facial_smile_folds import SAMPLES, RAILS, FOLD_TARGETS, build_smile_fold_geometry


class SmileFoldTests(unittest.TestCase):
    def setUp(self):
        self.g = build_smile_fold_geometry(42)

    def test_sloped_topology_head_skinning_and_front_winding(self):
        g = self.g
        self.assertEqual(len(g["positions"]), 2 * SAMPLES * RAILS)
        self.assertEqual(len(g["indices"]), 2 * (SAMPLES - 1) * (RAILS - 1) * 6)
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in g["weights"]))
        for i in range(0, len(g["indices"]), 3):
            a, b, c = (g["positions"][g["indices"][k][0]] for k in range(i, i + 3))
            self.assertGreater((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]), 0)
        for x, y, z in g["positions"]:
            self.assertTrue(0.038 < abs(x) < 0.073)
            self.assertTrue(1.62 < y < 1.66)
            self.assertTrue(0.082 <= z < 0.087)
        for start in (0, SAMPLES * RAILS):
            for i in range(1, SAMPLES - 1):
                low, ridge = g["positions"][start + i * RAILS:start + (i + 1) * RAILS]
                self.assertGreater(ridge[2], low[2])

    def test_smooth_normals_are_unit_length_and_have_real_side_relief(self):
        normals = self.g["normals"]
        self.assertEqual(len(normals), len(self.g["positions"]))
        self.assertTrue(any(abs(n[1]) > .1 for n in normals))
        for normal in normals:
            self.assertTrue(all(math.isfinite(v) for v in normal))
            self.assertGreater(normal[2], 0)
            self.assertAlmostEqual(math.sqrt(sum(v * v for v in normal)), 1, places=6)

    def test_bilateral_morphs_change_shading_without_moving_other_side(self):
        g = self.g
        self.assertEqual(g["names"], FOLD_TARGETS)
        self.assertEqual(len(g["targets"]), 4)
        self.assertEqual(len(g["normal_targets"]), 4)
        for name, deltas, normal_deltas in zip(g["names"], g["targets"], g["normal_targets"]):
            side = -1 if name.endswith("Left") else 1
            self.assertEqual(len(deltas), len(g["positions"]))
            self.assertEqual(len(normal_deltas), len(g["positions"]))
            self.assertTrue(any(abs(d[1]) > .001 for d in deltas))
            self.assertTrue(any(math.hypot(*n) > .005 for n in normal_deltas))
            for (x, _, _), (dx, dy, dz), delta_n, neutral_n in zip(
                    g["positions"], deltas, normal_deltas, g["normals"]):
                self.assertTrue(all(math.isfinite(v) for v in (dx, dy, dz, *delta_n)))
                self.assertLessEqual(abs(dy), .004 + 1e-9)
                self.assertLessEqual(abs(dz), .0037 + 1e-9)
                self.assertEqual(dx, 0)
                if x * side < 0:
                    self.assertEqual((dx, dy, dz), (0, 0, 0))
                    self.assertTrue(all(abs(v) < 1e-9 for v in delta_n))
                elif name.startswith("mouthSmile"):
                    self.assertGreaterEqual(dy, 0)
                    self.assertGreaterEqual(dz, 0)
                else:
                    self.assertLessEqual(dy, 0)
                    self.assertLessEqual(dz, 0)
                morphed_n = [a + b for a, b in zip(neutral_n, delta_n)]
                self.assertAlmostEqual(math.sqrt(sum(v * v for v in morphed_n)), 1, places=6)

    def test_deterministic_and_invalid_joint_rejected(self):
        self.assertEqual(self.g, build_smile_fold_geometry(42))
        for bad in (-1, 256, True, 1.4, "Head", None):
            with self.assertRaises(ValueError):
                build_smile_fold_geometry(bad)


if __name__ == "__main__":
    unittest.main()
