"""Subtle bilateral eye-gaze morph deltas for the pinned CC0 face mesh.

The source eyes face +Z. This shifts each eye surface a few millimetres
inside its socket rather than rotating the whole head or moving both eyes.
"""
import math

GAZE_TARGETS = (
    "eyeLookDownLeft", "eyeLookDownRight",
    "eyeLookUpLeft", "eyeLookUpRight",
)


def gaze_delta(name, x, y, z, center_y, half_height):
    """Return a bounded XYZ displacement for one source eye vertex."""
    if name not in GAZE_TARGETS:
        raise ValueError(f"Unknown gaze target: {name}")
    if not all(math.isfinite(v) for v in (x, y, z, center_y, half_height)) or half_height <= 0:
        raise ValueError("Eye geometry must contain finite positions and positive height")
    side = -1 if name.endswith("Left") else 1
    if x * side <= 0:
        return (0.0, 0.0, 0.0)
    # Keep the outer eye contour close to the original socket while moving
    # the center of the visible eye more, so the mesh does not translate rigidly.
    center_weight = max(0.0, 1.0 - abs(y - center_y) / half_height)
    weight = 0.55 + 0.45 * center_weight
    direction = -1 if "Down" in name else 1
    return (0.0, direction * 0.0035 * weight, 0.0007 * weight)
