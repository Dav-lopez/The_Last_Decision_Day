#!/usr/bin/env python3
"""Offline geometry regression tests: no network, Blender or GPU needed."""
import math
import unittest
from facial_nose import build_nose_geometry, COLUMNS, ROWS, NOSE_TARGETS


class NoseGeometryTests(unittest.TestCase):
    def setUp(self):
        self.g = build_nose_geometry(42)

    def test_head_skinning_and_winding(self):
        g = self.g
        self.assertEqual(len(g["positions"]), ROWS * COLUMNS)
        self.assertEqual(len(g["indices"]), (ROWS - 1) * (COLUMNS - 1) * 6)
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in g["weights"]))
        for a, b, c in zip(*[iter(g["indices"])] * 3):
            pa, pb, pc = (g["positions"][v[0]] for v in (a, b, c))
            cross_z = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])
            self.assertGreater(cross_z, 0)

    def test_nose_is_symmetric_and_has_real_depth(self):
        g = self.g
        self.assertTrue(all(abs(x) <= .032 and 1.624 <= y <= 1.677 and .075 < z < .13
                            for x, y, z in g["positions"]))
        self.assertGreater(max(z for _, _, z in g["positions"]), .095)
        for row in range(ROWS):
            for col in range(COLUMNS):
                left = g["positions"][row * COLUMNS + col]
                right = g["positions"][row * COLUMNS + COLUMNS - col - 1]
                self.assertAlmostEqual(left[0], -right[0], places=8)
                self.assertAlmostEqual(left[2], right[2], places=8)

    def test_normals_are_finite_forward_and_unit_length(self):
        for n in self.g["normals"]:
            self.assertTrue(all(math.isfinite(v) for v in n))
            self.assertGreater(n[2], .2)
            self.assertAlmostEqual(math.sqrt(sum(v * v for v in n)), 1, places=6)

    def test_angry_brow_drives_independent_nasal_bridge_scrunch(self):
        g = self.g
        self.assertEqual(g["names"], NOSE_TARGETS)
        self.assertEqual(NOSE_TARGETS, ("browDownLeft", "browDownRight"))
        self.assertEqual(len(g["targets"]), 2)
        self.assertEqual(len(g["normal_targets"]), 2)
        for side, (positions, normals) in zip((-1, 1), zip(g["targets"], g["normal_targets"])):
            self.assertEqual(len(positions), ROWS * COLUMNS)
            self.assertEqual(len(normals), ROWS * COLUMNS)
            self.assertTrue(any(delta[2] > 0.001 for delta in positions))
            self.assertTrue(any(abs(delta[0]) > 0.0001 for delta in positions))
            self.assertTrue(any(math.hypot(*delta) > 0.005 for delta in normals))
            for (x, y, _), delta, normal_delta, rest_normal in zip(
                    g["positions"], positions, normals, g["normals"]):
                self.assertTrue(all(math.isfinite(v) for v in (*delta, *normal_delta)))
                self.assertLessEqual(abs(delta[0]), 0.001 + 1e-9)
                self.assertLessEqual(abs(delta[1]), 0.0006 + 1e-9)
                self.assertLessEqual(abs(delta[2]), 0.0026 + 1e-9)
                if x * side <= 0 or abs(x) >= 0.031 or y in (1.625, 1.676):
                    self.assertEqual(delta, (0, 0, 0))
                if x * side <= 0:
                    self.assertTrue(all(abs(v) < 0.001 for v in normal_delta))
                self.assertAlmostEqual(
                    math.sqrt(sum((a + b) ** 2 for a, b in zip(rest_normal, normal_delta))),
                    1, places=6)

    def test_nose_scrunch_is_mirrored_and_does_not_move_neutral_geometry(self):
        first = self.g
        self.assertEqual(first, build_nose_geometry(42))
        left, right = first["targets"]
        for row in range(ROWS):
            for col in range(COLUMNS):
                i = row * COLUMNS + col
                mirror = row * COLUMNS + (COLUMNS - 1 - col)
                dx, dy, dz = left[i]
                rx, ry, rz = right[mirror]
                self.assertAlmostEqual(dx, -rx, places=10)
                self.assertAlmostEqual(dy, ry, places=10)
                self.assertAlmostEqual(dz, rz, places=10)
        self.assertEqual(first["positions"], build_nose_geometry(42)["positions"])

    def test_reject_invalid_joint(self):
        for bad in (-1, 256, True, 1.2, "Head"):
            with self.assertRaises(ValueError):
                build_nose_geometry(bad)


if __name__ == "__main__":
    unittest.main()
