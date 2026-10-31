"""Bounded bilateral eye-gaze deltas for the pinned CC0 +Z-facing face.

Morph names encode direction (Up/Down/Left/Right), then eye side (Left/Right).
The transparent corneal film uses the same offsets as the underlying eye.
"""
import math

GAZE_TARGETS = (
    "eyeLookDownLeft", "eyeLookDownRight",
    "eyeLookUpLeft", "eyeLookUpRight",
    "eyeLookLeftLeft", "eyeLookLeftRight",
    "eyeLookRightLeft", "eyeLookRightRight",
)
EYE_CENTER_X = 0.052
EYE_HALF_WIDTH = 0.021


def gaze_delta(name, x, y, z, center_y, half_height):
    """Bounded XYZ displacement for one source eye vertex."""
    if name not in GAZE_TARGETS:
        raise ValueError(f"Unknown gaze target: {name}")
    if not all(math.isfinite(v) for v in (x, y, z, center_y, half_height)) or half_height <= 0:
        raise ValueError("Eye geometry must contain finite positions and positive height")
    side = -1 if name.endswith("Left") else 1
    if x * side <= 0:
        return (0.0, 0.0, 0.0)
    if "LookLeft" in name or "LookRight" in name:
        # The iris centre moves farther than the socket rim.
        centre_weight = max(0.0, 1.0 - abs(x - side * EYE_CENTER_X) / EYE_HALF_WIDTH)
        weight = 0.55 + 0.45 * centre_weight
        direction = -1 if "LookLeft" in name else 1
        return (direction * 0.0032 * weight, 0.0, 0.0007 * weight)
    centre_weight = max(0.0, 1.0 - abs(y - center_y) / half_height)
    weight = 0.55 + 0.45 * centre_weight
    direction = -1 if "Down" in name else 1
    return (0.0, direction * 0.0035 * weight, 0.0007 * weight)
