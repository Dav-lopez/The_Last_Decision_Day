"""Head-skinned, tapered 3D eyebrow fibres for both licensed character bodies.

Each fibre has a two-segment ribbon with a narrowing tip and shallow forward
relief. Unlike single flat triangles, its root, ridge and tip catch light at
slightly different angles. Morphs use the existing brow target names, so no
runtime controllers or extra animation tracks are needed.
"""

import math

STROKES_PER_ROW = 14
ROWS = 2
BROW_TARGETS = ("browInnerUp", "browDownLeft", "browDownRight")
VERTICES_PER_FIBRE = 5
TRIANGLES_PER_FIBRE = 3


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
                # Deterministic variation avoids identical comb-like fibres.
                variation = 0.5 + 0.5 * math.sin(i * 2.17 + row * 1.31 + side * 0.47)
                root_width = 0.00068 + 0.00024 * variation
                ridge_width = root_width * 0.57
                lift = 0.0026 + 0.00045 * variation
                ridge_y = y + lift * 0.53
                tip_y = y + lift
                ridge_z = z + 0.00065
                tip_z = z + 0.00018
                start = len(positions)
                positions.extend(((x - root_width, y, z),
                                  (x + root_width, y, z),
                                  (x - ridge_width + side * 0.00045, ridge_y, ridge_z),
                                  (x + ridge_width + side * 0.00045, ridge_y, ridge_z),
                                  (x + side * 0.00165, tip_y, tip_z)))
                # The middle ridge and narrowing tip catch light differently.
                lower_slope = (ridge_z - z) / (ridge_y - y)
                upper_slope = (tip_z - ridge_z) / (tip_y - ridge_y)

                def normal(slope):
                    length = math.hypot(1, slope)
                    return (0.0, -slope / length, 1.0 / length)

                normals.extend((normal(lower_slope), normal(lower_slope),
                                normal((lower_slope + upper_slope) / 2),
                                normal((lower_slope + upper_slope) / 2),
                                normal(upper_slope)))
                owners.extend((side,) * VERTICES_PER_FIBRE)
                inner_factors.extend((max(0.0, (1 - side * u) / 2),) * VERTICES_PER_FIBRE)
                indices.extend(((start,), (start + 1,), (start + 2,),
                                (start + 1,), (start + 3,), (start + 2,),
                                (start + 2,), (start + 3,), (start + 4,)))

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
