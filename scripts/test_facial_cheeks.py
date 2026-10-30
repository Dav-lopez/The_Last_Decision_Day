#!/usr/bin/env python3
"""Offline cheek geometry tests. No network or external packages."""
import math
import unittest
from facial_cheeks import CHEEK_TARGETS, build_cheek_geometry


class CheekGeometryTests(unittest.TestCase):
    def setUp(self):
        self.geometry = build_cheek_geometry(42)

    def test_two_skinned_cheek_patches_have_valid_triangles(self):
        g = self.geometry
        self.assertEqual(len(g["positions"]), 18)
        self.assertEqual(len(g["indices"]), 48)
        self.assertTrue(all(0 <= i[0] < 18 for i in g["indices"]))
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in g["weights"]))
        self.assertEqual(g["names"], CHEEK_TARGETS)
        self.assertEqual(len(g["targets"]), len(g["names"]))
        self.assertTrue(all(len(target) == 18 for target in g["targets"]))

    def test_cheeks_are_below_eyes_above_mouth_and_near_face(self):
        for x, y, z in self.geometry["positions"]:
            self.assertTrue(0.03 <= abs(x) <= 0.09)
            self.assertTrue(1.63 < y < 1.67)
            self.assertTrue(0.07 < z < 0.09)
            self.assertTrue(all(math.isfinite(v) for v in (x, y, z)))

    def test_each_squint_moves_only_its_own_cheek(self):
        for name, deltas in zip(self.geometry["names"], self.geometry["targets"]):
            side = -1 if name.endswith("Left") else 1
            self.assertTrue(any(abs(d[1]) > 0.003 for d in deltas))
            for position, delta in zip(self.geometry["positions"], deltas):
                if position[0] * side < 0:
                    self.assertEqual(delta, (0.0, 0.0, 0.0))
                else:
                    self.assertTrue(0 <= delta[1] < 0.01)

    def test_invalid_head_joint_rejected(self):
        for invalid in (-1, 256, 3.4, "Head"):
            with self.assertRaises(ValueError):
                build_cheek_geometry(invalid)


if __name__ == "__main__":
    unittest.main()
