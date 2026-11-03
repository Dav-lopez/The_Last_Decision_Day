#!/usr/bin/env python3
"""Slim the generated character GLBs (human.glb, human-female.glb) without touching the face.

The two bodies were ~1.65 MB each, and almost half of that was float32 skin weights and
normals on the outfit, the six hairstyles and their fibre overlays. This repacker, pure
Python like build-character.py (no numpy, no npm), does two lossless-to-the-eye things:

1. **Skin weights become 8-bit** (core glTF allows a normalized UNSIGNED_BYTE WEIGHTS_0).
   Each vertex's four weights are rounded by largest remainder so they still sum to
   exactly 255 (= 1.0): no vertex drifts off its bones.
2. **Normals become 8-bit** (KHR_mesh_quantization allows a normalized BYTE NORMAL,
   padded to a 4-byte stride; Babylon decodes it natively, as for the Poly Haven props).
   The worst angular error is about 0.5 degrees.

Meshes with morph targets and the facial surfaces are left exactly as generated: their
float normals and weights are part of the facial-asset contract (release parity checks
float NORMAL deltas and head-only weights). Positions stay float, because skinned meshes
ignore node transforms, so they cannot be quantized without rebasing the skeleton.

Running it twice is a no-op. build-character.py calls `slim_glb` before hashing, and
`python scripts/slim_character.py` repacks the checked-in files and their manifests.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

MODELS = Path(__file__).resolve().parents[1] / "apps/web/public/models"
FILES = {"human.glb": "human.source.json", "human-female.glb": "human-female.source.json"}
FACE_MESHES = {
    "Student eyes", "Student eyebrows",
    "Student expressive lips", "Student oral cavity", "Student upper teeth",
    "Student tongue", "Student lower teeth", "Student expressive cheeks", "Student sculpted nose",
    "Student sculpted ears", "Student eyebrow fibres", "Student nasolabial folds", "Student eyelid rims",
    "Student corneal shells", "Student tear Left", "Student tear Right", "Student sweat Left", "Student sweat Right",
}
BYTE, UBYTE, USHORT, FLOAT = 5120, 5121, 5123, 5126
EXTENSION = "KHR_mesh_quantization"
MODIFICATION = ("Pack outfit and hair skin weights (8-bit, sums kept at exactly 1) and normals "
                "(8-bit, KHR_mesh_quantization); facial surfaces stay float.")


def read_glb(raw):
    json_length = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_length])
    bin_length = struct.unpack_from("<I", raw, 20 + json_length)[0]
    return doc, raw[28 + json_length:28 + json_length + bin_length]


def write_glb(doc, binary):
    binary = bytes(binary) + b"\0" * (-len(binary) % 4)
    doc["buffers"] = [{"byteLength": len(binary)}]
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    return (struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(binary))
            + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def float_rows(doc, binary, index, width):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    stride = view.get("byteStride", 4 * width)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return [struct.unpack_from("<" + "f" * width, binary, start + i * stride) for i in range(acc["count"])]


def quantize_weights(row):
    """Four float weights -> four bytes summing to exactly 255 (largest remainder)."""
    total = sum(max(0.0, w) for w in row)
    if total <= 0:
        return (255, 0, 0, 0)
    scaled = [max(0.0, w) / total * 255 for w in row]
    out = [math.floor(v) for v in scaled]
    for i in sorted(range(4), key=lambda i: scaled[i] - out[i], reverse=True)[:255 - sum(out)]:
        out[i] += 1
    return tuple(out)


def quantize_normal(row):
    length = math.sqrt(sum(c * c for c in row)) or 1.0
    return tuple(max(-127, min(127, round(c / length * 127))) for c in row)


def slim_glb(raw):
    """Returns the slimmed GLB bytes (unchanged input if there is nothing left to pack)."""
    doc, binary = read_glb(raw)
    replace = {}  # accessor index -> (bytes, componentType, byteStride or None)
    for mesh in doc["meshes"]:
        if mesh.get("name") in FACE_MESHES or any(p.get("targets") for p in mesh["primitives"]):
            continue
        for prim in mesh["primitives"]:
            attrs = prim["attributes"]
            weights, normals = attrs.get("WEIGHTS_0"), attrs.get("NORMAL")
            if weights is not None and weights not in replace and doc["accessors"][weights]["componentType"] == FLOAT:
                rows = [quantize_weights(r) for r in float_rows(doc, binary, weights, 4)]
                replace[weights] = (b"".join(struct.pack("<4B", *r) for r in rows), UBYTE, None)
            if normals is not None and normals not in replace and doc["accessors"][normals]["componentType"] == FLOAT:
                rows = [quantize_normal(r) for r in float_rows(doc, binary, normals, 3)]
                replace[normals] = (b"".join(struct.pack("<3bx", *r) for r in rows), BYTE, 4)
    if not replace:
        return raw
    views_of = {}
    for index, acc in enumerate(doc["accessors"]):
        views_of.setdefault(acc.get("bufferView"), []).append(index)
    out = bytearray()
    for view_index, view in enumerate(doc["bufferViews"]):
        owners = views_of.get(view_index, [])
        out += b"\0" * (-len(out) % 4)
        start = view.get("byteOffset", 0)
        data = binary[start:start + view["byteLength"]]
        if len(owners) == 1 and owners[0] in replace:
            acc = doc["accessors"][owners[0]]
            data, component, stride = replace[owners[0]]
            acc["componentType"], acc["normalized"] = component, True
            acc.pop("byteOffset", None)
            view.pop("byteStride", None)
            if stride:
                view["byteStride"] = stride
        view["byteOffset"], view["byteLength"] = len(out), len(data)
        out += data
    for key in ("extensionsUsed", "extensionsRequired"):
        doc[key] = sorted(set(doc.get(key, [])) | {EXTENSION})
    return write_glb(doc, out)


def update_manifest(path, raw):
    manifest = json.loads(path.read_text())
    manifest["output"]["bytes"] = len(raw)
    manifest["output"]["sha256"] = hashlib.sha256(raw).hexdigest()
    if MODIFICATION not in manifest.get("modifications", []):
        manifest.setdefault("modifications", []).append(MODIFICATION)
    path.write_text(json.dumps(manifest, indent=2) + "\n")


def main(argv):
    folder = Path(argv[1]) if len(argv) > 1 else MODELS
    for name, manifest in FILES.items():
        path = folder / name
        before = path.read_bytes()
        after = slim_glb(before)
        path.write_bytes(after)
        update_manifest(folder / manifest, after)
        print(f"{name}: {len(before):,} -> {len(after):,} bytes")


if __name__ == "__main__":
    main(sys.argv)
