"""Head-skinned convex corneal films that follow bilateral blink and gaze.

The existing eye texture stays visible beneath a shallow transparent shell.
Coordinates are in metres in the pinned Quaternius +Z-facing rest pose.
This is a stylized specular layer, not a replacement eyeball or ray-traced eye.
"""
import math

from facial_gaze import GAZE_TARGETS, gaze_delta

RINGS = 5
SEGMENTS = 24
CENTER_Y = 1.686
EYE_X = 0.052
HALF_WIDTH = 0.021
HALF_HEIGHT = 0.009
BASE_Z = 0.0928
DOME_DEPTH = 0.0038
TARGET_NAMES = ("eyeBlinkLeft", "eyeBlinkRight", *GAZE_TARGETS)


def build_cornea_geometry(head_joint):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")

    positions, normals, indices, owners = [], [], [], []

    def vertex(side, radius, angle):
        x = side * EYE_X + HALF_WIDTH * radius * math.cos(angle)
        y = CENTER_Y + HALF_HEIGHT * radius * math.sin(angle)
        z = BASE_Z + DOME_DEPTH * (1.0 - radius * radius)
        # Analytic normal for a smooth convex paraboloid.
        dx = 2 * DOME_DEPTH * radius * math.cos(angle) / HALF_WIDTH
        dy = 2 * DOME_DEPTH * radius * math.sin(angle) / HALF_HEIGHT
        norm = math.sqrt(1.0 + dx * dx + dy * dy)
        positions.append((x, y, z))
        normals.append((dx / norm, dy / norm, 1.0 / norm))
        owners.append(side)
        return len(positions) - 1

    for side in (-1, 1):
        center = vertex(side, 0.0, 0.0)
        previous = None
        for ring in range(1, RINGS + 1):
            radius = ring / RINGS
            current = [vertex(side, radius, 2 * math.pi * i / SEGMENTS)
                       for i in range(SEGMENTS)]
            for i in range(SEGMENTS):
                nxt = (i + 1) % SEGMENTS
                if previous is None:
                    indices.extend(((center,), (current[i],), (current[nxt],)))
                else:
                    indices.extend(((previous[i],), (current[i],), (current[nxt],),
                                    (previous[i],), (current[nxt],), (previous[nxt],)))
            previous = current

    targets = []
    for name in TARGET_NAMES:
        side = -1 if name.endswith("Left") else 1
        deltas = []
        for (x, y, z), owner in zip(positions, owners):
            if owner != side:
                deltas.append((0.0, 0.0, 0.0))
            elif "Blink" in name:
                # Recede behind closing lids while narrowing toward the midline.
                deltas.append((0.0, (CENTER_Y - y) * 0.88, -0.0015))
            else:
                deltas.append(gaze_delta(name, x, y, z, CENTER_Y, HALF_HEIGHT))
        targets.append(deltas)

    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": TARGET_NAMES,
        "targets": targets,
    }
