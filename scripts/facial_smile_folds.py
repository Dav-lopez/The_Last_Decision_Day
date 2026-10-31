"""Head-skinned nasolabial smile-fold relief driven by existing mouth-corner morphs.

A pair of narrow, tapered skin-coloured ribbons follows the pinned Quaternius
+Z-facing rest pose. Each side deforms only with its own smile/frown weights;
there are no extra runtime controllers, textures or skeleton joints. The strips
are intentionally subtle and still require human visual review in Babylon.
"""
import math

SAMPLES = 11
FOLD_TARGETS = ("mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight")


def build_smile_fold_geometry(head_joint):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions, normals, indices, owners, amounts = [], [], [], [], []
    for side in (-1, 1):
        # Keep increasing X for both sides so each triangle faces +Z.
        for i in range(SAMPLES):
            t = i / (SAMPLES - 1) if side == 1 else 1 - i / (SAMPLES - 1)
            x = side * (0.039 + 0.032 * t)
            arch = math.sin(math.pi * t)
            y = 1.647 - 0.014 * t + 0.003 * arch
            z = 0.0825 + 0.0015 * arch
            half_width = 0.0003 + 0.0011 * arch
            for offset in (-1, 1):
                positions.append((x, y + offset * half_width, z))
                normals.append((0.0, 0.0, 1.0))
                owners.append(side)
                amounts.append((t, arch))
            if i:
                a = len(positions) - 4
                b, c, d = a + 1, a + 2, a + 3
                indices.extend(((a,), (c,), (b,), (b,), (c,), (d,)))

    targets = []
    for name in FOLD_TARGETS:
        side = -1 if name.endswith("Left") else 1
        smile = name.startswith("mouthSmile")
        deltas = []
        for owner, (t, arch) in zip(owners, amounts):
            if owner != side:
                deltas.append((0.0, 0.0, 0.0))
            elif smile:
                deltas.append((0.0, 0.004 * t, 0.003 * arch))
            else:
                deltas.append((0.0, -0.003 * t, -0.0013 * arch))
        targets.append(deltas)
    return {
        "positions": positions, "normals": normals, "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": FOLD_TARGETS, "targets": targets,
    }
