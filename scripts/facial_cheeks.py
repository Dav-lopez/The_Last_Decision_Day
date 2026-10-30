"""Head-skinned cheek patches with independent left/right expression targets.

Positions follow the pinned CC0 Quaternius rest-pose face and are intentionally
subtle. The patches are fully transparent at rest; the Babylon runtime fades
in a localized blush only when the character is embarrassed.
"""
import math

CHEEK_TARGETS = ("cheekSquintLeft", "cheekSquintRight")


def build_cheek_geometry(head_joint):
    """Build two curved cheek fans with head skinning and POSITION morph deltas."""
    if not isinstance(head_joint, int) or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions = []
    normals = []
    indices = []
    side_by_vertex = []
    for side in (-1, 1):
        center_x, center_y = side * 0.062, 1.649
        start = len(positions)
        # Forward-facing +Z in the licensed source. Curved edge recedes toward
        # the face to avoid a rigid planar sticker.
        positions.append((center_x, center_y, 0.082))
        side_by_vertex.append(side)
        normals.append((0.0, 0.0, 1.0))
        for i in range(8):
            angle = 2 * math.pi * i / 8
            dx, dy = 0.025 * math.cos(angle), 0.016 * math.sin(angle)
            positions.append((center_x + dx, center_y + dy, 0.077 - 0.002 * abs(math.cos(angle))))
            side_by_vertex.append(side)
            normals.append((0.0, 0.0, 1.0))
        for i in range(8):
            # Winding faces +Z so alpha-blended blush is visible from the front.
            indices.extend(((start,), (start + 1 + i,), (start + 1 + (i + 1) % 8,)))
    targets = []
    for name in CHEEK_TARGETS:
        active_side = -1 if name.endswith("Left") else 1
        deltas = []
        for index, (_x, y, _z) in enumerate(positions):
            if side_by_vertex[index] != active_side:
                deltas.append((0.0, 0.0, 0.0))
                continue
            # Happy cheek raise and squint: lift the cheek softly toward the
            # lower eyelid without moving the opposite cheek.
            height_factor = max(0.0, min(1.0, (y - 1.633) / 0.032))
            deltas.append((0.0, 0.003 + 0.004 * height_factor, 0.0015))
        targets.append(deltas)
    return {
        "positions": positions,
        "normals": normals,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "indices": indices,
        "names": CHEEK_TARGETS,
        "targets": targets,
    }
