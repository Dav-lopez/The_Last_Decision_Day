"""Subtle head-skinned 3D nose surface for the pinned Quaternius rest pose.

This is authored geometry (not a texture sticker). Coordinates use the CC0
character's +Z-facing local rest pose, measured in metres. The bridge and tip
rise smoothly above the face; the perimeter tapers back into the head.
"""
import math

COLUMNS = 11
ROWS = 11
MIN_Y = 1.625
MAX_Y = 1.676
HALF_WIDTH = 0.031


def _height(x, y):
    # A narrow bridge and wider, rounder tip. Both fade into the perimeter
    # so the patch doesn't end as a sharp vertical wall.
    u = x / HALF_WIDTH
    v = (y - MIN_Y) / (MAX_Y - MIN_Y)
    edge = max(0.0, 1.0 - u * u) ** 2 * max(0.0, math.sin(math.pi * v)) ** 0.7
    bridge = 0.016 * math.exp(-((x / 0.012) ** 2))
    tip = 0.013 * math.exp(-((x / 0.019) ** 2 + ((y - 1.637) / 0.010) ** 2))
    nostril_wings = 0.003 * (
        math.exp(-(((x - 0.018) / 0.008) ** 2 + ((y - 1.634) / 0.006) ** 2))
        + math.exp(-(((x + 0.018) / 0.008) ** 2 + ((y - 1.634) / 0.006) ** 2))
    )
    return 0.078 + edge * (bridge + tip + nostril_wings)


def build_nose_geometry(head_joint):
    """Return glTF POSITION/NORMAL/JOINTS/WEIGHTS and front-facing triangles."""
    if not isinstance(head_joint, int) or isinstance(head_joint, bool) or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions, normals, indices = [], [], []
    for row in range(ROWS):
        y = MIN_Y + (MAX_Y - MIN_Y) * row / (ROWS - 1)
        for col in range(COLUMNS):
            x = -HALF_WIDTH + 2 * HALF_WIDTH * col / (COLUMNS - 1)
            z = _height(x, y)
            positions.append((x, y, z))
            # The heightfield normal points forward (+Z); use symmetric
            # finite differences for a continuous, unit-length smooth normal.
            h = 0.0001
            dzdx = (_height(x + h, y) - _height(x - h, y)) / (2 * h)
            dzdy = (_height(x, y + h) - _height(x, y - h)) / (2 * h)
            length = math.sqrt(1 + dzdx * dzdx + dzdy * dzdy)
            normals.append((-dzdx / length, -dzdy / length, 1 / length))
    for row in range(ROWS - 1):
        for col in range(COLUMNS - 1):
            a = row * COLUMNS + col
            b = a + 1
            c = a + COLUMNS
            d = c + 1
            indices.extend(((a,), (b,), (c,), (b,), (d,), (c,)))
    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
    }
