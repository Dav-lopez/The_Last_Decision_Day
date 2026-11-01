#!/usr/bin/env python3
"""Slim the Poly Haven prop GLBs (apps/web/public/models/polyhaven).

The props arrive from gltf-transform already quantized, but the porch plant
alone weighed 1.68 MB: its terracotta pot and soil had 59,000 triangles for an
object that is 20 cm wide on screen. This repacker, which needs only numpy and
Pillow (no meshopt, no npm), does three things:

1. **Simplifies dense meshes** (per-slot budget in SIMPLIFY) with quadric-error
   half-edge collapses. Collapses never move a vertex (it merges into a
   neighbour), never touch open borders or UV/normal seams, and never flip a
   triangle, so the silhouette, the texture layout and the shading stay put.
   The error ceiling is in millimetres of the real-world size.
2. **Packs normals into 8 bits** (KHR_mesh_quantization allows a normalized
   BYTE normal; Babylon decodes it natively), positions and UVs stay 16-bit,
   every attribute gets its own tightly packed bufferView, vertices are
   renumbered in first-use order (better gzip and vertex-cache locality).
3. **Cuts textures** for small props (TEXTURE_SIZE) with Lanczos resampling,
   re-encoded as WebP.

`report()` prints triangle counts and the worst geometric deviation (each
removed vertex's distance to the simplified surface) so a regression is visible
when the props are rebuilt. The manifest's `bytes` entries are updated.

Usage: python scripts/slim_props.py [--check] apps/web/public/models/polyhaven
"""
import heapq
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# slot -> (max deviation in metres, minimum fraction of triangles kept)
SIMPLIFY = {"plant": (0.003, 0.2)}
# slot -> longest texture edge in pixels (porch plants are small on screen)
TEXTURE_SIZE = {"plant": 512}
WEBP_QUALITY = 82
BYTE, UBYTE, SHORT, USHORT, UINT, FLOAT = 5120, 5121, 5122, 5123, 5125, 5126
DTYPES = {BYTE: np.int8, UBYTE: np.uint8, SHORT: np.int16, USHORT: np.uint16, UINT: np.uint32, FLOAT: np.float32}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def read_glb(data):
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    blen = struct.unpack_from("<I", data, 20 + jlen)[0]
    return doc, data[28 + jlen:28 + jlen + blen]


def write_glb(doc, binary):
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(text), 0x4E4F534A) + text
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def read_accessor(doc, binary, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    dtype = np.dtype(DTYPES[acc["componentType"]])
    width = WIDTH[acc["type"]]
    stride = view.get("byteStride", dtype.itemsize * width)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    rows = np.frombuffer(binary, np.uint8, count=stride * acc["count"] if acc["count"] else 0, offset=start) \
        if start + stride * acc["count"] <= len(binary) else \
        np.frombuffer(binary + b"\0" * stride, np.uint8, count=stride * acc["count"], offset=start)
    rows = rows.reshape(acc["count"], stride)[:, :dtype.itemsize * width]
    return np.ascontiguousarray(rows).view(dtype).reshape(acc["count"], width)


def dequantize(acc, values):
    if not acc.get("normalized"):
        return values.astype(np.float64)
    limit = {BYTE: 127.0, UBYTE: 255.0, SHORT: 32767.0, USHORT: 65535.0}[acc["componentType"]]
    return np.maximum(values.astype(np.float64) / limit, -1.0)


# ----------------------------------------------------------------- simplify --

def face_quadrics(points, faces):
    a, b, c = (points[faces[:, i]] for i in range(3))
    normal = np.cross(b - a, c - a)
    double_area = np.linalg.norm(normal, axis=1)
    unit = normal / np.maximum(double_area, 1e-30)[:, None]
    plane = np.hstack([unit, -(unit * a).sum(1, keepdims=True)])
    return np.einsum("fi,fj->fij", plane, plane), unit


def simplify(points, wedge_of, faces, max_error, min_keep):
    """Half-edge collapse simplification on welded positions.

    points: (P,3) welded positions; wedge_of: (V,) position index of each
    original vertex; faces: (F,3) original vertex indices. Returns the kept
    faces (original vertex indices, remapped to surviving wedges).
    """
    corner_pos = wedge_of[faces]
    quadric, unit = face_quadrics(points, corner_pos)
    q = np.zeros((len(points), 4, 4))
    for i in range(3):
        np.add.at(q, corner_pos[:, i], quadric)

    # Lock open borders (welded edges with one face) and seams (a position with
    # more than one wedge): collapsing those would open cracks or smear UVs.
    edges = np.sort(np.concatenate([corner_pos[:, [0, 1]], corner_pos[:, [1, 2]], corner_pos[:, [2, 0]]]), axis=1)
    keys, counts = np.unique(edges[:, 0] * len(points) + edges[:, 1], return_counts=True)
    locked = np.zeros(len(points), bool)
    border = keys[counts != 2]
    locked[border // len(points)] = True
    locked[border % len(points)] = True
    wedges_per_pos = np.bincount(wedge_of, minlength=len(points))
    locked |= wedges_per_pos != 1

    faces = faces.copy()
    alive = np.ones(len(faces), bool)
    pos_faces = [[] for _ in points]
    for f, tri in enumerate(corner_pos):
        for p in tri:
            pos_faces[p].append(f)
    target = max(int(len(faces) * min_keep), 1)
    face_count = len(faces)
    removed = []  # (position, merged into)
    homog = np.hstack([points, np.ones((len(points), 1))])
    limit = max_error ** 2

    def cost(src, dst):
        v = homog[dst]
        return float(v @ (q[src] + q[dst]) @ v)

    heap = []
    interior = keys[counts == 2]
    for a, b in zip((interior // len(points)).tolist(), (interior % len(points)).tolist()):
        for src, dst in ((a, b), (b, a)):
            if not locked[src]:
                heap.append((cost(src, dst), int(src), int(dst)))
    heapq.heapify(heap)
    merged = np.arange(len(points))
    version = np.zeros(len(points), int)
    stamp = {}

    while heap and face_count > target:
        err, src, dst = heapq.heappop(heap)
        if err > limit:
            break
        if merged[src] != src or merged[dst] != dst or stamp.get((src, dst), 0) != version[src] + version[dst]:
            continue
        src_faces = [f for f in pos_faces[src] if alive[f]]
        shared = [f for f in src_faces if dst in corner_pos[f]]
        if not shared:
            continue
        # Link condition: the edge's two faces are the only ones touching both ends' common neighbours.
        ring = lambda p: {int(x) for f in pos_faces[p] if alive[f] for x in corner_pos[f]} - {p}
        if len(ring(src) & ring(dst)) != len(shared):
            continue
        ok = True
        for f in src_faces:
            if f in shared:
                continue
            tri = corner_pos[f].copy()
            tri[tri == src] = dst
            n = np.cross(points[tri[1]] - points[tri[0]], points[tri[2]] - points[tri[0]])
            length = np.linalg.norm(n)
            if length < 1e-14 or float(n @ unit[f]) / length < 0.3:
                ok = False
                break
        if not ok:
            continue
        # Remap src's wedges onto the matching wedge of dst (src is not a seam, so it has one).
        for f in shared:
            alive[f] = False
            face_count -= 1
        dst_wedge = None
        for f in pos_faces[dst]:
            if alive[f]:
                dst_wedge = faces[f][list(corner_pos[f]).index(dst)]
                break
        if dst_wedge is None:
            for f in shared:
                alive[f] = True
                face_count += 1
            continue
        for f in src_faces:
            if f in shared:
                continue
            k = list(corner_pos[f]).index(src)
            corner_pos[f][k] = dst
            faces[f][k] = dst_wedge
            pos_faces[dst].append(f)
        merged[src] = dst
        removed.append((src, dst))
        q[dst] += q[src]
        version[dst] += 1
        for p in ring(dst):
            for a, b in ((p, dst), (dst, p)):
                if not locked[a] and merged[a] == a and merged[b] == b:
                    stamp[(a, b)] = version[a] + version[b]
                    heapq.heappush(heap, (cost(a, b), a, b))
    return faces[alive], removed


def deviation(points, kept_pos_faces, removed):
    """Worst distance from each removed position to the nearest kept triangle plane within its old ring."""
    if not removed:
        return 0.0
    tris = points[kept_pos_faces]
    centres = tris.mean(1)
    worst = 0.0
    for src, _ in removed[:: max(1, len(removed) // 400)]:
        near = np.argsort(((centres - points[src]) ** 2).sum(1))[:48]
        best = min(point_triangle_distance(points[src], tris[i]) for i in near)
        worst = max(worst, best)
    return worst


def point_triangle_distance(p, tri):
    a, b, c = tri
    ab, ac, ap = b - a, c - a, p - a
    n = np.cross(ab, ac)
    nn = float(n @ n)
    if nn < 1e-30:
        return float(np.linalg.norm(ap))
    u = np.cross(ap, ac) @ n / nn
    v = np.cross(ab, ap) @ n / nn
    if u >= 0 and v >= 0 and u + v <= 1:
        return abs(float(ap @ n)) / nn ** 0.5

    def seg(p0, p1):
        d = p1 - p0
        t = np.clip((p - p0) @ d / max(float(d @ d), 1e-30), 0, 1)
        return float(np.linalg.norm(p - (p0 + t * d)))
    return min(seg(a, b), seg(b, c), seg(c, a))


# ------------------------------------------------------------------- repack --

class Packer:
    def __init__(self):
        self.binary = bytearray()
        self.views = []
        self.accessors = []

    def add(self, array, component, kind, normalized=False, target=ARRAY_BUFFER, bounds=False):
        self.binary += b"\0" * (-len(self.binary) % 4)
        data = np.ascontiguousarray(array, DTYPES[component])
        width = WIDTH[kind]
        stride = data.dtype.itemsize * width
        padded = stride + (-stride % 4) if target == ARRAY_BUFFER else stride
        raw = data.reshape(len(data), width)
        if padded != stride:
            raw = np.hstack([raw, np.zeros((len(raw), (padded - stride) // data.dtype.itemsize), data.dtype)])
        view = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": raw.nbytes, "target": target}
        if target == ARRAY_BUFFER and padded != stride:
            view["byteStride"] = padded
        self.binary += raw.tobytes()
        self.views.append(view)
        accessor = {"bufferView": len(self.views) - 1, "componentType": component, "count": len(data), "type": kind}
        if normalized:
            accessor["normalized"] = True
        if bounds:
            accessor["min"] = data.reshape(len(data), width).min(0).tolist()
            accessor["max"] = data.reshape(len(data), width).max(0).tolist()
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def add_bytes(self, data):
        self.binary += b"\0" * (-len(self.binary) % 4)
        self.views.append({"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(data)})
        self.binary += data
        return len(self.views) - 1


def node_scale(doc, mesh_index):
    for node in doc["nodes"]:
        if node.get("mesh") == mesh_index:
            return float(np.max(node.get("scale", [1, 1, 1])))
    return 1.0


def slim_file(path, slot, check=False):
    doc, binary = read_glb(path.read_bytes())
    # Simplification is lossy, so it runs once: the marker makes reruns a pure repack.
    extras = doc.setdefault("asset", {}).setdefault("extras", {})
    first_pass = "slimProps" not in extras
    packer = Packer()
    stats = []
    for mesh_index, mesh in enumerate(doc["meshes"]):
        for prim in mesh["primitives"]:
            attrs = {name: read_accessor(doc, binary, idx) for name, idx in prim["attributes"].items()}
            faces = read_accessor(doc, binary, prim["indices"]).reshape(-1, 3).astype(np.int64)
            before = len(faces)
            pos_acc = doc["accessors"][prim["attributes"]["POSITION"]]
            if first_pass and slot in SIMPLIFY:
                max_error, min_keep = SIMPLIFY[slot]
                points, wedge_of = np.unique(attrs["POSITION"], axis=0, return_inverse=True)
                wedge_of = wedge_of.ravel()
                welded = dequantize(pos_acc, points) * node_scale(doc, mesh_index)
                faces, removed = simplify(welded, wedge_of, faces, max_error, min_keep)
                worst = deviation(welded, wedge_of[faces], removed)
            else:
                worst = 0.0
            # Renumber vertices in first-use order and drop unused ones.
            order, first = np.unique(faces.ravel(), return_index=True)
            used = order[np.argsort(first)]
            remap = np.full(len(attrs["POSITION"]), -1, np.int64)
            remap[used] = np.arange(len(used))
            faces = remap[faces]
            index_type = USHORT if len(used) < 65536 else UINT
            new_attrs = {}
            for name, values in attrs.items():
                acc = doc["accessors"][prim["attributes"][name]]
                values = values[used]
                component, normalized = acc["componentType"], acc.get("normalized", False)
                if name == "NORMAL":
                    unit = dequantize(acc, values)
                    unit /= np.maximum(np.linalg.norm(unit, axis=1, keepdims=True), 1e-12)
                    values, component, normalized = np.round(unit * 127), BYTE, True
                new_attrs[name] = packer.add(values, component, acc["type"], normalized, bounds=name == "POSITION")
            prim["attributes"] = new_attrs
            prim["indices"] = packer.add(faces.ravel(), index_type, "SCALAR", target=ELEMENT_ARRAY_BUFFER)
            stats.append((mesh.get("name", mesh_index), before, len(faces), worst))
    for image in doc.get("images", []):
        view = doc["bufferViews"][image["bufferView"]]
        data = binary[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]
        edge = TEXTURE_SIZE.get(slot) if first_pass else None
        if edge:
            picture = Image.open(io.BytesIO(data))
            if max(picture.size) > edge:
                ratio = edge / max(picture.size)
                picture = picture.resize((round(picture.width * ratio), round(picture.height * ratio)), Image.LANCZOS)
                out = io.BytesIO()
                picture.save(out, "WEBP", quality=WEBP_QUALITY, method=6)
                data = out.getvalue()
        image["bufferView"] = packer.add_bytes(bytes(data))
    if first_pass:
        extras["slimProps"] = {"maxErrorMetres": SIMPLIFY.get(slot, (0,))[0], "textureSize": TEXTURE_SIZE.get(slot)}
    doc["accessors"] = packer.accessors
    doc["bufferViews"] = packer.views
    doc["buffers"] = [{"byteLength": len(packer.binary) + (-len(packer.binary) % 4)}]
    out = write_glb(doc, bytes(packer.binary))
    if not check:
        path.write_bytes(out)
    return len(out), stats


def main(argv):
    check = "--check" in argv
    folder = Path(next(a for a in argv if not a.startswith("--")))
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    total_before = total_after = 0
    for asset in manifest["assets"]:
        path = folder / asset["file"]
        before = path.stat().st_size
        after, stats = slim_file(path, asset["slot"], check)
        total_before += before
        total_after += after
        asset["bytes"] = after
        detail = ", ".join(f"{name}: {a}→{b} tris (worst {err * 1000:.2f} mm)" for name, a, b, err in stats)
        print(f"{asset['file']}: {before:,} → {after:,} bytes; {detail}")
    print(f"total {total_before:,} → {total_after:,} bytes")
    if not check:
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
