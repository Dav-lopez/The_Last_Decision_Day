#!/usr/bin/env python3
"""Offline geometry checks; no Blender, downloads or external packages."""
import unittest
from facial_mouth import MOUTH_TARGETS, build_mouth_geometry


class MouthGeometryTests(unittest.TestCase):
    def setUp(self):
        self.geo = build_mouth_geometry(42)

    def test_skinned_mesh_is_well_formed(self):
        g = self.geo
        self.assertEqual(len(g["positions"]), 30)
        self.assertEqual(len(g["indices"]), 96)
        self.assertTrue(all(0 <= index[0] < 30 for index in g["indices"]))
        self.assertTrue(all(j == (42, 0, 0, 0) for j in g["joints"]))
        self.assertTrue(all(sum(w) == 1 for w in g["weights"]))
        self.assertEqual(len(g["names"]), len(g["targets"]))
        self.assertTrue(all(len(t) == 30 for t in g["targets"]))
        self.assertEqual(len(set(g["names"])), len(g["names"]))

    def test_lips_follow_pinned_face_contour(self):
        g = self.geo
        front_depths = [point[2] for point in g["positions"]]
        # Regression: a previous 0.124..0.130 Z placement floated well
        # ahead of the measured 0.07..0.095 Z source face surface.
        self.assertGreater(min(front_depths), 0.08)
        self.assertLess(max(front_depths), 0.104)
        self.assertGreater(front_depths[2], front_depths[0])
        self.assertGreater(front_depths[7], front_depths[2])

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
            self.assertTrue(all(d == (0.0, 0.0, 0.0) for d in deltas[:15]))
            self.assertTrue(all(d[1] < 0 for d in deltas[15:]))


    def test_curved_ridges_have_independent_normalized_surface_normals(self):
        import math
        g = self.geo
        self.assertGreater(g["positions"][7][2], g["positions"][2][2])
        self.assertGreater(g["positions"][22][2], g["positions"][17][2])
        self.assertEqual(len(g["normals"]), 30)
        self.assertTrue(all(math.isfinite(c) for n in g["normals"] for c in n))
        for n in g["normals"]:
            self.assertAlmostEqual(sum(c*c for c in n), 1.0, places=8)
            self.assertGreater(n[2], 0.3)
        for i in range(0, len(g["indices"]), 3):
            vertices = [g["indices"][i+j][0] for j in range(3)]
            self.assertEqual(len({v // 15 for v in vertices}), 1, "lip gap must stay open")

    def test_expression_normal_deltas_are_finite_and_jaw_translation_is_rigid(self):
        import math
        g = self.geo
        self.assertEqual(len(g["normal_targets"]), len(MOUTH_TARGETS))
        for name, deltas in zip(g["names"], g["normal_targets"]):
            self.assertEqual(len(deltas), 30)
            self.assertTrue(all(math.isfinite(v) and abs(v) < 1.5
                                for row in deltas for v in row))
            if name in ("jawOpen", "mouthOpen"):
                self.assertTrue(all(abs(v) < 1e-8 for row in deltas for v in row))
            elif name.startswith(("mouthSmile", "mouthFrown")):
                self.assertTrue(any(abs(v) > 1e-4 for row in deltas for v in row))

    def test_invalid_joint_index_rejected(self):
        for index in (-1, 256, 1.5):
            with self.assertRaises(ValueError):
                build_mouth_geometry(index)


if __name__ == "__main__":
    unittest.main()
