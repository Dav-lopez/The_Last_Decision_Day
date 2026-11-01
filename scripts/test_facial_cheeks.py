#!/usr/bin/env python3
"""Offline cheek curvature, skinning and bilateral morph-normal regression tests."""
import math
import unittest
from facial_cheeks import CHEEK_TARGETS, SEGMENTS, VERTICES_PER_CHEEK, build_cheek_geometry


class CheekGeometryTests(unittest.TestCase):
    def setUp(self):
        self.geometry = build_cheek_geometry(42)

    def test_two_concentric_cheeks_are_head_skinned_and_triangulated(self):
        g = self.geometry
        count = 2 * VERTICES_PER_CHEEK
        self.assertEqual(count, 34)
        self.assertEqual(len(g["positions"]), count)
        self.assertEqual(len(g["indices"]), 2 * SEGMENTS * 3 * 3)
        self.assertTrue(all(0 <= index[0] < count for index in g["indices"]))
        self.assertTrue(all(joint == (42, 0, 0, 0) for joint in g["joints"]))
        self.assertTrue(all(weight == (1.0, 0.0, 0.0, 0.0) for weight in g["weights"]))
        self.assertEqual(g["names"], CHEEK_TARGETS)
        self.assertEqual(len(g["targets"]), len(g["normal_targets"]))
        self.assertEqual(len(g["targets"]), 2)
        self.assertTrue(all(len(target) == count for target in g["targets"] + g["normal_targets"]))

    def test_cheek_contour_is_convex_and_near_the_face(self):
        g = self.geometry
        for x, y, z in g["positions"]:
            self.assertTrue(0.03 <= abs(x) <= 0.09)
            self.assertTrue(1.63 < y < 1.67)
            self.assertTrue(0.075 < z < 0.09)
            self.assertTrue(all(math.isfinite(v) for v in (x, y, z)))
        for side in (0, 1):
            start = side * VERTICES_PER_CHEEK
            center = g["positions"][start][2]
            inner = [p[2] for p in g["positions"][start + 1:start + 1 + SEGMENTS]]
            outer = [p[2] for p in g["positions"][start + 1 + SEGMENTS:start + VERTICES_PER_CHEEK]]
            self.assertGreater(center, max(inner))
            self.assertGreater(min(inner), max(outer))

    def test_smooth_normals_are_unit_length_front_facing_and_not_flat(self):
        g = self.geometry
        self.assertEqual(len(g["normals"]), len(g["positions"]))
        for nx, ny, nz in g["normals"]:
            self.assertAlmostEqual(math.sqrt(nx * nx + ny * ny + nz * nz), 1.0, places=6)
            self.assertGreater(nz, 0.0)
        self.assertGreater(len({tuple(round(v, 3) for v in normal)
                                for normal in g["normals"][:VERTICES_PER_CHEEK]}), 4)

    def test_each_cheek_squint_changes_only_its_own_positions_and_normals(self):
        g = self.geometry
        for name, deltas, normals in zip(g["names"], g["targets"], g["normal_targets"]):
            side = -1 if name.endswith("Left") else 1
            changed_normals = 0
            for position, delta, normal_delta in zip(g["positions"], deltas, normals):
                if position[0] * side < 0:
                    self.assertEqual(delta, (0.0, 0.0, 0.0))
                    self.assertEqual(normal_delta, (0.0, 0.0, 0.0))
                else:
                    self.assertTrue(0 <= delta[1] < 0.008)
                    self.assertTrue(all(math.isfinite(v) for v in delta + normal_delta))
                    changed_normals += math.sqrt(sum(v * v for v in normal_delta)) > 1e-5
                    morphed = tuple(a + b for a, b in zip(
                        g["normals"][g["positions"].index(position)], normal_delta))
                    self.assertAlmostEqual(math.sqrt(sum(v * v for v in morphed)), 1.0, places=6)
            self.assertGreater(changed_normals, SEGMENTS,
                               "deformation must alter real cheek lighting normals")

    def test_invalid_head_joint_rejected(self):
        for invalid in (-1, 256, 3.4, "Head", True):
            with self.assertRaises(ValueError):
                build_cheek_geometry(invalid)


if __name__ == "__main__":
    unittest.main()
