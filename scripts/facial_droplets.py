"""Head-skinned, translucent tear and sweat droplets for the CC0 character.

Coordinates follow the pinned Quaternius character's +Z-facing rest pose.
Each patch is skinned to Head, so the existing Idle/Walk/Run animation moves it.
The sole morph target slides the droplet down the cheek or temple.
"""
import math

DROPLET_KINDS = ('tear', 'sweat')
DROPLET_SIDES = ('Left', 'Right')


def build_droplet_geometry(head_joint, kind, side):
    if not isinstance(head_joint, int) or not 0 <= head_joint < 256:
        raise ValueError('Head joint must fit UNSIGNED_BYTE JOINTS_0')
    if kind not in DROPLET_KINDS or side not in DROPLET_SIDES:
        raise ValueError('Unknown droplet kind or side')
    sign = -1 if side == 'Left' else 1
    if kind == 'tear':
        x, y, z, rx, ry, fall = sign * .054, 1.672, .090, .0042, .007, .048
    else:
        x, y, z, rx, ry, fall = sign * .094, 1.710, .083, .0045, .006, .036
    positions = [(x, y, z + .0015)]
    for i in range(8):
        angle = 2 * math.pi * i / 8
        positions.append((x + rx * math.cos(angle), y + ry * math.sin(angle), z))
    indices = []
    for i in range(8):
        indices.extend(((0,), (1 + i,), (1 + (i + 1) % 8,)))
    return {
        'positions': positions,
        'normals': [(0.0, 0.0, 1.0)] * len(positions),
        'joints': [(head_joint, 0, 0, 0)] * len(positions),
        'weights': [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        'indices': indices,
        'names': (kind + 'Track' + side,),
        'targets': [[(0.0, -fall, 0.0)] * len(positions)],
    }
