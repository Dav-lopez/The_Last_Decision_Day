"""Head-skinned, smoothly curved bilateral cheek surfaces and expression normals.

Two concentric elliptical rings form a shallow convex cheek instead of a flat
blush decal. Existing cheekSquintLeft/Right morphs raise the corresponding
cheek and update its lighting normals. The transparent blush material and
Head-bone attachment remain unchanged; no new runtime morph channels.
"""
import math

CHEEK_TARGETS = ("cheekSquintLeft", "cheekSquintRight")
SEGMENTS = 8
VERTICES_PER_CHEEK = 1 + 2 * SEGMENTS


def _surface_normals(positions, indices):
    """Area-weighted vertex normals, rejecting degenerate triangles."""
    accum = [[0.0, 0.0, 0.0] for _ in positions]
    for start in range(0, len(indices), 3):
        a, b, c = (indices[start + k][0] for k in range(3))
        p, q, r = (positions[i] for i in (a, b, c))
        u = [q[k] - p[k] for k in range(3)]
        v = [r[k] - p[k] for k in range(3)]
        cross = (u[1] * v[2] - u[2] * v[1],
                 u[2] * v[0] - u[0] * v[2],
                 u[0] * v[1] - u[1] * v[0])
        if math.sqrt(sum(value * value for value in cross)) < 1e-12:
            raise ValueError("Degenerate cheek triangle")
        for i in (a, b, c):
            for k in range(3):
                accum[i][k] += cross[k]
    normals = []
    for x, y, z in accum:
        length = math.sqrt(x * x + y * y + z * z)
        if length < 1e-12 or not math.isfinite(length):
            raise ValueError("Invalid cheek surface normal")
        normals.append((x / length, y / length, z / length))
    return normals


def build_cheek_geometry(head_joint):
    """Create curved, head-skinned cheek patches with bilateral POSITION/NORMAL morphs."""
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions, indices, owners, rings, upper_factors = [], [], [], [], []
    for side in (-1, 1):
        start = len(positions)
        cx, cy = side * 0.062, 1.649
        positions.append((cx, cy, 0.083))
        owners.append(side)
        rings.append(0)
        upper_factors.append(0.5)
        for ring in (1, 2):
            rx, ry = (0.014, 0.009) if ring == 1 else (0.025, 0.016)
            for i in range(SEGMENTS):
                angle = 2 * math.pi * i / SEGMENTS
                x, y = math.cos(angle), math.sin(angle)
                z = (0.0805 if ring == 1 else 0.0765) - (0.0005 if ring == 2 else 0) * abs(x)
                positions.append((cx + rx * x, cy + ry * y, z))
                owners.append(side)
                rings.append(ring)
                upper_factors.append(max(0.0, y))
        inner = start + 1
        outer = inner + SEGMENTS
        for i in range(SEGMENTS):
            j = (i + 1) % SEGMENTS
            # Counterclockwise winding faces +Z, including on the left cheek.
            indices.extend(((start,), (inner + i,), (inner + j,)))
            indices.extend(((inner + i,), (outer + i,), (outer + j,)))
            indices.extend(((inner + i,), (outer + j,), (inner + j,)))

    normals = _surface_normals(positions, indices)
    targets, normal_targets = [], []
    for name in CHEEK_TARGETS:
        active = -1 if name.endswith("Left") else 1
        deltas = []
        for owner, ring, upper in zip(owners, rings, upper_factors):
            if owner != active:
                deltas.append((0.0, 0.0, 0.0))
            elif ring == 0:
                deltas.append((active * 0.0007, 0.0065, 0.0025))
            elif ring == 1:
                deltas.append((active * 0.0004, 0.0042 + 0.0010 * upper, 0.0015))
            else:
                # Pin the perimeter close to the underlying head to avoid a
                # floating edge as the cheek rises toward the lower eyelid.
                deltas.append((0.0, 0.0004 + 0.0006 * upper, 0.0002))
        morphed = [tuple(p + d for p, d in zip(position, delta))
                   for position, delta in zip(positions, deltas)]
        changed_normals = _surface_normals(morphed, indices)
        normal_deltas = [tuple(m - n for m, n in zip(changed, original))
                         for changed, original in zip(changed_normals, normals)]
        targets.append(deltas)
        normal_targets.append(normal_deltas)
    return {
        "positions": positions,
        "normals": normals,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "indices": indices,
        "names": CHEEK_TARGETS,
        "targets": targets,
        "normal_targets": normal_targets,
    }
