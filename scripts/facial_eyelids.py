"""Head-skinned eyelid rims and outer lashes with bilateral expression morphs.

Coordinates match the pinned Quaternius +Z-facing rest pose, in metres.
Blink, eye-wide and squint targets share the source eye mesh names, so Babylon
can animate the lids and eye surfaces together without a new runtime path.
Visual placement and combined-expression clipping still require WebGL review.
"""
import math

SAMPLES = 13
SIDES = ("Left", "Right")
BLINK_TARGETS = ("eyeBlinkLeft", "eyeBlinkRight")
EYELID_TARGETS = BLINK_TARGETS + (
    "eyeWideLeft", "eyeWideRight", "eyeSquintLeft", "eyeSquintRight"
)


def build_eyelid_geometry(head_joint):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions, normals, indices, side_by_vertex, motion = [], [], [], [], []

    def vertex(x, y, z, side, blink_shift, wide_shift, squint_shift):
        positions.append((x, y, z))
        normals.append((0.0, 0.0, 1.0))
        side_by_vertex.append(side)
        motion.append((blink_shift, wide_shift, squint_shift))
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
                influence = 0.55 + 0.45 * arch
                if upper:
                    y = 1.692 + 0.003 * arch
                    blink = -0.0115 * influence
                    wide = 0.0045 * influence
                    squint = -0.0050 * influence
                    thickness = 0.0015
                else:
                    y = 1.679 - 0.001 * arch
                    blink = 0.003 * influence
                    wide = -0.0025 * influence
                    squint = 0.0026 * influence
                    thickness = 0.0012
                inner.append(vertex(x, y, 0.092, side, blink, wide, squint))
                outer.append(vertex(x, y + (thickness if upper else -thickness),
                                    0.0925, side, blink, wide, squint))
            for i in range(SAMPLES - 1):
                a, b = inner[i], inner[i + 1]
                c, d = outer[i], outer[i + 1]
                if upper:
                    indices.extend(((a,), (b,), (c,), (b,), (d,), (c,)))
                else:
                    # The lower rim is extruded downward, so reverse winding.
                    indices.extend(((a,), (c,), (b,), (b,), (c,), (d,)))
        # Each lash is a shallow, curved two-segment ribbon, not a flat
        # triangle. The root sits on the upper lid, the middle catches light
        # ahead of the lid and the tip tapers to a point. All five vertices
        # inherit the same bilateral lid morph, preventing floating lashes.
        for strand, fraction in enumerate((0.22, 0.43, 0.64, 0.82)):
            u = fraction if side == 1 else -fraction
            x = side * 0.052 + 0.024 * u
            arch = 1.0 - u * u
            y = 1.692 + 0.003 * arch + 0.001
            influence = 0.55 + 0.45 * arch
            blink, wide, squint = (-0.0115 * influence, 0.0045 * influence,
                                   -0.0050 * influence)
            # Stagger length and bend without randomness or extra animation.
            reach = 0.0030 + 0.00055 * math.sin(strand * 1.7 + 0.4)
            lift = 0.0035 + 0.00045 * math.cos(strand * 1.3)
            root_width = 0.00105
            ridge_width = root_width * 0.50
            base_z, ridge_z, tip_z = 0.093, 0.09375, 0.09425
            ridge_y = y + lift * 0.52
            tip_y = y + lift
            ridge_x = x + side * reach * 0.50
            tip_x = x + side * reach
            lower_slope = (ridge_z - base_z) / (ridge_y - y)
            upper_slope = (tip_z - ridge_z) / (tip_y - ridge_y)

            def normal(slope):
                length = math.hypot(1.0, slope)
                return (0.0, -slope / length, 1.0 / length)

            start = len(positions)
            for px, py, pz, n in (
                (x - root_width, y, base_z, normal(lower_slope)),
                (x + root_width, y, base_z, normal(lower_slope)),
                (ridge_x - ridge_width, ridge_y, ridge_z, normal(lower_slope)),
                (ridge_x + ridge_width, ridge_y, ridge_z, normal(lower_slope)),
                (tip_x, tip_y, tip_z, normal(upper_slope)),
            ):
                positions.append((px, py, pz))
                normals.append(n)
                side_by_vertex.append(side)
                motion.append((blink, wide, squint))
            # Winding is +Z on both eyes, including the leftward lashes.
            indices.extend(((start,), (start + 1,), (start + 2,),
                            (start + 1,), (start + 3,), (start + 2,),
                            (start + 2,), (start + 3,), (start + 4,)))

    targets = []
    for name in EYELID_TARGETS:
        active_side = -1 if name.endswith("Left") else 1
        component = (0 if name.startswith("eyeBlink") else
                     1 if name.startswith("eyeWide") else 2)
        targets.append([(0.0, shifts[component], 0.0)
                        if owner == active_side else (0.0, 0.0, 0.0)
                        for owner, shifts in zip(side_by_vertex, motion)])
    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": EYELID_TARGETS,
        "targets": targets,
    }
