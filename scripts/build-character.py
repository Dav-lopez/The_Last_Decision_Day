#!/usr/bin/env python3
"""Build the checked-in student GLB from pinned CC0 Quaternius source assets.

Python 3.10+, standard library only. This is an authoring tool, not a web build
step: the game ships the resulting self-contained GLB and never fetches sources.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import tempfile
import urllib.parse
import urllib.request

from facial_mouth import build_mouth_geometry
from facial_cheeks import build_cheek_geometry

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/public/models"
SOURCE_COMMIT = "5821923af517ac5fdc82505faa92a0d575fc1b1a"
MIRROR = f"https://raw.githubusercontent.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/{SOURCE_COMMIT}/"
BASE = "Universal Base Characters[Standard]/Universal Base Characters[Standard]/"
ANIM = "Universal Animation Library[Standard]/Universal Animation Library[Standard]/"
SOURCES = {
    "body.gltf": (BASE + "Base Characters/Godot - UE/Superhero_Male_FullBody.gltf", "e7fcea214ecf8855afbf910b50de6f9c7d1decfb71ca28bad8a4481452dafeb4"),
    "body.bin": (BASE + "Base Characters/Godot - UE/Superhero_Male_FullBody.bin", "459003f9745853ae562a85506a2b94dd56515c1f37728f9fa3d2ce1a3e4cd92f"),
    "hair.gltf": (BASE + "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.gltf", "fe0f354d7f95d83d38e15c60794dcc063fa4d60550706f3d7ba51491cdc07c56"),
    "hair.bin": (BASE + "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.bin", "ecd7c81959f3985d6254458a440daaaa18a8bfbb1dbe111c68a04a72374d54db"),
    "eyes.png": (BASE + "Base Characters/Godot - UE/T_Eye_Brown.png", "d08e3356a83211bc6ca21fe3a8e39f4b5c1a3b8f85457fc2c0fb57be09935025"),
    "animations.glb": (ANIM + "Unreal-Godot/UAL1_Standard.glb", "69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997"),
    "character-license.txt": (BASE + "License_Standard.txt", "e08f717c3cfd999f4b44f2be4522b11a3ac3c0e5b6364b3a8788d25d4c90ff94"),
    "animation-license.txt": (ANIM + "License.txt", "d77329b05c4c206e76c83285ecdd1e5f2b3df2350ec80657ebdb5a706a0fc0de"),
}
COMPONENTS = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_accessor(doc, binary, index):
    a = doc["accessors"][index]
    v = doc["bufferViews"][a["bufferView"]]
    fmt, size = COMPONENTS[a["componentType"]]
    width = WIDTHS[a["type"]]
    start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = v.get("byteStride", size * width)
    return [struct.unpack_from("<" + fmt * width, binary, start + i * stride) for i in range(a["count"])]


def quat_mul(a, b):
    x, y, z, w = a
    X, Y, Z, W = b
    return (w*X + x*W + y*Z - z*Y, w*Y - x*Z + y*W + z*X,
            w*Z + x*Y - y*X + z*W, w*W - x*X - y*Y - z*Z)


def normalized(q):
    length = math.sqrt(sum(x*x for x in q))
    return tuple(x / length for x in q)


class Builder:
    def __init__(self, body):
        self.binary = bytearray()
        self.doc = {k: copy.deepcopy(body[k]) for k in ("scene", "scenes", "nodes")}
        self.doc.update(asset={"version": "2.0", "generator": "The Last Decision / build-character.py",
                               "copyright": "Quaternius, CC0-1.0; outfit adaptation by The Last Decision"},
                        buffers=[{}], bufferViews=[], accessors=[], meshes=[], skins=[], animations=[])
        self.cache = {}

    def blob(self, data, **extra):
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        index = len(self.doc["bufferViews"])
        self.doc["bufferViews"].append({"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(data), **extra})
        self.binary.extend(data)
        return index

    def accessor(self, values, kind, component=5126, *, bounds=False):
        fmt, _ = COMPONENTS[component]
        data = b"".join(struct.pack("<" + fmt * len(row), *row) for row in values)
        a = {"bufferView": self.blob(data), "componentType": component, "type": kind, "count": len(values)}
        if bounds:
            a["min"] = [min(row[c] for row in values) for c in range(WIDTHS[kind])]
            a["max"] = [max(row[c] for row in values) for c in range(WIDTHS[kind])]
        self.doc["accessors"].append(a)
        return len(self.doc["accessors"]) - 1

    def copy_accessor(self, key, doc, binary, index):
        cache_key = (key, index)
        if cache_key not in self.cache:
            a = doc["accessors"][index]
            self.cache[cache_key] = self.accessor(read_accessor(doc, binary, index), a["type"], a["componentType"], bounds="min" in a)
        return self.cache[cache_key]

    def attributes(self, key, doc, binary, primitive, uv=False):
        allowed = {"POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"} | ({"TEXCOORD_0"} if uv else set())
        return {name: self.copy_accessor(key, doc, binary, index) for name, index in primitive["attributes"].items() if name in allowed}


def build(source_dir):
    files = {}
    for name, (path, expected) in SOURCES.items():
        local = source_dir / name
        if not local.exists():
            local.write_bytes(urllib.request.urlopen(MIRROR + urllib.parse.quote(path), timeout=60).read())
        data = local.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Source checksum mismatch: {name}")
        files[name] = data

    body = json.loads(files["body.gltf"])
    hair = json.loads(files["hair.gltf"])
    alen = struct.unpack_from("<I", files["animations.glb"], 12)[0]
    animations = json.loads(files["animations.glb"][20:20+alen])
    abinary = files["animations.glb"][28+alen:]
    b = Builder(body)

    def matte(name, rgb, roughness=0.85):
        # glTF baseColorFactor is linear, not sRGB.
        rgb = [x / 12.92 if x <= .04045 else ((x+.055)/1.055)**2.4 for x in rgb]
        return {"name": name, "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": [*rgb, 1], "metallicFactor": 0, "roughnessFactor": roughness}}

    b.doc["materials"] = [matte("Student skin", [.60, .42, .31]), matte("Student jacket", [.37, .51, .85]),
                          matte("Student trousers", [.12, .17, .25]), matte("Student shoes", [.08, .10, .14]),
                          matte("Student hair", [.14, .10, .08]), matte("Student eyes", [1, 1, 1], .35)]
    b.doc["images"] = [{"name": "Quaternius brown eyes", "mimeType": "image/png", "bufferView": b.blob(files["eyes.png"])}]
    b.doc["textures"] = [{"source": 0}]
    b.doc["materials"][5]["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}

    for mi, mesh in enumerate(body["meshes"]):
        p = mesh["primitives"][0]
        attrs = b.attributes("body", body, files["body.bin"], p, uv=mi == 1)
        if mi < 2:
            prims = [{"attributes": attrs, "indices": b.copy_accessor("body", body, files["body.bin"], p["indices"]), "material": 4 if mi == 0 else 5}]
        else:
            positions = read_accessor(body, files["body.bin"], p["attributes"]["POSITION"])
            indices = [r[0] for r in read_accessor(body, files["body.bin"], p["indices"])]
            # A clothed everyday student: long sleeves, trousers and shoes.
            # Keep one continuous skin surface, preserving its original skin weights.
            groups = {i: [] for i in range(4)}
            for start in range(0, len(indices), 3):
                tri = indices[start:start+3]
                x, y, _ = [sum(positions[i][c] for i in tri)/3 for c in range(3)]
                material = 3 if y < .14 else 2 if y < .96 else 1 if y < 1.56 and abs(x) < .735 else 0
                groups[material].extend((i,) for i in tri)
            prims = [{"attributes": attrs, "indices": b.accessor(rows, "SCALAR", 5123), "material": mat} for mat, rows in groups.items() if rows]
        # Author lightweight morph targets directly on the licensed source geometry.
        # These preserve the existing skinning and animations. This is a stylized
        # facial rig, not a photorealistic head replacement.
        if mi in (0, 1):
            source_positions = read_accessor(body, files["body.bin"], p["attributes"]["POSITION"])
            ymin = min(v[1] for v in source_positions)
            ymax = max(v[1] for v in source_positions)
            mid = (ymin + ymax) / 2
            span = max(0.001, ymax - ymin)
            names = (["browInnerUp", "browDownLeft", "browDownRight"] if mi == 0
                     else ["eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "eyeWideRight", "eyeSquintLeft", "eyeSquintRight"])
            for prim in prims:
                targets = []
                for name in names:
                    deltas = []
                    for x, y, z in source_positions:
                        # Source geometry is kept intact at neutral influence.
                        side = -1 if "Left" in name else 1
                        eligible = ("Left" not in name and "Right" not in name) or x * side > 0
                        if not eligible:
                            deltas.append((0.0, 0.0, 0.0))
                        elif name.startswith("brow"):
                            shift = (0.025 if name == "browInnerUp" else -0.018)
                            deltas.append((0.0, shift, 0.0))
                        else:
                            factor = -0.88 if "Blink" in name else (-0.32 if "Squint" in name else 0.22)
                            deltas.append((0.0, (y - mid) * factor, 0.0))
                    targets.append({"POSITION": b.accessor(deltas, "VEC3")})
                prim["targets"] = targets
            mesh_extras = {"targetNames": names}
        else:
            mesh_extras = {}
        b.doc["meshes"].append({"name": ["Student eyebrows", "Student eyes", "Student outfit"][mi],
                                "primitives": prims, "extras": mesh_extras})

    skin = copy.deepcopy(body["skins"][0])
    skin["inverseBindMatrices"] = b.copy_accessor("body", body, files["body.bin"], skin["inverseBindMatrices"])
    b.doc["skins"].append(skin)

    # Hair shares the humanoid rig; remap joint indices by name into the body's skin.
    hp = hair["meshes"][0]["primitives"][0]
    hattrs = b.attributes("hair", hair, files["hair.bin"], hp)
    body_joint = {body["nodes"][node]["name"]: i for i, node in enumerate(skin["joints"])}
    hair_joints = hair["skins"][0]["joints"]
    remap = {i: body_joint[hair["nodes"][n]["name"]] for i, n in enumerate(hair_joints)}
    hattrs["JOINTS_0"] = b.accessor([tuple(remap[j] for j in row) for row in read_accessor(hair, files["hair.bin"], hp["attributes"]["JOINTS_0"])], "VEC4", 5121)
    b.doc["meshes"].append({"name": "Student parted hair", "primitives": [{"attributes": hattrs, "indices": b.copy_accessor("hair", hair, files["hair.bin"], hp["indices"]), "material": 4}]})
    b.doc["nodes"].append({"name": "Student hair", "mesh": 3, "skin": 0})
    b.doc["nodes"][body["scenes"][0]["nodes"][0]]["children"].append(len(b.doc["nodes"])-1)

    # A small mouth surface follows the Head bone and supplies actual lip
    # displacement for the expression presets. This is not a realistic head.
    if "Head" not in body_joint:
        raise ValueError("Pinned source is missing the Head skin joint")
    mouth = build_mouth_geometry(body_joint["Head"])
    lip_material = len(b.doc["materials"])
    b.doc["materials"].append(matte("Student lips", [.43, .21, .22], .64))
    mouth_attrs = {
        "POSITION": b.accessor(mouth["positions"], "VEC3", bounds=True),
        "NORMAL": b.accessor(mouth["normals"], "VEC3"),
        "JOINTS_0": b.accessor(mouth["joints"], "VEC4", 5121),
        "WEIGHTS_0": b.accessor(mouth["weights"], "VEC4"),
    }
    lip_mesh = len(b.doc["meshes"])
    b.doc["meshes"].append({
        "name": "Student expressive lips",
        "primitives": [{
            "attributes": mouth_attrs,
            "indices": b.accessor(mouth["indices"], "SCALAR", 5123),
            "material": lip_material,
            "targets": [{"POSITION": b.accessor(deltas, "VEC3")} for deltas in mouth["targets"]],
        }],
        "extras": {"targetNames": list(mouth["names"])},
    })
    b.doc["nodes"].append({"name": "Student lip surface", "mesh": lip_mesh, "skin": 0})
    b.doc["nodes"][body["scenes"][0]["nodes"][0]]["children"].append(len(b.doc["nodes"]) - 1)

    # Skinned, normally transparent cheek patches supply true bilateral cheek
    # deformation and a localized blush surface. The runtime fades the patch
    # alpha in when embarrassed, instead of recoloring the whole body.
    cheeks = build_cheek_geometry(body_joint["Head"])
    cheek_material = len(b.doc["materials"])
    b.doc["materials"].append(matte("Student cheek blush", [.72, .29, .33], .92))
    cheek_mat = b.doc["materials"][cheek_material]
    cheek_mat["alphaMode"] = "BLEND"
    cheek_mat["pbrMetallicRoughness"]["baseColorFactor"][3] = 0.0
    cheek_attrs = {
        "POSITION": b.accessor(cheeks["positions"], "VEC3", bounds=True),
        "NORMAL": b.accessor(cheeks["normals"], "VEC3"),
        "JOINTS_0": b.accessor(cheeks["joints"], "VEC4", 5121),
        "WEIGHTS_0": b.accessor(cheeks["weights"], "VEC4"),
    }
    cheek_mesh = len(b.doc["meshes"])
    b.doc["meshes"].append({
        "name": "Student expressive cheeks",
        "primitives": [{
            "attributes": cheek_attrs,
            "indices": b.accessor(cheeks["indices"], "SCALAR", 5123),
            "material": cheek_material,
            "targets": [{"POSITION": b.accessor(deltas, "VEC3")} for deltas in cheeks["targets"]],
        }],
        "extras": {"targetNames": list(cheeks["names"])},
    })
    b.doc["nodes"].append({"name": "Student cheek surface", "mesh": cheek_mesh, "skin": 0})
    b.doc["nodes"][body["scenes"][0]["nodes"][0]]["children"].append(len(b.doc["nodes"]) - 1)

    nodes = {node["name"]: i for i, node in enumerate(body["nodes"])}
    clips = {"Idle": "Idle_Loop", "Walk": "Walk_Loop", "Run": "Sprint_Loop"}
    for name, source_name in clips.items():
        clip = next(a for a in animations["animations"] if a["name"] == source_name)
        target = {"name": name, "channels": [], "samplers": []}
        for channel in clip["channels"]:
            src_node = animations["nodes"][channel["target"]["node"]]
            node_name = src_node["name"]
            path = channel["target"]["path"]
            if node_name not in body_joint or path == "scale" or (path == "translation" and node_name not in {"root", "pelvis"}):
                continue
            dst_node = body["nodes"][nodes[node_name]]
            sampler = clip["samplers"][channel["sampler"]]
            if sampler.get("interpolation", "LINEAR") != "LINEAR":
                raise ValueError("Unexpected source interpolation; inspect before exporting")
            times = read_accessor(animations, abinary, sampler["input"])
            values = read_accessor(animations, abinary, sampler["output"])
            if path == "rotation":
                rest = normalized(src_node.get("rotation", [0, 0, 0, 1]))
                inverse = (-rest[0], -rest[1], -rest[2], rest[3])
                offset = quat_mul(normalized(dst_node.get("rotation", [0, 0, 0, 1])), inverse)
                values = [normalized(quat_mul(offset, q)) for q in values]
                # Equivalent q/-q representations must remain continuous for blending.
                for i in range(1, len(values)):
                    if sum(x*y for x, y in zip(values[i-1], values[i])) < 0:
                        values[i] = tuple(-x for x in values[i])
            else:
                src_rest = src_node.get("translation", [0, 0, 0])
                dst_rest = dst_node.get("translation", [0, 0, 0])
                values = [tuple(v[i]-src_rest[i]+dst_rest[i] for i in range(3)) for v in values]
                if node_name == "root":
                    values = [(dst_rest[0], v[1], dst_rest[2]) for v in values]
            if all(max(abs(a-b) for a, b in zip(values[0], row)) < 1e-6 for row in values):
                times, values = [times[0], times[-1]], [values[0], values[0]]
            target["channels"].append({"sampler": len(target["samplers"]), "target": {"node": nodes[node_name], "path": path}})
            target["samplers"].append({"input": b.accessor(times, "SCALAR", bounds=True), "output": b.accessor(values, "VEC4" if path == "rotation" else "VEC3"), "interpolation": "LINEAR"})
        b.doc["animations"].append(target)

    b.doc["extras"] = {"license": "CC0-1.0", "author": "Quaternius", "sourceCommit": SOURCE_COMMIT,
                       "animationSources": clips, "outfit": "Student long-sleeve top, trousers and shoes; material adaptation"}
    b.binary.extend(b"\0" * (-len(b.binary) % 4))
    b.doc["buffers"][0]["byteLength"] = len(b.binary)
    encoded = json.dumps(b.doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 28+len(encoded)+len(b.binary)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + struct.pack("<II", len(b.binary), 0x004E4942) + b.binary
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "human.glb").write_bytes(glb)
    (OUTPUT / "licenses").mkdir(exist_ok=True)
    for name in ["character-license.txt", "animation-license.txt"]:
        (OUTPUT / "licenses" / name).write_bytes(files[name])
    manifest = {"creator": "Quaternius", "license": "CC0-1.0", "verifiedOn": "2026-10-29",
                "officialSources": ["https://quaternius.com/packs/universalbasecharacters.html", "https://quaternius.com/packs/universalanimationlibrary.html"],
                "sourceMirrorCommit": SOURCE_COMMIT,
                "sources": [{"file": n, "url": MIRROR+urllib.parse.quote(p), "sha256": h} for n, (p, h) in SOURCES.items()],
                "output": {"file": "human.glb", "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest(),
                           "morphTargets": sorted({name for mesh in b.doc["meshes"] for name in mesh.get("extras", {}).get("targetNames", [])})},
                "modifications": ["Keep only Idle_Loop, Walk_Loop and Sprint_Loop, exported as Idle/Walk/Run.", "Rebase local rotations onto the character bind pose; retain target limb lengths.", "Preserve pelvis bob and remove horizontal root travel; gameplay controls world movement.", "Add parted hair, remap hair joints, split clothing/skin materials for browser customization.", "Embed eye texture; omit unused textures, UV sets, vertex colors, actions and source meshes.", "Add a skinned expressive lip surface with smile, frown, press and open morphs.", "Add head-skinned cheek squint targets and transparent blush surfaces."]}
    (OUTPUT / "human.source.json").write_text(json.dumps(manifest, indent=2)+"\n")
    print(f"Built {len(glb):,} bytes with {len(b.doc['animations'])} animation clips.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="Optional cache of the pinned source downloads")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temporary:
        build(args.source_dir if args.source_dir else Path(temporary))
