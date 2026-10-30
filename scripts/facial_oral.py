"""Lightweight head-skinned oral interior for the pinned Quaternius face.

The lip ribbons separate under jawOpen/mouthOpen; a recessed dark cavity,
upper teeth and lower tongue give the gap depth without runtime geometry
allocation. Coordinates are in the source model's +Z-facing rest pose (metres).
This is stylized authored geometry, not phoneme-accurate dental anatomy.
"""

XS = (-0.042, -0.021, 0.0, 0.021, 0.042)
ORAL_TARGETS = ('jawOpen', 'mouthOpen')


def _make_strip(head_joint, upper, lower, depth, *, motion='fixed'):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError('Head joint must fit UNSIGNED_BYTE JOINTS_0')
    if motion not in ('fixed', 'cavity', 'tongue'):
        raise ValueError('Unknown oral surface motion')
    positions = [(x, y, depth + .016 * (1 - abs(x) / XS[-1]))
                 for y in (upper, lower) for x in XS]
    indices = []
    for col in range(len(XS) - 1):
        a, b = col, col + 1
        c, d = len(XS) + col, len(XS) + col + 1
        indices.extend(((a,), (c,), (b,), (b,), (c,), (d,)))
    targets = []
    if motion != 'fixed':
        for name in ORAL_TARGETS:
            shift = -.026 if name == 'jawOpen' else -.018
            deltas = []
            for row in range(2):
                for _ in XS:
                    dy = shift if motion == 'tongue' else (shift if row == 1 else 0)
                    deltas.append((0.0, dy, 0.0))
            targets.append(deltas)
    return {
        'positions': positions,
        'normals': [(0.0, 0.0, 1.0)] * len(positions),
        'joints': [(head_joint, 0, 0, 0)] * len(positions),
        'weights': [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        'indices': indices,
        'names': ORAL_TARGETS if targets else (),
        'targets': targets,
    }


def build_oral_geometry(head_joint):
    """Return cavity, upper teeth and tongue meshes with compatible head skinning."""
    return {
        'cavity': _make_strip(head_joint, 1.607, 1.603, .078, motion='cavity'),
        'teeth': _make_strip(head_joint, 1.606, 1.598, .080),
        # The tongue remains close to the lower lip during jaw articulation.
        'tongue': _make_strip(head_joint, 1.598, 1.594, .081, motion='tongue'),
    }
