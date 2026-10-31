"""Subtle head-skinned 3D nose surface for the pinned Quaternius rest pose.

The neutral nose keeps its existing sculpted shape. Two independent nasal-bridge
scrunch morphs respond to the already-authored left/right brow-down expressions,
so angry expressions move real skin geometry instead of a texture decal.
"""
import math

COLUMNS = 11
ROWS = 11
MIN_Y = 1.625
MAX_Y = 1.676
HALF_WIDTH = 0.031
NOSE_TARGETS = ("browDownLeft", "browDownRight")


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


def _scrunch(x, y, side):
    """Localized millimetre-scale bridge compression; zero at the patch seam.

    A squared sine envelope makes both the centre seam and outer perimeter
    continuous at zero displacement, preventing a visible split between sides.
    """
    if x * side <= 0 or abs(x) >= HALF_WIDTH or y <= MIN_Y or y >= MAX_Y:
        return (0.0, 0.0, 0.0)
    across = math.sin(math.pi * abs(x) / HALF_WIDTH) ** 2
    along = math.sin(math.pi * (y - MIN_Y) / (MAX_Y - MIN_Y)) ** 2
    local = math.exp(-((abs(x) - 0.014) / 0.012) ** 2
                     - ((y - 1.657) / 0.012) ** 2)
    weight = across * along * local
    return (-side * 0.0010 * weight, -0.0006 * weight, 0.0026 * weight)


def _normal(x, y, side=None):
    """Finite-difference heightfield normal, including the expression relief."""
    h = 0.0001
    def height(px, py):
        return _height(px, py) + (_scrunch(px, py, side)[2] if side is not None else 0.0)
    dzdx = (height(x + h, y) - height(x - h, y)) / (2 * h)
    dzdy = (height(x, y + h) - height(x, y - h)) / (2 * h)
    length = math.sqrt(1 + dzdx * dzdx + dzdy * dzdy)
    return (-dzdx / length, -dzdy / length, 1 / length)


def build_nose_geometry(head_joint):
    """Return skinned neutral geometry and bilateral POSITION/NORMAL morphs."""
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")
    positions, normals, indices = [], [], []
    for row in range(ROWS):
        y = MIN_Y + (MAX_Y - MIN_Y) * row / (ROWS - 1)
        for col in range(COLUMNS):
            x = -HALF_WIDTH + 2 * HALF_WIDTH * col / (COLUMNS - 1)
            positions.append((x, y, _height(x, y)))
            normals.append(_normal(x, y))
    for row in range(ROWS - 1):
        for col in range(COLUMNS - 1):
            a = row * COLUMNS + col
            b = a + 1
            c = a + COLUMNS
            d = c + 1
            indices.extend(((a,), (b,), (c,), (b,), (d,), (c,)))

    targets, normal_targets = [], []
    for side in (-1, 1):
        targets.append([_scrunch(x, y, side) for x, y, _ in positions])
        normal_targets.append([
            tuple(morphed - rest for morphed, rest in zip(_normal(x, y, side), neutral))
            for (x, y, _), neutral in zip(positions, normals)
        ])
    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": NOSE_TARGETS,
        "targets": targets,
        "normal_targets": normal_targets,
    }
