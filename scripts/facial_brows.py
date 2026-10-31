"""Lightweight head-skinned eyebrow fibres driven by the existing brow morphs.

The pinned CC0 face looks along +Z. These shallow, tapered ribbons add visible
brow relief without textures, extra bones, or per-frame mesh allocations.
Both character bodies use the same geometry shifted by their eye centres.
"""

STROKES_PER_ROW = 14
ROWS = 2
BROW_TARGETS = ("browInnerUp", "browDownLeft", "browDownRight")


def build_brow_geometry(head_joint):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")

    positions, normals, indices, owners, inner_factors = [], [], [], [], []
    for side in (-1, 1):
        for row in range(ROWS):
            for i in range(STROKES_PER_ROW):
                u = -0.94 + 1.88 * i / (STROKES_PER_ROW - 1)
                x = side * 0.052 + 0.021 * u
                arch = max(0.0, 1.0 - u * u)
                y = 1.710 + 0.0047 * arch + row * 0.002
                z = 0.0932 + 0.001 * arch + row * 0.0002
                # Narrow triangular fibres, all wound toward +Z.
                start = len(positions)
                positions.extend(((x - 0.00075, y, z),
                                  (x + 0.00075, y, z),
                                  (x + side * 0.0023, y + 0.0025, z + 0.0004)))
                normals.extend(((0.0, 0.0, 1.0),) * 3)
                owners.extend((side,) * 3)
                inner_factors.extend((max(0.0, (1 - side * u) / 2),) * 3)
                indices.extend(((start,), (start + 1,), (start + 2,)))

    targets = []
    for name in BROW_TARGETS:
        if name == "browInnerUp":
            deltas = [(0.0, 0.006 * inner, 0.0) for inner in inner_factors]
        else:
            active_side = -1 if name.endswith("Left") else 1
            deltas = [(0.0, -0.0045, 0.0) if owner == active_side else (0.0, 0.0, 0.0)
                      for owner in owners]
        targets.append(deltas)

    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": BROW_TARGETS,
        "targets": targets,
    }
