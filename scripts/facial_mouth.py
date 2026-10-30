"""Small skinned lip surface with independent expression morphs.

Coordinates are measured in the pinned Quaternius source's rest pose, not
Babylon world space. This is a stylized stopgap until a licensed facial rig
with authored lips and textures is available.
"""

MOUTH_TARGETS = (
    "mouthSmileLeft", "mouthSmileRight",
    "mouthFrownLeft", "mouthFrownRight",
    "mouthPressLeft", "mouthPressRight",
    "jawOpen", "mouthOpen",
)


def build_mouth_geometry(head_joint):
    """Return glTF-ready lip attributes, triangles and POSITION deltas."""
    if not isinstance(head_joint, int) or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    xs = (-0.042, -0.021, 0.0, 0.021, 0.042)
    # Eye/brow source bounds are y=1.68..1.73, front-facing +Z.
    # Put a subtle curved lip surface below the eyes in the same rest pose.
    # Source face surface is ~Z=0.07 at mouth corners and ~Z=0.09
    # at the center (y=1.60..1.62). Follow that contour rather than
    # placing the lips several centimetres in front of the cheeks.
    positions = [
        (x, y, 0.074 + 0.016 * (1 - abs(x) / 0.042) + (0.004 if row == 0 else 0))
        for row, y in enumerate((1.615, 1.604)) for x in xs
    ]
    indices = []
    for col in range(len(xs) - 1):
        a, b = col, col + 1
        c, d = len(xs) + col, len(xs) + col + 1
        indices.extend(((a,), (c,), (b,), (b,), (c,), (d,)))
    targets = []
    for name in MOUTH_TARGETS:
        deltas = []
        for i, (x, _y, _z) in enumerate(positions):
            bottom = i >= len(xs)
            corner = abs(x) / xs[-1]
            side = (name.endswith("Left") and x < 0) or (name.endswith("Right") and x > 0)
            dy = dz = 0.0
            if name.startswith("mouthSmile") and side:
                dy, dz = 0.014 * corner, 0.003 * corner
            elif name.startswith("mouthFrown") and side:
                dy = -0.012 * corner
            elif name.startswith("mouthPress") and side:
                dy = 0.003 if bottom else -0.003
            elif name == "jawOpen" and bottom:
                dy = -0.026
            elif name == "mouthOpen" and bottom:
                dy = -0.018
            deltas.append((0.0, dy, dz))
        targets.append(deltas)
    return {
        "positions": positions,
        "normals": [(0.0, 0.0, 1.0)] * len(positions),
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "indices": indices,
        "names": MOUTH_TARGETS,
        "targets": targets,
    }
