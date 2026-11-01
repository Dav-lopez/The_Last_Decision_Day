"""Head-skinned, rounded upper/lower lip ribbons with expression morph normals.

Each lip has three cross-section rows: outer edge, raised vermilion ridge,
inner edge. The two lips remain disconnected so jawOpen reveals the recessed
oral cavity. Coordinates use the pinned Quaternius +Z-facing rest pose (metres).
"""
import math

MOUTH_TARGETS = (
    "mouthSmileLeft", "mouthSmileRight",
    "mouthFrownLeft", "mouthFrownRight",
    "mouthPressLeft", "mouthPressRight",
    "jawOpen", "mouthOpen",
)
XS = (-0.042, -0.021, 0.0, 0.021, 0.042)
# (height, forward relief). Raised midrows produce a curved, light-catching
# lip surface; inner edges stay behind the ridge to preserve oral depth.
ROWS = ((1.618, 0.0005), (1.6125, 0.0035), (1.607, 0.0),
        (1.603, 0.0), (1.598, 0.0030), (1.593, 0.0005))


def _normals(positions):
    """Surface normals from tangents, without smoothing across the lip gap."""
    normals = []
    width = len(XS)
    for row in range(len(ROWS)):
        start = 0 if row < 3 else 3
        local = row - start
        upper = start + max(0, local - 1)
        lower = start + min(2, local + 1)
        for col in range(width):
            left, right = max(0, col - 1), min(width - 1, col + 1)
            a, b = positions[row * width + left], positions[row * width + right]
            u, d = positions[upper * width + col], positions[lower * width + col]
            tx = tuple(b[k] - a[k] for k in range(3))
            ty = tuple(u[k] - d[k] for k in range(3))
            n = (tx[1] * ty[2] - tx[2] * ty[1],
                 tx[2] * ty[0] - tx[0] * ty[2],
                 tx[0] * ty[1] - tx[1] * ty[0])
            length = math.sqrt(sum(v * v for v in n))
            if length <= 1e-12:
                raise ValueError("Degenerate lip tangent")
            normals.append(tuple(v / length for v in n))
    return normals


def build_mouth_geometry(head_joint):
    """Return curved lips with bilateral POSITION and NORMAL morph deltas."""
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions = [
        (x, y, 0.083 + 0.016 * (1 - abs(x) / XS[-1]) + relief * (1 - (abs(x) / XS[-1]) ** 2))
        for y, relief in ROWS for x in XS
    ]
    width = len(XS)
    indices = []
    for start in (0, 3):
        for row in range(start, start + 2):
            for col in range(width - 1):
                a, b = row * width + col, row * width + col + 1
                c, d = (row + 1) * width + col, (row + 1) * width + col + 1
                indices.extend(((a,), (c,), (b,), (b,), (c,), (d,)))
    normals = _normals(positions)
    targets, normal_targets = [], []
    for name in MOUTH_TARGETS:
        deltas = []
        for i, (x, _y, _z) in enumerate(positions):
            row = i // width
            lower = row >= 3
            corner = abs(x) / XS[-1]
            side = (name.endswith("Left") and x < 0) or (name.endswith("Right") and x > 0)
            dy = dz = 0.0
            if name.startswith("mouthSmile") and side:
                dy, dz = 0.014 * corner, 0.003 * corner
            elif name.startswith("mouthFrown") and side:
                dy = -0.012 * corner
            elif name.startswith("mouthPress") and side:
                # Keep the 4 mm rest gap open even at full mouthPress weight.
                dy = 0.0015 if row == 3 else -0.0015 if row == 2 else 0.0
            elif name == "jawOpen" and lower:
                dy = -0.026
            elif name == "mouthOpen" and lower:
                dy = -0.018
            deltas.append((0.0, dy, dz))
        targets.append(deltas)
        morphed = [tuple(p[k] + d[k] for k in range(3)) for p, d in zip(positions, deltas)]
        normal_targets.append([
            tuple(after[k] - before[k] for k in range(3))
            for after, before in zip(_normals(morphed), normals)
        ])
    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": MOUTH_TARGETS,
        "targets": targets,
        "normal_targets": normal_targets,
    }
