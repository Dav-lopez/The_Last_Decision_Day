"""Anatomically suggestive, bilateral Head-skinned ear surfaces.

The Quaternius rest-pose face points +Z. A recessed concha, smoothly raised
antihelix and helix, small tragus and narrowing lobe provide real 3D relief.
This is stylized authored geometry, not an anatomical scan. The same geometry
is exported for both body variants and inherits the customizable skin material.
"""
import math

SEGMENTS = 32
RINGS = (0.20, 0.43, 0.66, 0.84, 1.0)
CENTER_X = 0.115
CENTER_Y = 1.664
CENTER_Z = 0.021
HALF_WIDTH = 0.026
HALF_HEIGHT = 0.035


def _surface(side, radius, angle):
    """Polar ear patch with a recessed bowl and curved cartilage ridges."""
    vertical = math.sin(angle)
    horizontal = math.cos(angle)
    # Broader upper cartilage, narrower lower lobe. Keep radial rings nested.
    width_scale = (0.78 + 0.22 * max(0.0, vertical)) * (1 - 0.25 * max(0.0, -vertical))
    x = side * (CENTER_X + HALF_WIDTH * radius * horizontal * width_scale)
    y = CENTER_Y + HALF_HEIGHT * radius * vertical
    # Continuous radial relief prevents the former sharp, flat-depth rings.
    upper = max(0.0, vertical)
    antihelix = 0.009 * math.exp(-((radius - 0.62) / 0.18) ** 2) * (0.55 + 0.45 * upper)
    helix = 0.014 * math.exp(-((radius - 0.83) / 0.13) ** 2) * (0.75 + 0.25 * upper)
    # Tragus projects just in front of the lower inner concha.
    tragus = (0.006 * math.exp(-((radius - 0.43) / 0.16) ** 2)
              * math.exp(-((horizontal + 0.85) / 0.35) ** 2)
              * math.exp(-((vertical + 0.25) / 0.45) ** 2))
    lobe = 0.0025 * math.exp(-((vertical + 1.0) / 0.30) ** 2) * math.exp(-((radius - 0.75) / 0.27) ** 2)
    z = (CENTER_Z - 0.005 * (1 - radius) ** 2 - 0.003 * radius ** 6
         + antihelix + helix + tragus + lobe)
    return (x, y, z)


def build_ear_geometry(head_joint):
    """Return paired front-facing indexed ear patches with area-weighted normals."""
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")

    positions, indices = [], []
    for side in (-1, 1):
        start = len(positions)
        positions.append((side * CENTER_X, CENTER_Y, CENTER_Z - 0.005))
        previous = None
        for radius in RINGS:
            current = []
            for segment in range(SEGMENTS):
                angle = 2 * math.pi * segment / SEGMENTS
                current.append(len(positions))
                positions.append(_surface(side, radius, angle))
            for segment in range(SEGMENTS):
                nxt = (segment + 1) % SEGMENTS
                if previous is None:
                    triangles = ((start, current[segment], current[nxt]),)
                else:
                    triangles = ((previous[segment], current[segment], current[nxt]),
                                 (previous[segment], current[nxt], previous[nxt]))
                for triangle in triangles:
                    if side == -1:
                        triangle = (triangle[0], triangle[2], triangle[1])
                    indices.extend((index,) for index in triangle)
            previous = current

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
