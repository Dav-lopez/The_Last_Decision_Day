"""Bilateral, head-skinned outer-ear relief for the pinned Quaternius head.

The rest pose faces +Z. A recessed concha, raised helix and tapered lobe
produce actual 3D relief, not a flat ear decal. These are deliberately
stylized additions to the licensed source head, not anatomical scans.
"""
import math

SEGMENTS = 24
RINGS = (0.43, 0.78, 1.0)
CENTER_X = 0.115
CENTER_Y = 1.664
CENTER_Z = 0.021
HALF_WIDTH = 0.026
HALF_HEIGHT = 0.035


def build_ear_geometry(head_joint):
    """Build paired ear surfaces with outward helix relief and Head skinning."""
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")

    positions, indices = [], []
    for side in (-1, 1):
        start = len(positions)
        positions.append((side * CENTER_X, CENTER_Y, CENTER_Z))
        previous = None
        for ring_index, radius in enumerate(RINGS):
            current = []
            for segment in range(SEGMENTS):
                angle = 2 * math.pi * segment / SEGMENTS
                # Upper ear broadens slightly; the lower lobe is narrower.
                vertical = math.sin(angle)
                width_scale = 0.85 + 0.15 * max(0.0, vertical)
                x = side * (CENTER_X + HALF_WIDTH * radius * math.cos(angle) * width_scale)
                y = CENTER_Y + HALF_HEIGHT * radius * vertical
                # Concha recessed, helix raised, edge blended toward head.
                z = CENTER_Z + (0.002 if ring_index == 0 else
                                0.013 if ring_index == 1 else -0.003)
                current.append(len(positions))
                positions.append((x, y, z))
            for segment in range(SEGMENTS):
                nxt = (segment + 1) % SEGMENTS
                if previous is None:
                    tri = (start, current[segment], current[nxt])
                    if side == -1:
                        tri = (tri[0], tri[2], tri[1])
                    indices.extend((i,) for i in tri)
                else:
                    tris = ((previous[segment], current[segment], current[nxt]),
                            (previous[segment], current[nxt], previous[nxt]))
                    for tri in tris:
                        if side == -1:
                            tri = (tri[0], tri[2], tri[1])
                        indices.extend((i,) for i in tri)
            previous = current

    # Area-weighted normals reflect the helix/concha instead of a flat plane.
    accum = [[0.0, 0.0, 0.0] for _ in positions]
    for a, b, c in zip(*[iter(indices)] * 3):
        ia, ib, ic = a[0], b[0], c[0]
        p, q, r = positions[ia], positions[ib], positions[ic]
        u = [q[k] - p[k] for k in range(3)]
        v = [r[k] - p[k] for k in range(3)]
        cross = (u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0])
        for index in (ia, ib, ic):
            for axis in range(3):
                accum[index][axis] += cross[axis]
    normals = []
    for nx, ny, nz in accum:
        magnitude = math.sqrt(nx*nx + ny*ny + nz*nz)
        if magnitude < 1e-12:
            raise ValueError("Degenerate ear geometry")
        normals.append((nx/magnitude, ny/magnitude, nz/magnitude))

    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
    }
