"""Head-skinned, translucent 3D tear and sweat beads for the CC0 character.

Coordinates follow the pinned Quaternius character's +Z-facing rest pose.
Each patch is skinned to Head; its morph moves along a subtle cheek/temple
path. A convex centre and computed normals give the bead a genuine specular
surface instead of a flat, front-normal decal.
"""
import math

DROPLET_KINDS = ('tear', 'sweat')
DROPLET_SIDES = ('Left', 'Right')


def build_droplet_geometry(head_joint, kind, side):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError('Head joint must fit UNSIGNED_BYTE JOINTS_0')
    if kind not in DROPLET_KINDS or side not in DROPLET_SIDES:
        raise ValueError('Unknown droplet kind or side')
    sign = -1 if side == 'Left' else 1
    if kind == 'tear':
        x, y, z, rx, ry, fall, drift, depth = sign * .054, 1.672, .090, .0042, .007, .048, .0022, -.0035
    else:
        x, y, z, rx, ry, fall, drift, depth = sign * .094, 1.710, .083, .0045, .006, .036, .0032, -.0020
    # The tapered upper edge feeds a fuller lower bead. Both are true curved
    # geometry: the raised centre and sloped rim produce non-planar normals.
    positions = [(x, y, z + .003)]
    for i in range(8):
        angle = 2 * math.pi * i / 8
        vertical = math.sin(angle)
        width = rx * (1 - .22 * vertical)
        positions.append((x + width * math.cos(angle), y + ry * vertical, z + .00025))
    indices = []
    for i in range(8):
        indices.extend(((0,), (1 + i,), (1 + (i + 1) % 8,)))

    accum = [[0.0, 0.0, 0.0] for _ in positions]
    for start in range(0, len(indices), 3):
        a, b, c = (indices[start + k][0] for k in range(3))
        p, q, r = (positions[index] for index in (a, b, c))
        u = [q[k] - p[k] for k in range(3)]
        v = [r[k] - p[k] for k in range(3)]
        normal = (u[1]*v[2] - u[2]*v[1],
                  u[2]*v[0] - u[0]*v[2],
                  u[0]*v[1] - u[1]*v[0])
        for index in (a, b, c):
            for axis in range(3):
                accum[index][axis] += normal[axis]
    normals = []
    for nx, ny, nz in accum:
        length = math.sqrt(nx*nx + ny*ny + nz*nz)
        if length <= 1e-12:
            raise ValueError('Degenerate droplet geometry')
        normals.append((nx/length, ny/length, nz/length))

    return {
        'positions': positions,
        'normals': normals,
        'joints': [(head_joint, 0, 0, 0)] * len(positions),
        'weights': [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        'indices': indices,
        'names': (kind + 'Track' + side,),
        'targets': [[(sign * drift, -fall, depth)] * len(positions)],
    }
