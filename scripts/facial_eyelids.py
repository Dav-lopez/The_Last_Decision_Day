"""Head-skinned upper/lower eyelid rims and short outer lashes.

Coordinates match the pinned Quaternius +Z-facing rest pose, in metres.
Both blink targets are present on a single mesh, so the existing Babylon
blink controller also closes the eyelid rims without a new runtime path.
This is subtle stylized geometry; visual placement still requires review.
"""
import math

SAMPLES = 13
SIDES = ("Left", "Right")
BLINK_TARGETS = ("eyeBlinkLeft", "eyeBlinkRight")


def build_eyelid_geometry(head_joint):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions, normals, indices, side_by_vertex, motion = [], [], [], [], []

    def vertex(x, y, z, side, blink_shift):
        positions.append((x, y, z))
        normals.append((0.0, 0.0, 1.0))
        side_by_vertex.append(side)
        motion.append(blink_shift)
        return len(positions) - 1

    for side in (-1, 1):
        # Build in increasing X so all front-facing triangles use +Z winding.
        # Side -1 is the source model's left eye in morph naming convention.
        for upper in (True, False):
            inner, outer = [], []
            for i in range(SAMPLES):
                u = -1.0 + 2.0 * i / (SAMPLES - 1)
                x = side * 0.052 + 0.024 * u
                arch = max(0.0, 1.0 - u * u)
                if upper:
                    y = 1.692 + 0.003 * arch
                    dy = -0.0115 * (0.55 + 0.45 * arch)
                    thickness = 0.0015
                else:
                    y = 1.679 - 0.001 * arch
                    dy = 0.003 * (0.55 + 0.45 * arch)
                    thickness = 0.0012
                inner.append(vertex(x, y, 0.092, side, dy))
                outer.append(vertex(x, y + (thickness if upper else -thickness),
                                    0.0925, side, dy))
            for i in range(SAMPLES - 1):
                a, b = inner[i], inner[i + 1]
                c, d = outer[i], outer[i + 1]
                if upper:
                    indices.extend(((a,), (b,), (c,), (b,), (d,), (c,)))
                else:
                    # The lower rim is extruded downward, so reverse winding.
                    indices.extend(((a,), (c,), (b,), (b,), (c,), (d,)))
        # Sparse, tapered outer lashes (one triangle each), attached to the
        # upper rim. Their bases move with the same blink target.
        for fraction in (0.22, 0.43, 0.64, 0.82):
            u = fraction if side == 1 else -fraction
            x = side * 0.052 + 0.024 * u
            arch = 1.0 - u * u
            y = 1.692 + 0.003 * arch + 0.001
            dy = -0.0115 * (0.55 + 0.45 * arch)
            direction = side
            a = vertex(x - 0.0011, y, 0.093, side, dy)
            b = vertex(x + 0.0011, y, 0.093, side, dy)
            tip = vertex(x + direction * 0.003, y + 0.0035, 0.094, side, dy)
            # Choose winding based on triangle orientation in the XY plane.
            cross = (positions[b][0] - positions[a][0]) * (positions[tip][1] - positions[a][1])
            if cross > 0:
                indices.extend(((a,), (b,), (tip,)))
            else:
                indices.extend(((b,), (a,), (tip,)))

    targets = []
    for side in (-1, 1):
        targets.append([(0.0, shift, 0.0) if owner == side else (0.0, 0.0, 0.0)
                        for owner, shift in zip(side_by_vertex, motion)])
    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": BLINK_TARGETS,
        "targets": targets,
    }
