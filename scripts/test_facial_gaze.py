#!/usr/bin/env python3
"""Offline tests for bilateral eye gaze geometry; no downloads needed."""
import math
import unittest
from facial_gaze import GAZE_TARGETS, gaze_delta


class EyeGazeTests(unittest.TestCase):
    def test_all_gaze_targets_are_bilateral_and_bounded(self):
        for name in GAZE_TARGETS:
            side = -1 if name.endswith("Left") else 1
            for x in (-0.05, 0.05):
                delta = gaze_delta(name, x, 1.70, 0.09, 1.70, 0.04)
                if x * side < 0:
                    self.assertEqual(delta, (0.0, 0.0, 0.0))
                else:
                    self.assertTrue(all(math.isfinite(v) for v in delta))
                    axis = 0 if "LookLeft" in name or "LookRight" in name else 1
                    self.assertGreater(abs(delta[axis]), 0.001)
                    self.assertLess(math.hypot(*delta), 0.005)

    def test_up_and_down_are_opposing_and_contour_stays_near_socket(self):
        for side in ("Left", "Right"):
            x = -0.05 if side == "Left" else 0.05
            up = gaze_delta("eyeLookUp" + side, x, 1.70, 0.09, 1.70, 0.04)
            down = gaze_delta("eyeLookDown" + side, x, 1.70, 0.09, 1.70, 0.04)
            self.assertAlmostEqual(up[1], -down[1])
            self.assertGreater(up[1], 0)
            self.assertLess(down[1], 0)
            edge = gaze_delta("eyeLookDown" + side, x, 1.74, 0.09, 1.70, 0.04)
            self.assertLess(abs(edge[1]), abs(down[1]))

    def test_left_and_right_are_opposing_and_contour_stays_near_socket(self):
        for side in ("Left", "Right"):
            x = -0.052 if side == "Left" else 0.052
            left = gaze_delta("eyeLookLeft" + side, x, 1.686, 0.096, 1.686, 0.009)
            right = gaze_delta("eyeLookRight" + side, x, 1.686, 0.096, 1.686, 0.009)
            self.assertAlmostEqual(left[0], -right[0])
            self.assertLess(left[0], 0)
            self.assertGreater(right[0], 0)
            self.assertEqual(left[1], 0)
            edge = gaze_delta("eyeLookLeft" + side, x + 0.021, 1.686, 0.096, 1.686, 0.009)
            self.assertLess(abs(edge[0]), abs(left[0]))

    def test_reject_invalid_target_and_bad_geometry(self):
        with self.assertRaises(ValueError):
            gaze_delta("eyeBlinkLeft", -0.05, 1.7, 0.09, 1.7, 0.04)
        for bad in (0, -1, math.nan, math.inf):
            with self.assertRaises(ValueError):
                gaze_delta("eyeLookDownLeft", -0.05, 1.7, 0.09, 1.7, bad)


if __name__ == "__main__":
    unittest.main()
