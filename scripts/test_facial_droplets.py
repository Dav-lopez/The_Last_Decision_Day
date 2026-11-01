#!/usr/bin/env python3
"""Offline geometry tests; no downloads or third-party packages."""
import math
import unittest
from facial_droplets import build_droplet_geometry


class DropletGeometryTests(unittest.TestCase):
    def test_valid_head_skinned_geometry_for_both_effects_and_sides(self):
        for kind in ('tear', 'sweat'):
            for side in ('Left', 'Right'):
                with self.subTest(kind=kind, side=side):
                    g = build_droplet_geometry(42, kind, side)
                    self.assertEqual(len(g['positions']), 9)
                    self.assertEqual(len(g['indices']), 24)
                    self.assertTrue(all(0 <= i[0] < 9 for i in g['indices']))
                    self.assertTrue(all(j == (42, 0, 0, 0) for j in g['joints']))
                    self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in g['weights']))
                    self.assertEqual(g['names'], (kind + 'Track' + side,))
                    self.assertEqual(len(g['targets'][0]), 9)
                    self.assertTrue(all(math.isfinite(v) for p in g['positions'] for v in p))
                    self.assertTrue(all((x < 0 if side == 'Left' else x > 0) for x, _, _ in g['positions']))
                    self.assertTrue(all(1.61 < y < 1.73 and .07 < z < .10 for _, y, z in g['positions']))
                    self.assertTrue(all(d[1] < -.02 for d in g['targets'][0]))
                    self.assertTrue(all(d[0] * (-1 if side == 'Left' else 1) > 0
                                        and d[2] < 0 for d in g['targets'][0]))
                    for i in range(0, len(g['indices']), 3):
                        a, b, c = (g['positions'][g['indices'][j][0]] for j in range(i, i+3))
                        cross_z = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
                        self.assertGreater(cross_z, 0)


    def test_convex_beads_have_curved_unit_normals_and_no_backfaces(self):
        for kind in ('tear', 'sweat'):
            for side in ('Left', 'Right'):
                g = build_droplet_geometry(42, kind, side)
                self.assertGreater(g['positions'][0][2] - g['positions'][1][2], .002)
                self.assertTrue(any(abs(nx) > .05 for nx, _, _ in g['normals'][1:]))
                self.assertTrue(any(abs(ny) > .05 for _, ny, _ in g['normals'][1:]))
                for normal in g['normals']:
                    self.assertTrue(all(math.isfinite(v) for v in normal))
                    self.assertAlmostEqual(math.sqrt(sum(v*v for v in normal)), 1, places=6)
                    self.assertGreater(normal[2], .1)

    def test_track_offsets_are_mirrored_and_preserve_bead_shape(self):
        for kind in ('tear', 'sweat'):
            left = build_droplet_geometry(42, kind, 'Left')
            right = build_droplet_geometry(42, kind, 'Right')
            for a, b in zip(left['targets'][0], right['targets'][0]):
                self.assertAlmostEqual(a[0], -b[0])
                self.assertAlmostEqual(a[1], b[1])
                self.assertAlmostEqual(a[2], b[2])
            for delta in (left['targets'][0], right['targets'][0]):
                self.assertTrue(all(v == delta[0] for v in delta))

    def test_invalid_arguments_rejected(self):
        for head in (-1, 256, True, 1.5, 'Head'):
            with self.assertRaises(ValueError):
                build_droplet_geometry(head, 'tear', 'Left')
        for kind, side in [('rain', 'Left'), ('tear', 'center')]:
            with self.assertRaises(ValueError):
                build_droplet_geometry(1, kind, side)


if __name__ == '__main__':
    unittest.main()
