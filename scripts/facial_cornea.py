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


def _mesh_normals(positions, indices):
    """Area-weighted vertex normals for the actual triangulated corneal film.

    Compute rest and deformed normals with the same topology. This prevents
    blink/gaze morphs from moving the surface while its specular normals stay
    frozen; the untouched eye receives exactly zero normal displacement.
    """
    accum = [[0.0, 0.0, 0.0] for _ in positions]
    for (a,), (b,), (c,) in zip(*[iter(indices)] * 3):
        p, q, r = positions[a], positions[b], positions[c]
        ux, uy, uz = (q[i] - p[i] for i in range(3))
        vx, vy, vz = (r[i] - p[i] for i in range(3))
        cross = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        for index in (a, b, c):
            for axis in range(3):
                accum[index][axis] += cross[axis]
    normals = []
    for nx, ny, nz in accum:
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        if length < 1e-12 or nz <= 0:
            raise ValueError("Degenerate or reversed corneal surface")
        normals.append((nx / length, ny / length, nz / length))
    return normals

def build_cornea_geometry(head_joint):
    if type(head_joint) is not int or not 0 <= head_joint < 256:
        raise ValueError("Head joint must fit UNSIGNED_BYTE JOINTS_0")

    positions, indices, owners = [], [], []

    def vertex(side, radius, angle):
        x = side * EYE_X + HALF_WIDTH * radius * math.cos(angle)
        y = CENTER_Y + HALF_HEIGHT * radius * math.sin(angle)
        z = BASE_Z + DOME_DEPTH * (1.0 - radius * radius)
        positions.append((x, y, z))
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

    normals = _mesh_normals(positions, indices)
    targets, normal_targets = [], []
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
        moved = [tuple(p[axis] + delta[axis] for axis in range(3))
                 for p, delta in zip(positions, deltas)]
        deformed_normals = _mesh_normals(moved, indices)
        normal_targets.append([
            tuple(after[axis] - before[axis] for axis in range(3))
            for before, after in zip(normals, deformed_normals)
        ])

    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "joints": [(head_joint, 0, 0, 0)] * len(positions),
        "weights": [(1.0, 0.0, 0.0, 0.0)] * len(positions),
        "names": TARGET_NAMES,
        "targets": targets,
        "normal_targets": normal_targets,
    }
