#!/usr/bin/env python3
"""Offline geometry tests for articulated lips and the recessed oral interior."""
import math
import unittest
from facial_mouth import MOUTH_TARGETS, build_mouth_geometry
from facial_oral import ORAL_TARGETS, build_oral_geometry


class OralGeometryTests(unittest.TestCase):
    def setUp(self):
        self.lips = build_mouth_geometry(42)
        self.oral = build_oral_geometry(42)

    def test_lips_are_two_disconnected_front_facing_ribbons(self):
        g = self.lips
        self.assertEqual(len(g['positions']), 20)
        self.assertEqual(len(g['indices']), 48)
        self.assertFalse(any({index[0] // 10 for index in g['indices'][i:i+3]} == {0, 1}
                             for i in range(0, len(g['indices']), 3)))
        for i in range(0, len(g['indices']), 3):
            a, b, c = (g['positions'][g['indices'][i+k][0]] for k in range(3))
            self.assertGreater((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]), 0)
        self.assertGreater(g['positions'][7][1], g['positions'][12][1])

    def test_mouth_morphs_preserve_bilateral_and_lower_only_articulation(self):
        g = self.lips
        self.assertEqual(len(g['names']), len(g['targets']))
        for name in ('mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight'):
            deltas = g['targets'][MOUTH_TARGETS.index(name)]
            self.assertTrue(any(any(abs(v) > 0 for v in d) for d in deltas))
            for (x, _, _), delta in zip(g['positions'], deltas):
                if (name.endswith('Left') and x >= 0) or (name.endswith('Right') and x <= 0):
                    self.assertEqual(delta, (0.0, 0.0, 0.0))
        for name in ORAL_TARGETS:
            deltas = g['targets'][MOUTH_TARGETS.index(name)]
            self.assertTrue(all(d == (0.0, 0.0, 0.0) for d in deltas[:10]))
            self.assertTrue(all(d[1] < 0 for d in deltas[10:]))

    def test_oral_surfaces_have_depth_and_follow_head(self):
        lips = self.lips['positions']
        cavity, teeth, tongue = (self.oral[key] for key in ('cavity', 'teeth', 'tongue'))
        for g in (cavity, teeth, tongue):
            self.assertEqual(len(g['positions']), 10)
            self.assertEqual(len(g['indices']), 24)
            self.assertTrue(all(j == (42, 0, 0, 0) for j in g['joints']))
            self.assertTrue(all(sum(w) == 1 for w in g['weights']))
            self.assertTrue(all(math.isfinite(v) for row in g['positions'] for v in row))
        self.assertLess(cavity['positions'][2][2], teeth['positions'][2][2])
        self.assertLess(teeth['positions'][2][2], lips[7][2])
        self.assertLess(tongue['positions'][2][2], lips[12][2])

    def test_cavity_expands_and_tongue_moves_without_dental_stretch(self):
        cavity, teeth, tongue = (self.oral[key] for key in ('cavity', 'teeth', 'tongue'))
        self.assertEqual(teeth['names'], ())
        self.assertEqual(teeth['targets'], [])
        for name in ORAL_TARGETS:
            i = ORAL_TARGETS.index(name)
            self.assertEqual(cavity['targets'][i][:5], [(0.0, 0.0, 0.0)] * 5)
            self.assertTrue(all(delta[1] < 0 for delta in cavity['targets'][i][5:]))
            self.assertTrue(all(delta[1] < 0 for delta in tongue['targets'][i]))
            self.assertEqual(len(cavity['targets'][i]), len(cavity['positions']))


    def test_lower_crowns_are_separate_head_skinned_front_facing_geometry(self):
        lower = self.oral['lower_teeth']
        self.assertEqual(len(lower['positions']), 32)
        self.assertEqual(len(lower['indices']), 48)
        self.assertTrue(all(j == (42, 0, 0, 0) for j in lower['joints']))
        self.assertTrue(all(w == (1.0, 0.0, 0.0, 0.0) for w in lower['weights']))
        for tooth in range(8):
            verts = lower['positions'][tooth * 4:tooth * 4 + 4]
            self.assertLess(verts[0][0], verts[1][0])
            if tooth:
                self.assertGreater(verts[0][0], lower['positions'][(tooth - 1) * 4 + 1][0])
            self.assertTrue(all(1.60 < y < 1.62 and 0.077 < z < 0.094
                                for x, y, z in verts))
        for i in range(0, len(lower['indices']), 3):
            a, b, c = (lower['positions'][lower['indices'][k][0]]
                       for k in range(i, i + 3))
            self.assertGreater((b[0]-a[0])*(c[1]-a[1]) -
                               (b[1]-a[1])*(c[0]-a[0]), 0)

    def test_lower_teeth_move_rigidly_with_lower_lip_not_upper_teeth(self):
        lower = self.oral['lower_teeth']
        self.assertEqual(lower['names'], ORAL_TARGETS)
        self.assertEqual(len(lower['targets']), 2)
        self.assertEqual(self.oral['teeth']['targets'], [])
        for name, expected in (('jawOpen', -0.026), ('mouthOpen', -0.018)):
            delta = lower['targets'][ORAL_TARGETS.index(name)]
            self.assertEqual(delta, [(0.0, expected, 0.0)] * 32)
            # Open-mouth crowns remain above the displaced lower lip rim.
            self.assertGreater(min(p[1] + d[1] for p, d in zip(lower['positions'], delta)),
                               1.603 + expected)

    def test_invalid_joint_rejected(self):
        for bad in (-1, 256, 1.5, True):
            with self.assertRaises(ValueError):
                build_mouth_geometry(bad)
            with self.assertRaises(ValueError):
                build_oral_geometry(bad)


if __name__ == '__main__':
    unittest.main()
