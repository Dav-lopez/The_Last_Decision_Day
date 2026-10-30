#!/usr/bin/env python3
"""Offline eyelid geometry tests, including blink isolation and mesh winding."""
import math
import unittest
from facial_eyelids import BLINK_TARGETS, SAMPLES, build_eyelid_geometry


class EyelidGeometryTests(unittest.TestCase):
    def setUp(self):
        self.geo = build_eyelid_geometry(42)

    def test_two_eyes_are_skinned_and_have_front_facing_triangles(self):
        g = self.geo
        self.assertEqual(len(g["positions"]), 2 * (4 * SAMPLES + 12))
        self.assertEqual(len(g["indices"]), 2 * (2 * (SAMPLES - 1) * 6 + 4 * 3))
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in g["weights"]))
        for i in range(0, len(g["indices"]), 3):
            a, b, c = (g["positions"][g["indices"][k][0]] for k in range(i, i + 3))
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            self.assertGreater(cross, 0)

    def test_blink_targets_are_bilateral_nonempty_and_bounded(self):
        g = self.geo
        self.assertEqual(g["names"], BLINK_TARGETS)
        self.assertEqual(len(g["targets"]), 2)
        for name, deltas in zip(g["names"], g["targets"]):
            side = -1 if name.endswith("Left") else 1
            self.assertEqual(len(deltas), len(g["positions"]))
            self.assertTrue(any(abs(d[1]) > 0.009 for d in deltas))
            for (x, _y, _z), delta in zip(g["positions"], deltas):
                self.assertTrue(all(math.isfinite(v) for v in delta))
                self.assertLessEqual(abs(delta[1]), 0.012)
                if x * side < 0:
                    self.assertEqual(delta, (0.0, 0.0, 0.0))

    def test_eye_rims_stay_in_pinned_face_region(self):
        for x, y, z in self.geo["positions"]:
            self.assertTrue(0.025 < abs(x) < 0.085)
            self.assertTrue(1.67 < y < 1.705)
            self.assertTrue(0.09 <= z <= 0.095)

    def test_rejects_invalid_joint(self):
        for bad in (-1, 256, True, 3.5, "Head"):
            with self.assertRaises(ValueError):
                build_eyelid_geometry(bad)


if __name__ == "__main__":
    unittest.main()
