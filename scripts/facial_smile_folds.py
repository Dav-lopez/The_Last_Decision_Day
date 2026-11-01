"""Head-skinned curved nasolabial relief driven by existing mouth-corner morphs.

Three narrow rails per side create a rounded ridge instead of a flat decal.
Each bilateral smile/frown target supplies POSITION and NORMAL deltas so the
lighting follows the moving skin. Geometry stays deterministic and lightweight.
"""
import math

SAMPLES = 11
RAILS = 3
FOLD_TARGETS = ("mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight")


def _surface_normals(positions, indices):
    """Compute area-weighted smooth normals for the front-facing strips."""
    accum = [[0.0, 0.0, 0.0] for _ in positions]
    for start in range(0, len(indices), 3):
        a, b, c = (indices[start + k][0] for k in range(3))
        p, q, r = (positions[i] for i in (a, b, c))
        u = [q[k] - p[k] for k in range(3)]
        v = [r[k] - p[k] for k in range(3)]
        cross = (u[1] * v[2] - u[2] * v[1],
                 u[2] * v[0] - u[0] * v[2],
                 u[0] * v[1] - u[1] * v[0])
        for i in (a, b, c):
            for k in range(3):
                accum[i][k] += cross[k]
    result = []
    for x, y, z in accum:
        length = math.sqrt(x * x + y * y + z * z)
        if length < 1e-12 or not math.isfinite(length):
            raise ValueError("Degenerate nasolabial fold triangle")
        result.append((x / length, y / length, z / length))
    return result


def build_smile_fold_geometry(head_joint):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions, indices, owners, amounts = [], [], [], []
    for side in (-1, 1):
        start = len(positions)
        # X increases on both sides to keep triangles facing the viewer (+Z).
        for i in range(SAMPLES):
            t = i / (SAMPLES - 1) if side == 1 else 1 - i / (SAMPLES - 1)
            x = side * (0.039 + 0.032 * t)
            arch = math.sin(math.pi * t)
            y = 1.647 - 0.014 * t + 0.003 * arch
            z = 0.0825 + 0.0015 * arch
            half_width = 0.0003 + 0.0011 * arch
            for rail in range(RAILS):
                # Outer rails recede into the cheek; the centre forms a soft ridge.
                across = rail - 1
                positions.append((x, y + across * half_width,
                                  z + (0.0011 if rail == 1 else -0.0002) * arch))
                owners.append(side)
                amounts.append((t, arch, rail))
            if i:
                prev = start + (i - 1) * RAILS
                curr = start + i * RAILS
                for rail in range(RAILS - 1):
                    a, b, c, d = prev + rail, prev + rail + 1, curr + rail, curr + rail + 1
                    indices.extend(((a,), (c,), (b,), (b,), (c,), (d,)))

    normals = _surface_normals(positions, indices)
    targets, normal_targets = [], []
    for name in FOLD_TARGETS:
        side = -1 if name.endswith("Left") else 1
        smile = name.startswith("mouthSmile")
        deltas = []
        for owner, (t, arch, rail) in zip(owners, amounts):
            if owner != side:
                deltas.append((0.0, 0.0, 0.0))
            elif smile:
                deltas.append((0.0, 0.004 * t,
                               0.003 * arch + (0.0007 * arch if rail == 1 else 0.0)))
            else:
                deltas.append((0.0, -0.003 * t,
                               -0.0013 * arch - (0.0006 * arch if rail == 1 else 0.0)))
        morphed = [tuple(a + b for a, b in zip(pos, delta))
                   for pos, delta in zip(positions, deltas)]
        morphed_normals = _surface_normals(morphed, indices)
        normal_deltas = [tuple(m - n for m, n in zip(morphed_normal, normal))
                         for morphed_normal, normal in zip(morphed_normals, normals)]
        targets.append(deltas)
        normal_targets.append(normal_deltas)

    return {
        "positions": positions, "normals": normals, "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": FOLD_TARGETS, "targets": targets,
        "normal_targets": normal_targets,
    }
