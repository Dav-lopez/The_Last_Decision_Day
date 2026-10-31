#!/usr/bin/env python3
"""Offline geometry and bilateral expression regression tests for smile folds."""
import math
import unittest
from facial_smile_folds import SAMPLES, FOLD_TARGETS, build_smile_fold_geometry


class SmileFoldTests(unittest.TestCase):
    def setUp(self):
        self.g = build_smile_fold_geometry(42)

    def test_topology_skinning_and_front_winding(self):
        g = self.g
        self.assertEqual(len(g["positions"]), 2 * SAMPLES * 2)
        self.assertEqual(len(g["indices"]), 2 * (SAMPLES - 1) * 6)
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in g["weights"]))
        for i in range(0, len(g["indices"]), 3):
            a, b, c = (g["positions"][g["indices"][k][0]] for k in range(i, i + 3))
            self.assertGreater((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]), 0)
        for (x, y, z), normal in zip(g["positions"], g["normals"]):
            self.assertTrue(0.038 < abs(x) < 0.073)
            self.assertTrue(1.62 < y < 1.66)
            self.assertTrue(0.082 <= z < 0.085)
            self.assertEqual(normal, (0.0, 0.0, 1.0))

    def test_bilateral_morphs_are_isolated_and_nonzero(self):
        g = self.g
        self.assertEqual(g["names"], FOLD_TARGETS)
        self.assertEqual(len(g["targets"]), 4)
        for name, deltas in zip(g["names"], g["targets"]):
            side = -1 if name.endswith("Left") else 1
            self.assertEqual(len(deltas), len(g["positions"]))
            self.assertTrue(any(abs(d[1]) > 0.001 for d in deltas))
            for (x, _, _), (dx, dy, dz) in zip(g["positions"], deltas):
                self.assertTrue(all(math.isfinite(v) for v in (dx, dy, dz)))
                self.assertLessEqual(abs(dy), 0.004 + 1e-9)
                self.assertLessEqual(abs(dz), 0.003 + 1e-9)
                self.assertEqual(dx, 0)
                if x * side < 0:
                    self.assertEqual((dx, dy, dz), (0.0, 0.0, 0.0))
                elif name.startswith("mouthSmile"):
                    self.assertGreaterEqual(dy, 0)
                    self.assertGreaterEqual(dz, 0)
                else:
                    self.assertLessEqual(dy, 0)
                    self.assertLessEqual(dz, 0)

    def test_deterministic_and_invalid_joint_rejected(self):
        self.assertEqual(self.g, build_smile_fold_geometry(42))
        for bad in (-1, 256, True, 1.4, "Head", None):
            with self.assertRaises(ValueError):
                build_smile_fold_geometry(bad)


if __name__ == "__main__":
    unittest.main()
