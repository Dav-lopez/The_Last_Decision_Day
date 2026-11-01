#!/usr/bin/env python3
"""Offline regression tests for the corneal shell's topology and morphs."""
import math
import unittest
from facial_cornea import (RINGS, SEGMENTS, TARGET_NAMES,
                           build_cornea_geometry)


class CorneaGeometryTests(unittest.TestCase):
    def setUp(self):
        self.g = build_cornea_geometry(42)

    def test_mesh_is_convex_front_facing_and_head_skinned(self):
        g = self.g
        self.assertEqual(len(g["positions"]), 2 * (1 + RINGS * SEGMENTS))
        self.assertEqual(len(g["indices"]), 2 * SEGMENTS * (1 + 2 * (RINGS - 1)) * 3)
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(w == (1, 0, 0, 0) for w in g["weights"]))
        self.assertGreater(max(z for _, _, z in g["positions"]), .096)
        self.assertTrue(all(.02 < abs(x) < .08 and 1.67 < y < 1.70 and .09 < z < .1
                            for x, y, z in g["positions"]))
        for i in range(0, len(g["indices"]), 3):
            a, b, c = (g["positions"][g["indices"][k][0]] for k in range(i, i + 3))
            cross = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
            self.assertGreater(cross, 0)

    def test_normals_are_smooth_finite_and_forward(self):
        for n in self.g["normals"]:
            self.assertTrue(all(math.isfinite(v) for v in n))
            self.assertGreater(n[2], 0.6)
            self.assertAlmostEqual(math.sqrt(sum(v*v for v in n)), 1, places=6)

    def test_bilateral_targets_only_move_their_eye(self):
        g = self.g
        self.assertEqual(g["names"], TARGET_NAMES)
        self.assertEqual(len(g["targets"]), len(TARGET_NAMES))
        for name, target in zip(g["names"], g["targets"]):
            side = -1 if name.endswith("Left") else 1
            self.assertEqual(len(target), len(g["positions"]))
            self.assertTrue(any(abs(v) > .0001 for row in target for v in row))
            for (x, y, _), (dx, dy, dz) in zip(g["positions"], target):
                self.assertTrue(all(math.isfinite(v) and abs(v) <= .01 for v in (dx, dy, dz)))
                if x * side < 0:
                    self.assertEqual((dx, dy, dz), (0, 0, 0))
                if "Blink" in name and x * side > 0:
                    self.assertLessEqual(abs((y + dy) - 1.686), abs(y - 1.686) + 1e-9)

    def test_horizontal_gaze_moves_cornea_with_eye_but_not_opposite_side(self):
        g = self.g
        for side in ("Left", "Right"):
            left = g["targets"][g["names"].index("eyeLookLeft" + side)]
            right = g["targets"][g["names"].index("eyeLookRight" + side)]
            owner = -1 if side == "Left" else 1
            center = next(i for i, (x, y, z) in enumerate(g["positions"])
                          if abs(x - owner * 0.052) < 1e-8 and abs(y - 1.686) < 1e-8)
            self.assertLess(left[center][0], 0)
            self.assertGreater(right[center][0], 0)
            self.assertAlmostEqual(left[center][0], -right[center][0])

    def test_blink_and_gaze_update_surface_normals_without_cross_eye_bleed(self):
        g = self.g
        self.assertEqual(len(g["normal_targets"]), len(TARGET_NAMES))
        for name, positions, normal_deltas in zip(g["names"], g["targets"], g["normal_targets"]):
            side = -1 if name.endswith("Left") else 1
            self.assertEqual(len(normal_deltas), len(g["positions"]))
            self.assertTrue(any(
                math.sqrt(sum(value * value for value in delta)) > .005
                for (x, _, _), delta in zip(g["positions"], normal_deltas) if x * side > 0
            ), name + " must change the lit surface, not just its positions")
            for (x, _, _), displacement, base, delta in zip(
                    g["positions"], positions, g["normals"], normal_deltas):
                self.assertTrue(all(math.isfinite(v) for v in delta))
                if x * side < 0:
                    self.assertEqual(displacement, (0.0, 0.0, 0.0))
                    self.assertEqual(delta, (0.0, 0.0, 0.0))
                normal = tuple(a + b for a, b in zip(base, delta))
                self.assertAlmostEqual(math.sqrt(sum(v * v for v in normal)), 1, places=6)
                self.assertGreater(normal[2], 0.1)

    def test_closed_eyelid_tilts_cornea_normals_with_compressed_geometry(self):
        g = self.g
        # Uppermost point of the outer ring of the left eye.
        vertex = 1 + (RINGS - 1) * SEGMENTS + SEGMENTS // 4
        neutral = g["normals"][vertex]
        blink = g["normal_targets"][g["names"].index("eyeBlinkLeft")][vertex]
        closed = tuple(a + b for a, b in zip(neutral, blink))
        self.assertLess(closed[2], neutral[2] - .1)
        self.assertAlmostEqual(math.sqrt(sum(v * v for v in closed)), 1, places=6)

    def test_reject_invalid_head_joint(self):
        for bad in (-1, 256, True, 2.4, "Head"):
            with self.assertRaises(ValueError):
                build_cornea_geometry(bad)


if __name__ == "__main__":
    unittest.main()
