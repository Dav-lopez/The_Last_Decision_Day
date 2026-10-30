"""Small, skinned 3D hair-fibre ridges sampled from licensed hairstyle triangles.

No procedural randomness or external dependencies: each style yields a bounded,
repeatable overlay that shares its source skinning and customizable hair material.
The ribbons follow the source hair surface rather than assuming one scalp shape.
"""
import math

MAX_STRANDS = 112


def _unit(v):
    length = math.sqrt(sum(x * x for x in v))
    return tuple(x / length for x in v) if length > 1e-12 else None


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def _weighted_skin(triangle, joints, weights):
    influence = {}
    for vertex in triangle:
        for joint, weight in zip(joints[vertex], weights[vertex]):
            if weight > 0:
                influence[int(joint)] = influence.get(int(joint), 0.0) + weight / 3
    top = sorted(influence.items(), key=lambda item: (-item[1], item[0]))[:4]
    total = sum(weight for _, weight in top)
    if total <= 0:
        raise ValueError('Hair triangle has no valid skin weights')
    return (tuple(joint for joint, _ in top) + (0,) * (4-len(top)),
            tuple(weight / total for _, weight in top) + (0.0,) * (4-len(top)))


def build_hair_detail(positions, normals, indices, joints, weights, *, max_strands=MAX_STRANDS):
    """Return a capped glTF-ready overlay or None for an empty/degenerate mesh.

    Input joints are already remapped to the destination skeleton. Source
    triangles and their skin weights are preserved; no new joint is introduced.
    """
    if type(max_strands) is not int or not 1 <= max_strands <= 512:
        raise ValueError('max_strands must be between 1 and 512')
    count = len(positions)
    if not (len(normals) == len(joints) == len(weights) == count):
        raise ValueError('Hair attributes have inconsistent vertex counts')
    if len(indices) % 3:
        raise ValueError('Hair indices must contain complete triangles')
    if any(type(i) is not int or not 0 <= i < count for i in indices):
        raise ValueError('Hair index out of range')
    if any(len(row) != 4 for row in joints) or any(len(row) != 4 for row in weights):
        raise ValueError('Hair skin attributes must be VEC4')
    if any(not all(math.isfinite(float(x)) for x in row) for row in positions):
        raise ValueError('Hair positions must be finite')
    if any(not all(math.isfinite(float(x)) for x in row) for row in normals):
        raise ValueError('Hair normals must be finite')
    if any(not all(math.isfinite(float(x)) and float(x) >= 0 for x in row) for row in weights):
        raise ValueError('Hair weights must be finite and nonnegative')
    if any(not all(type(x) is int and 0 <= x < 256 for x in row) for row in joints):
        raise ValueError('Hair joints must fit glTF UNSIGNED_BYTE')

    out = {key: [] for key in ('positions', 'normals', 'indices', 'joints', 'weights')}
    triangles = len(indices) // 3
    if not triangles:
        return None
    stride = max(1, math.ceil(triangles / max_strands))
    for t in range(0, triangles, stride):
        tri = indices[t*3:t*3+3]
        a, b, c = (positions[i] for i in tri)
        cross = _cross(_sub(b, a), _sub(c, a))
        face = _unit(cross)
        if face is None or math.sqrt(sum(v*v for v in cross)) < 1e-8:
            continue
        avg = _unit(tuple(sum(normals[i][k] for i in tri) for k in range(3)))
        # Trust source winding when smoothing normals are absent or reversed.
        surface = _unit(tuple(face[k] + avg[k] for k in range(3))) if avg and sum(face[k]*avg[k] for k in range(3)) > 0.2 else face
        start = tuple(.65*a[k] + .20*b[k] + .15*c[k] for k in range(3))
        end = tuple(.15*a[k] + .40*b[k] + .45*c[k] for k in range(3))
        along = _sub(end, start)
        length = math.sqrt(sum(v*v for v in along))
        if length < 0.003:
            continue
        tangent = _unit(along)
        side = _unit(_cross(surface, tangent))
        if side is None:
            continue
        width = min(0.0015, length * 0.095)
        skin_joints, skin_weights = _weighted_skin(tri, joints, weights)
        base = len(out['positions'])
        for fraction, taper, lift in ((0, .48, .0011), (.52, 1, .0023), (1, .12, .0011)):
            center = tuple(start[k] + fraction * along[k] for k in range(3))
            for sign in (-1, 1):
                out['positions'].append(tuple(center[k] + sign*width*taper*side[k] + lift*surface[k] for k in range(3)))
                out['normals'].append(_unit(tuple(surface[k] + sign*.18*side[k] for k in range(3))))
                out['joints'].append(skin_joints)
                out['weights'].append(skin_weights)
        for u, v, w in ((0, 1, 2), (1, 3, 2), (2, 3, 4), (3, 5, 4)):
            p, q, r = (out['positions'][base+i] for i in (u, v, w))
            n = _cross(_sub(q, p), _sub(r, p))
            order = (u, v, w) if sum(n[k]*surface[k] for k in range(3)) > 0 else (u, w, v)
            out['indices'].extend((base+i,) for i in order)
    return out if out['positions'] else None
