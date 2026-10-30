#!/usr/bin/env python3
"""Offline geometry checks; no Blender, downloads or external packages."""
import unittest
from facial_mouth import MOUTH_TARGETS, build_mouth_geometry


class MouthGeometryTests(unittest.TestCase):
    def setUp(self):
        self.geo = build_mouth_geometry(42)

    def test_skinned_mesh_is_well_formed(self):
        g = self.geo
        self.assertEqual(len(g["positions"]), 10)
        self.assertEqual(len(g["indices"]), 24)
        self.assertTrue(all(0 <= index[0] < 10 for index in g["indices"]))
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(sum(w) == 1 for w in g["weights"]))
        self.assertEqual(len(g["names"]), len(g["targets"]))
        self.assertTrue(all(len(t) == 10 for t in g["targets"]))
        self.assertEqual(len(set(g["names"])), len(g["names"]))

    def test_smile_and_frown_are_side_specific(self):
        g = self.geo
        for name in ("mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight"):
            deltas = g["targets"][MOUTH_TARGETS.index(name)]
            self.assertTrue(any(any(abs(v) > 0 for v in d) for d in deltas))
            for (x, _, _), delta in zip(g["positions"], deltas):
                if (name.endswith("Left") and x >= 0) or (name.endswith("Right") and x <= 0):
                    self.assertEqual(delta, (0.0, 0.0, 0.0))

    def test_opening_mouth_moves_lower_lip_only(self):
        g = self.geo
        for name in ("jawOpen", "mouthOpen"):
            deltas = g["targets"][MOUTH_TARGETS.index(name)]
            self.assertTrue(all(d == (0.0, 0.0, 0.0) for d in deltas[:5]))
            self.assertTrue(all(d[1] < 0 for d in deltas[5:]))

    def test_invalid_joint_index_rejected(self):
        for index in (-1, 256, 1.5):
            with self.assertRaises(ValueError):
                build_mouth_geometry(index)


if __name__ == "__main__":
    unittest.main()
