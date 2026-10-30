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
from facial_gaze import GAZE_TARGETS, gaze_delta
from facial_cheeks import build_cheek_geometry
from facial_nose import build_nose_geometry
from facial_eyelids import build_eyelid_geometry
from facial_cornea import build_cornea_geometry
from facial_droplets import DROPLET_KINDS, DROPLET_SIDES, build_droplet_geometry

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/public/models"
SOURCE_COMMIT = "5821923af517ac5fdc82505faa92a0d575fc1b1a"
MIRROR = f"https://raw.githubusercontent.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/{SOURCE_COMMIT}/"
BASE = "Universal Base Characters[Standard]/Universal Base Characters[Standard]/"
ANIM = "Universal Animation Library[Standard]/Universal Animation Library[Standard]/"
HAIR = BASE + "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/"
SOURCES = {
    "body.gltf": (BASE + "Base Characters/Godot - UE/Superhero_Male_FullBody.gltf", "e7fcea214ecf8855afbf910b50de6f9c7d1decfb71ca28bad8a4481452dafeb4"),
    "body.bin": (BASE + "Base Characters/Godot - UE/Superhero_Male_FullBody.bin", "459003f9745853ae562a85506a2b94dd56515c1f37728f9fa3d2ce1a3e4cd92f"),
    "hair.gltf": (BASE + "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.gltf", "fe0f354d7f95d83d38e15c60794dcc063fa4d60550706f3d7ba51491cdc07c56"),
    "hair.bin": (BASE + "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.bin", "ecd7c81959f3985d6254458a440daaaa18a8bfbb1dbe111c68a04a72374d54db"),
    "eyes.png": (BASE + "Base Characters/Godot - UE/T_Eye_Brown.png", "d08e3356a83211bc6ca21fe3a8e39f4b5c1a3b8f85457fc2c0fb57be09935025"),
    "animations.glb": (ANIM + "Unreal-Godot/UAL1_Standard.glb", "69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997"),
    "female.gltf": (BASE + "Base Characters/Godot - UE/Superhero_Female_FullBody.gltf", "adedf28000a0716f689b009a70314506fc62f827498f77ba852acb5610f3f3f4"),
    "female.bin": (BASE + "Base Characters/Godot - UE/Superhero_Female_FullBody.bin", "3a8220a485b33d05d879115a50697728b45a151781106033afb8b8c243fca208"),
    "hair-long.gltf": (HAIR + "Hair_Long.gltf", "27e2c63e8f98c79fb600268ffcc92b36c621b8653b5a7dcbadb08328f3f887a9"),
    "hair-long.bin": (HAIR + "Hair_Long.bin", "268fd531d2c2ac321783d36fcf106d15c5c76e8923eec2c8704d5fe9de953589"),
    "hair-buns.gltf": (HAIR + "Hair_Buns.gltf", "cbdd6f509ec8f1021361b53da6fa1a077b95762ebc8bc2d8acae59bb0cb263c1"),
    "hair-buns.bin": (HAIR + "Hair_Buns.bin", "811606cc84f0bfdefa2e6f1396f3d94c35138308a96d78a4f447b2e7dfc6ed6c"),
    "hair-pixie.gltf": (HAIR + "Hair_BuzzedFemale.gltf", "096a7a4ea5bcadc588f4c1e95f04b3461f8a20f3643a0308cfd23e81e180ab32"),
    "hair-pixie.bin": (HAIR + "Hair_BuzzedFemale.bin", "48fcdac8751e85c1d08ac9ff25b5c4d649e5b5d450d37ad8743b9f111a3a7e04"),
    "hair-buzzed.gltf": (HAIR + "Hair_Buzzed.gltf", "6e709c691d4feccda9788df917bf9604e751f02da21cee2bc81bcc3d26b3b580"),
    "hair-buzzed.bin": (HAIR + "Hair_Buzzed.bin", "5d4b5452ff879ed1d516694be57d1106c070c7133e747a8c9432b01ebf20e908"),
    "hair-beard.gltf": (HAIR + "Hair_Beard.gltf", "80013b9791ce12c65fbe693cf669b02ef5c38091c653bf13b9415d2d8380e0ce"),
    "hair-beard.bin": (HAIR + "Hair_Beard.bin", "bf2f46ef5808665ef31082f787bc68c51ff063e81b76ca1a51ac86a9ae723be7"),
    "character-license.txt": (BASE + "License_Standard.txt", "e08f717c3cfd999f4b44f2be4522b11a3ac3c0e5b6364b3a8788d25d4c90ff94"),
    "animation-license.txt": (ANIM + "License.txt", "d77329b05c4c206e76c83285ecdd1e5f2b3df2350ec80657ebdb5a706a0fc0de"),
}
# Two body types share one skeleton layout, animations and facial rig. Each
# ships every hairstyle (the browser shows one) and a skinned skirt (hidden
# unless worn). Hair and face surfaces were authored on one head; they are
# moved by the difference between the two heads' eye centres.
VARIANTS = {
    "male": {"body": "body", "output": "human.glb", "manifest": "human.source.json", "hair": "parted"},
    "female": {"body": "female", "output": "human-female.glb", "manifest": "human-female.source.json", "hair": "long"},
}
HAIRSTYLES = {  # id: (source file stem, body it was authored on)
    "parted": ("hair", "male"), "buzzed": ("hair-buzzed", "male"), "pixie": ("hair-pixie", "female"),
    "long": ("hair-long", "female"), "buns": ("hair-buns", "female"), "beard": ("hair-beard", "male"),
}
# Outfit zones, painted in the browser: a long sleeve vs a T-shirt, shorts vs
# jeans, sneakers vs boots are which zones take the garment colour and which
# show skin. Index 0 is skin; 1-3 keep their original names for compatibility.
ZONES = ["skin", "top", "thigh", "foot", "upper-arm", "forearm", "midriff", "waist", "knee", "shin", "lower-shin", "ankle", "sole"]
ZONE_MATERIALS = {"skin": "Student skin", "top": "Student jacket", "thigh": "Student trousers", "foot": "Student shoes",
                  "upper-arm": "Student sleeve upper", "forearm": "Student sleeve lower", "midriff": "Student midriff", "waist": "Student waistband",
                  "knee": "Student trousers knee", "shin": "Student trousers shin", "lower-shin": "Student trousers ankle",
                  "ankle": "Student socks", "sole": "Student soles"}
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


def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    ix, iy, iz, iw = w*vx + y*vz - z*vy, w*vy + z*vx - x*vz, w*vz + x*vy - y*vx, -x*vx - y*vy - z*vz
    return (ix*w - iw*x - iy*z + iz*y, iy*w - iw*y - iz*x + ix*z, iz*w - iw*z - ix*y + iy*x)


def joint_positions(doc):
    """Rest-pose world positions of every named node."""
    parent = {c: i for i, n in enumerate(doc["nodes"]) for c in n.get("children", [])}
    cache = {}

    def world(i):
        if i not in cache:
            n = doc["nodes"][i]
            t, r = n.get("translation", [0, 0, 0]), n.get("rotation", [0, 0, 0, 1])
            if i not in parent:
                cache[i] = (tuple(t), tuple(r))
            else:
                pt, pr = world(parent[i])
                v = qrot(pr, t)
                cache[i] = (tuple(pt[k] + v[k] for k in range(3)), quat_mul(pr, r))
        return cache[i]
    return {n["name"]: world(i)[0] for i, n in enumerate(doc["nodes"]) if "name" in n}


def zone_classifier(joints):
    wrist = joints["hand_l"][0] + 0.03
    elbow = joints["lowerarm_l"][0] + 0.02
    shoulder = joints["upperarm_l"][0] + 0.03
    collar = joints["neck_01"][1] + 0.04
    pelvis = joints["pelvis"][1]
    knee = joints["calf_l"][1]
    ankle = joints["foot_l"][1]
    mid_thigh = (pelvis + knee) / 2
    mid_shin = (knee + ankle) / 2

    def classify(x, y):
        ax = abs(x)
        if ax >= wrist:
            return "skin"
        if ax > shoulder and y > pelvis + 0.2:
            return "forearm" if ax > elbow else "upper-arm"
        if y >= collar:
            return "skin"
        if y >= pelvis + 0.17:
            return "top"
        if y >= pelvis + 0.05:
            return "midriff"
        if y >= pelvis - 0.03:
            return "waist"
        if y >= mid_thigh:
            return "thigh"
        if y >= knee + 0.04:
            return "knee"
        if y >= mid_shin:
            return "shin"
        if y >= ankle + 0.12:
            return "lower-shin"
        if y >= ankle + 0.055:
            return "ankle"
        return "foot" if y >= 0.022 else "sole"
    return classify


def build_skirt(positions, joints, joint_index):
    """A flared, double-sided skirt skinned to the pelvis and thighs."""
    pelvis = joints["pelvis"][1]
    knee = joints["calf_l"][1]
    top_y, hem_y = pelvis + 0.06, knee + 0.1

    def section(y, band=0.025, reach=0.32):
        pts = [p for p in positions if abs(p[1] - y) < band and abs(p[0]) < reach]
        xs = [abs(p[0]) for p in pts]
        zs = [p[2] for p in pts]
        return max(xs), min(zs), max(zs)

    top = section(top_y)
    hips = max((section(y) for y in [pelvis - 0.02, pelvis - 0.08, pelvis - 0.14]), key=lambda s: s[0])
    rings, segments = 5, 28
    verts, normals, jts, wts, idx = [], [], [], [], []
    for r in range(rings):
        t = r / (rings - 1)
        y = top_y + (hem_y - top_y) * t
        ref = top if t == 0 else hips
        flare = 0.012 + 0.07 * t * t + (0.025 if t > 0 else 0)
        rx = ref[0] + flare
        zc = (ref[1] + ref[2]) / 2
        rz = (ref[2] - ref[1]) / 2 + flare
        for k in range(segments):
            a = 2 * math.pi * k / segments
            x, z = math.sin(a) * rx, zc + math.cos(a) * rz
            verts.append((x, y, z))
            n = (math.sin(a) / rx, 0.25 * t, math.cos(a) / rz)
            length = math.sqrt(sum(c * c for c in n))
            normals.append(tuple(c / length for c in n))
            side = x / rx  # -1 right .. 1 left
            follow = 0.55 * t
            left, right = follow * max(0, min(1, 0.5 + side)), follow * max(0, min(1, 0.5 - side))
            jts.append((joint_index["pelvis"], joint_index["thigh_l"], joint_index["thigh_r"], 0))
            wts.append((1 - left - right, left, right, 0.0))
    for r in range(rings - 1):
        for k in range(segments):
            a, b = r * segments + k, r * segments + (k + 1) % segments
            c, d = a + segments, b + segments
            idx.extend([(a,), (c,), (b,), (b,), (c,), (d,)])
    return {"positions": verts, "normals": normals, "joints": jts, "weights": wts, "indices": idx}


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


def fetch_sources(source_dir):
    files = {}
    for name, (path, expected) in SOURCES.items():
        local = source_dir / name
        if not local.exists():
            local.write_bytes(urllib.request.urlopen(MIRROR + urllib.parse.quote(path), timeout=60).read())
        data = local.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Source checksum mismatch: {name}")
        files[name] = data
    return files


def eye_centre(doc, binary):
    a = doc["accessors"][doc["meshes"][1]["primitives"][0]["attributes"]["POSITION"]]
    return tuple((a["min"][i] + a["max"][i]) / 2 for i in range(3))


def build(files, variant):
    config = VARIANTS[variant]
    body = json.loads(files[config["body"] + ".gltf"])
    body_bin = files[config["body"] + ".bin"]
    eyes = {v: eye_centre(json.loads(files[c["body"] + ".gltf"]), None) for v, c in VARIANTS.items()}

    def shift_from(authored_on):
        return tuple(eyes[variant][i] - eyes[authored_on][i] for i in range(3))
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
    for zone in ZONES[4:]:
        b.doc["materials"].append(matte(ZONE_MATERIALS[zone], [.12, .17, .25]))
    zone_material = {zone: next(i for i, m in enumerate(b.doc["materials"]) if m["name"] == ZONE_MATERIALS[zone]) for zone in ZONES}
    b.doc["images"] = [{"name": "Quaternius brown eyes", "mimeType": "image/png", "bufferView": b.blob(files["eyes.png"])}]
    b.doc["textures"] = [{"source": 0}]
    b.doc["materials"][5]["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}

    for mi, mesh in enumerate(body["meshes"]):
        p = mesh["primitives"][0]
        attrs = b.attributes("body", body, body_bin, p, uv=mi == 1)
        if mi < 2:
            prims = [{"attributes": attrs, "indices": b.copy_accessor("body", body, body_bin, p["indices"]), "material": 4 if mi == 0 else 5}]
        else:
            positions = read_accessor(body, body_bin, p["attributes"]["POSITION"])
            indices = [r[0] for r in read_accessor(body, body_bin, p["indices"])]
            # Split the one skinned body into outfit zones (see ZONES), keeping its
            # original skin weights; the browser decides what each zone wears.
            classify = zone_classifier(joint_positions(body))
            groups = {zone_material[zone]: [] for zone in ZONES}
            for start in range(0, len(indices), 3):
                tri = indices[start:start+3]
                x, y, _ = [sum(positions[i][c] for i in tri)/3 for c in range(3)]
                groups[zone_material[classify(x, y)]].extend((i,) for i in tri)
            prims = [{"attributes": attrs, "indices": b.accessor(rows, "SCALAR", 5123), "material": mat} for mat, rows in groups.items() if rows]
        # Author lightweight morph targets directly on the licensed source geometry.
        # These preserve the existing skinning and animations. This is a stylized
        # facial rig, not a photorealistic head replacement.
        if mi in (0, 1):
            source_positions = read_accessor(body, body_bin, p["attributes"]["POSITION"])
            ymin = min(v[1] for v in source_positions)
            ymax = max(v[1] for v in source_positions)
            mid = (ymin + ymax) / 2
            span = max(0.001, ymax - ymin)
            names = (["browInnerUp", "browDownLeft", "browDownRight"] if mi == 0
                     else ["eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "eyeWideRight", "eyeSquintLeft", "eyeSquintRight", *GAZE_TARGETS])
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
                        elif name in GAZE_TARGETS:
                            # Eye-gaze displacement is isolated to its matching
                            # eye and remains within the original eye socket.
                            deltas.append(gaze_delta(name, x, y, z, mid, span / 2))
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
    skin["inverseBindMatrices"] = b.copy_accessor("body", body, body_bin, skin["inverseBindMatrices"])
    b.doc["skins"].append(skin)

    # Every hairstyle shares the humanoid rig; remap joint indices by name into
    # the body's skin and move it onto this head. The browser shows one.
    body_joint = {body["nodes"][node]["name"]: i for i, node in enumerate(skin["joints"])}
    scene_root = body["scenes"][0]["nodes"][0]
    for style, (stem, authored_on) in HAIRSTYLES.items():
        hair = json.loads(files[stem + ".gltf"])
        hair_bin = files[stem + ".bin"]
        hp = hair["meshes"][0]["primitives"][0]
        hattrs = b.attributes(stem, hair, hair_bin, hp)
        dx, dy, dz = shift_from(authored_on)
        if any(abs(d) > 1e-6 for d in (dx, dy, dz)):
            moved = [(x + dx, y + dy, z + dz) for x, y, z in read_accessor(hair, hair_bin, hp["attributes"]["POSITION"])]
            hattrs["POSITION"] = b.accessor(moved, "VEC3", bounds=True)
        hair_joints = hair["skins"][0]["joints"]
        remap = {i: body_joint[hair["nodes"][n]["name"]] for i, n in enumerate(hair_joints)}
        hattrs["JOINTS_0"] = b.accessor([tuple(remap[j] for j in row) for row in read_accessor(hair, hair_bin, hp["attributes"]["JOINTS_0"])], "VEC4", 5121)
        mesh_index = len(b.doc["meshes"])
        b.doc["meshes"].append({"name": f"Student hair {style}", "primitives": [{"attributes": hattrs, "indices": b.copy_accessor(stem, hair, hair_bin, hp["indices"]), "material": 4}]})
        b.doc["nodes"].append({"name": f"Student hair {style}", "mesh": mesh_index, "skin": 0, "extras": {"default": style == config["hair"]}})
        b.doc["nodes"][scene_root]["children"].append(len(b.doc["nodes"])-1)

    # A skirt, hidden unless worn.
    skirt = build_skirt(read_accessor(body, body_bin, body["meshes"][2]["primitives"][0]["attributes"]["POSITION"]), joint_positions(body), body_joint)
    skirt_material = len(b.doc["materials"])
    b.doc["materials"].append(matte("Student skirt", [.55, .18, .25]))
    skirt_mesh = len(b.doc["meshes"])
    b.doc["meshes"].append({"name": "Student skirt", "primitives": [{"attributes": {
        "POSITION": b.accessor(skirt["positions"], "VEC3", bounds=True), "NORMAL": b.accessor(skirt["normals"], "VEC3"),
        "JOINTS_0": b.accessor(skirt["joints"], "VEC4", 5121), "WEIGHTS_0": b.accessor(skirt["weights"], "VEC4")},
        "indices": b.accessor(skirt["indices"], "SCALAR", 5123), "material": skirt_material}]})
    b.doc["nodes"].append({"name": "Student skirt", "mesh": skirt_mesh, "skin": 0})
    b.doc["nodes"][scene_root]["children"].append(len(b.doc["nodes"])-1)

    # A small mouth surface follows the Head bone and supplies actual lip
    # displacement for the expression presets. This is not a realistic head.
    if "Head" not in body_joint:
        raise ValueError("Pinned source is missing the Head skin joint")

    face_shift = shift_from("male")

    def on_this_face(geometry):
        geometry = dict(geometry)
        geometry["positions"] = [(x + face_shift[0], y + face_shift[1], z + face_shift[2]) for x, y, z in geometry["positions"]]
        return geometry
    mouth = on_this_face(build_mouth_geometry(body_joint["Head"]))
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
    cheeks = on_this_face(build_cheek_geometry(body_joint["Head"]))
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

    # A gently sculpted, front-facing nose bridge and tip add actual 3D
    # facial depth. It shares the customizable skin material and Head joint,
    # rather than floating as an unskinned or differently colored attachment.
    nose = on_this_face(build_nose_geometry(body_joint["Head"]))
    nose_mesh = len(b.doc["meshes"])
    b.doc["meshes"].append({
        "name": "Student sculpted nose",
        "primitives": [{
            "attributes": {
                "POSITION": b.accessor(nose["positions"], "VEC3", bounds=True),
                "NORMAL": b.accessor(nose["normals"], "VEC3"),
                "JOINTS_0": b.accessor(nose["joints"], "VEC4", 5121),
                "WEIGHTS_0": b.accessor(nose["weights"], "VEC4"),
            },
            "indices": b.accessor(nose["indices"], "SCALAR", 5123),
            "material": 0,
        }],
    })
    b.doc["nodes"].append({"name": "Student nose surface", "mesh": nose_mesh, "skin": 0})
    b.doc["nodes"][body["scenes"][0]["nodes"][0]]["children"].append(len(b.doc["nodes"]) - 1)

    # Short, head-skinned eyelid rims follow the same left/right blink morphs
    # as the source eye mesh. Reuse the hair material for customizable lash
    # color, without coupling visibility to any selectable hairstyle.
    eyelids = on_this_face(build_eyelid_geometry(body_joint["Head"]))
    eyelid_mesh = len(b.doc["meshes"])
    b.doc["meshes"].append({
        "name": "Student eyelid rims",
        "primitives": [{
            "attributes": {
                "POSITION": b.accessor(eyelids["positions"], "VEC3", bounds=True),
                "NORMAL": b.accessor(eyelids["normals"], "VEC3"),
                "JOINTS_0": b.accessor(eyelids["joints"], "VEC4", 5121),
                "WEIGHTS_0": b.accessor(eyelids["weights"], "VEC4"),
            },
            "indices": b.accessor(eyelids["indices"], "SCALAR", 5123),
            "material": 4,
            "targets": [{"POSITION": b.accessor(deltas, "VEC3")} for deltas in eyelids["targets"]],
        }],
        "extras": {"targetNames": list(eyelids["names"])},
    })
    b.doc["nodes"].append({"name": "Student eyelid rim surface", "mesh": eyelid_mesh, "skin": 0})
    b.doc["nodes"][scene_root]["children"].append(len(b.doc["nodes"]) - 1)

    # Shallow convex corneal films add a controlled specular response over the
    # existing eye texture. Bilateral blink/gaze morphs follow the same rig,
    # and all vertices follow the Head joint on both body variants.
    cornea = on_this_face(build_cornea_geometry(body_joint["Head"]))
    cornea_material = len(b.doc["materials"])
    cornea_mat = matte("Student corneal film", [.82, .93, 1.0], .07)
    cornea_mat["doubleSided"] = False
    cornea_mat["alphaMode"] = "BLEND"
    cornea_mat["pbrMetallicRoughness"]["baseColorFactor"][3] = 0.16
    b.doc["materials"].append(cornea_mat)
    cornea_mesh = len(b.doc["meshes"])
    b.doc["meshes"].append({
        "name": "Student corneal shells",
        "primitives": [{
            "attributes": {
                "POSITION": b.accessor(cornea["positions"], "VEC3", bounds=True),
                "NORMAL": b.accessor(cornea["normals"], "VEC3"),
                "JOINTS_0": b.accessor(cornea["joints"], "VEC4", 5121),
                "WEIGHTS_0": b.accessor(cornea["weights"], "VEC4"),
            },
            "indices": b.accessor(cornea["indices"], "SCALAR", 5123),
            "material": cornea_material,
            "targets": [{"POSITION": b.accessor(deltas, "VEC3")} for deltas in cornea["targets"]],
        }],
        "extras": {"targetNames": list(cornea["names"])},
    })
    b.doc["nodes"].append({"name": "Student corneal surface", "mesh": cornea_mesh, "skin": 0})
    b.doc["nodes"][scene_root]["children"].append(len(b.doc["nodes"]) - 1)

    # Transparent, head-skinned droplet surfaces are authored into the GLB,
    # not parented to the world origin. A dedicated morph slides each patch
    # down the face; Babylon fades it in only for the corresponding emotion.
    for kind in DROPLET_KINDS:
        for side in DROPLET_SIDES:
            droplet = on_this_face(build_droplet_geometry(body_joint["Head"], kind, side))
            label = f"Student {kind} {side}"
            material_index = len(b.doc["materials"])
            material = matte(label, [.62, .85, 1.0] if kind == "tear" else [.84, .94, 1.0],
                             .09 if kind == "tear" else .18)
            material["alphaMode"] = "BLEND"
            material["pbrMetallicRoughness"]["baseColorFactor"][3] = 0.0
            b.doc["materials"].append(material)
            attrs = {
                "POSITION": b.accessor(droplet["positions"], "VEC3", bounds=True),
                "NORMAL": b.accessor(droplet["normals"], "VEC3"),
                "JOINTS_0": b.accessor(droplet["joints"], "VEC4", 5121),
                "WEIGHTS_0": b.accessor(droplet["weights"], "VEC4"),
            }
            mesh_index = len(b.doc["meshes"])
            b.doc["meshes"].append({
                "name": label,
                "primitives": [{
                    "attributes": attrs,
                    "indices": b.accessor(droplet["indices"], "SCALAR", 5123),
                    "material": material_index,
                    "targets": [{"POSITION": b.accessor(deltas, "VEC3")} for deltas in droplet["targets"]],
                }],
                "extras": {"targetNames": list(droplet["names"])},
            })
            b.doc["nodes"].append({"name": label + " surface", "mesh": mesh_index, "skin": 0})
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
                       "animationSources": clips, "body": variant,
                       "outfit": "Zoned outfit (tops, bottoms, socks, shoes, soles), every hairstyle and a skinned skirt; material adaptation",
                       "outfitZones": ZONE_MATERIALS, "hairstyles": list(HAIRSTYLES), "defaultHair": config["hair"]}
    b.binary.extend(b"\0" * (-len(b.binary) % 4))
    b.doc["buffers"][0]["byteLength"] = len(b.binary)
    encoded = json.dumps(b.doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 28+len(encoded)+len(b.binary)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + struct.pack("<II", len(b.binary), 0x004E4942) + b.binary
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / config["output"]).write_bytes(glb)
    (OUTPUT / "licenses").mkdir(exist_ok=True)
    for name in ["character-license.txt", "animation-license.txt"]:
        (OUTPUT / "licenses" / name).write_bytes(files[name])
    manifest = {"creator": "Quaternius", "license": "CC0-1.0", "verifiedOn": "2026-10-29",
                "officialSources": ["https://quaternius.com/packs/universalbasecharacters.html", "https://quaternius.com/packs/universalanimationlibrary.html"],
                "sourceMirrorCommit": SOURCE_COMMIT,
                "sources": [{"file": n, "url": MIRROR+urllib.parse.quote(p), "sha256": h} for n, (p, h) in SOURCES.items()],
                "body": variant,
                "output": {"file": config["output"], "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest(),
                           "morphTargets": sorted({name for mesh in b.doc["meshes"] for name in mesh.get("extras", {}).get("targetNames", [])})},
                "modifications": ["Keep only Idle_Loop, Walk_Loop and Sprint_Loop, exported as Idle/Walk/Run.", "Rebase local rotations onto the character bind pose; retain target limb lengths.", "Preserve pelvis bob and remove horizontal root travel; gameplay controls world movement.", "Add parted hair, remap hair joints, split clothing/skin materials for browser customization.", "Embed eye texture; omit unused textures, UV sets, vertex colors, actions and source meshes.", "Add a skinned expressive lip surface with smile, frown, press and open morphs.", "Add head-skinned cheek squint targets and transparent blush surfaces.", "Add head-skinned animated translucent tear and sweat droplets.", "Add a head-skinned sculpted nose bridge and tip sharing the skin material.", "Add skinned upper/lower eyelid rims and tapered lashes driven by bilateral blink morphs.", "Add shallow transparent head-skinned corneal films with bilateral blink and gaze morphs.", "Split the outfit into zones painted in the browser (sleeves, midriff, waist, thighs, knees, shins, socks, shoes, soles).", "Ship every hairstyle (parted, buzzed, pixie, long, buns, beard) moved onto this head by the eye-centre difference; the browser shows one.", "Add a skinned flared skirt (pelvis and thighs), hidden unless worn."]}
    (OUTPUT / config["manifest"]).write_text(json.dumps(manifest, indent=2)+"\n")
    print(f"Built {config['output']}: {len(glb):,} bytes with {len(b.doc['animations'])} animation clips.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="Optional cache of the pinned source downloads")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temporary:
        files = fetch_sources(args.source_dir if args.source_dir else Path(temporary))
        for variant in VARIANTS:
            build(files, variant)
