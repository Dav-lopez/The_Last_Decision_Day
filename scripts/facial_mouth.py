"""Two separate skinned lip ribbons with independent expression morphs.

The upper and lower lips are no longer joined by an opaque surface. The gap
reveals the recessed oral cavity as the jaw opens. Coordinates are in the
pinned Quaternius +Z-facing rest pose, in metres.
"""

MOUTH_TARGETS = (
    "mouthSmileLeft", "mouthSmileRight",
    "mouthFrownLeft", "mouthFrownRight",
    "mouthPressLeft", "mouthPressRight",
    "jawOpen", "mouthOpen",
)


def build_mouth_geometry(head_joint):
    """Return two non-bridging lip strips and their POSITION morph deltas."""
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    xs = (-0.042, -0.021, 0.0, 0.021, 0.042)
    rows = (1.618, 1.607, 1.603, 1.593)
    positions = [
        (x, y, 0.083 + 0.016 * (1 - abs(x) / xs[-1]) +
         (0.002 if row in (0, 3) else 0.0))
        for row, y in enumerate(rows) for x in xs
    ]
    indices = []
    for start in (0, 2 * len(xs)):
        for col in range(len(xs) - 1):
            a, b = start + col, start + col + 1
            c, d = start + len(xs) + col, start + len(xs) + col + 1
            indices.extend(((a,), (c,), (b,), (b,), (c,), (d,)))
    targets = []
    for name in MOUTH_TARGETS:
        deltas = []
        for i, (x, _y, _z) in enumerate(positions):
            row = i // len(xs)
            lower = row >= 2
            corner = abs(x) / xs[-1]
            side = (name.endswith("Left") and x < 0) or (name.endswith("Right") and x > 0)
            dy = dz = 0.0
            if name.startswith("mouthSmile") and side:
                dy, dz = 0.014 * corner, 0.003 * corner
            elif name.startswith("mouthFrown") and side:
                dy = -0.012 * corner
            elif name.startswith("mouthPress") and side:
                dy = (0.003 if row == 2 else -0.003 if row == 1 else 0.0)
            elif name == "jawOpen" and lower:
                dy = -0.026
            elif name == "mouthOpen" and lower:
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
