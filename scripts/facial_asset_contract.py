#!/usr/bin/env python3
"""Release gate for the *generated* facial GLB (not the older checked-in asset).

Checks binary morph displacement, head-joint skinning and transparent overlays,
rather than accepting a target name or a green generator exit code as proof of
working facial geometry. Standard library only.
"""
import json
import math
import struct
import sys
from pathlib import Path

REQUIRED_MORPHS = {
    "eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "eyeWideRight",
    "eyeSquintLeft", "eyeSquintRight", "browInnerUp", "browDownLeft",
    "browDownRight", "mouthSmileLeft", "mouthSmileRight",
    "mouthFrownLeft", "mouthFrownRight", "mouthPressLeft",
    "mouthPressRight", "jawOpen", "mouthOpen",
    "cheekSquintLeft", "cheekSquintRight",
    "eyeLookDownLeft", "eyeLookDownRight", "eyeLookUpLeft",
    "eyeLookUpRight", "tearTrackLeft", "tearTrackRight",
    "sweatTrackLeft", "sweatTrackRight",
}
HEAD_MESHES = {
    "Student expressive lips", "Student expressive cheeks",
    "Student tear Left", "Student tear Right",
    "Student sweat Left", "Student sweat Right",
}
TRANSPARENT = {
    "Student expressive cheeks": "Student cheek blush",
    "Student tear Left": "Student tear Left",
    "Student tear Right": "Student tear Right",
    "Student sweat Left": "Student sweat Left",
    "Student sweat Right": "Student sweat Right",
}
COMPONENTS = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
DIMENSIONS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def parse_glb(raw):
    require(len(raw) >= 28 and raw[:4] == b"glTF", "Invalid GLB header")
    require(struct.unpack_from("<I", raw, 4)[0] == 2, "GLB must be version 2")
    require(struct.unpack_from("<I", raw, 8)[0] == len(raw), "GLB length mismatch")
    json_length, json_type = struct.unpack_from("<II", raw, 12)
    require(json_type == 0x4E4F534A and 20 + json_length + 8 <= len(raw), "Missing JSON chunk")
    doc = json.loads(raw[20:20 + json_length])
    offset = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<II", raw, offset)
    require(binary_type == 0x004E4942, "Missing BIN chunk")
    binary = raw[offset + 8:offset + 8 + binary_length]
    require(len(binary) == binary_length and offset + 8 + binary_length == len(raw), "Truncated BIN chunk")
    require(doc["buffers"][0]["byteLength"] <= len(binary), "BIN shorter than declared buffer")
    return doc, binary


def vectors(doc, binary, accessor_index):
    accessor = doc["accessors"][accessor_index]
    require("sparse" not in accessor, "Sparse accessors need explicit review")
    require(accessor["componentType"] in COMPONENTS, "Unsupported accessor component")
    require(accessor["type"] in DIMENSIONS, "Unsupported accessor shape")
    fmt, width = COMPONENTS[accessor["componentType"]]
    dimensions = DIMENSIONS[accessor["type"]]
    row_size = dimensions * width
    view = doc["bufferViews"][accessor["bufferView"]]
    require(view.get("buffer", 0) == 0, "External buffer is not self-contained")
    stride = view.get("byteStride", row_size)
    require(stride >= row_size and stride % width == 0, "Invalid accessor stride")
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    view_end = view.get("byteOffset", 0) + view["byteLength"]
    count = accessor["count"]
    require(count > 0, "Empty geometry accessor")
    require(start >= view.get("byteOffset", 0) and
            start + (count - 1) * stride + row_size <= min(view_end, len(binary)),
            "Accessor extends beyond its buffer view")
    return [struct.unpack_from("<" + fmt * dimensions, binary, start + i * stride)
            for i in range(count)]


def validate(doc, binary):
    require(doc.get("asset", {}).get("version") == "2.0", "Expected glTF 2.0")
    require(len(doc.get("skins", [])) >= 1, "Missing character skin")
    require({"Idle", "Walk", "Run"} <= {a.get("name") for a in doc.get("animations", [])},
            "Missing locomotion animations")
    skin = doc["skins"][0]
    head = next((index for index, node_id in enumerate(skin["joints"])
                 if doc["nodes"][node_id].get("name") == "Head"), None)
    require(head is not None, "Missing Head joint in skin")
    mesh_nodes = {node["mesh"]: node for node in doc["nodes"] if "mesh" in node}
    found = set()
    names_by_mesh = {mesh.get("name"): (i, mesh) for i, mesh in enumerate(doc.get("meshes", []))}
    require(HEAD_MESHES <= set(names_by_mesh), "Missing required head-skinned face surfaces")
    for mesh_index, mesh in enumerate(doc.get("meshes", [])):
        names = mesh.get("extras", {}).get("targetNames", [])
        require(isinstance(names, list) and len(set(names)) == len(names),
                f"{mesh.get('name')}: invalid or duplicate morph names")
        for primitive in mesh.get("primitives", []):
            targets = primitive.get("targets", [])
            require(len(names) == len(targets), f"{mesh.get('name')}: morph target count mismatch")
            if names:
                base = vectors(doc, binary, primitive["attributes"]["POSITION"])
                for name, target in zip(names, targets):
                    require("POSITION" in target, f"{name}: missing POSITION morph")
                    delta = vectors(doc, binary, target["POSITION"])
                    require(len(delta) == len(base), f"{name}: wrong morph vertex count")
                    require(all(math.isfinite(v) for row in delta for v in row),
                            f"{name}: non-finite displacement")
                    magnitude = max(abs(v) for row in delta for v in row)
                    require(0.0001 < magnitude < 0.25,
                            f"{name}: zero or implausibly large displacement ({magnitude:.5f})")
                    found.add(name)
            if mesh.get("name") in HEAD_MESHES or mesh.get("name") == "Student sculpted nose":
                require(mesh_index in mesh_nodes and mesh_nodes[mesh_index].get("skin") == 0,
                        f"{mesh.get('name')}: mesh node is not skinned")
                attributes = primitive["attributes"]
                require("JOINTS_0" in attributes and "WEIGHTS_0" in attributes,
                        f"{mesh.get('name')}: missing skin attributes")
                joints = vectors(doc, binary, attributes["JOINTS_0"])
                weights = vectors(doc, binary, attributes["WEIGHTS_0"])
                positions = vectors(doc, binary, attributes["POSITION"])
                require(len(joints) == len(weights) == len(positions),
                        f"{mesh.get('name')}: skin vertex count mismatch")
                require(all(j[0] == head and all(x == 0 for x in j[1:]) and
                            abs(w[0] - 1) < 1e-5 and all(abs(x) < 1e-5 for x in w[1:])
                            for j, w in zip(joints, weights)),
                        f"{mesh.get('name')}: face geometry must follow Head bone")
                if mesh.get("name") in TRANSPARENT:
                    material = doc["materials"][primitive["material"]]
                    require(material.get("name") == TRANSPARENT[mesh["name"]] and
                            material.get("alphaMode") == "BLEND" and
                            material["pbrMetallicRoughness"]["baseColorFactor"][3] == 0,
                            f"{mesh['name']}: emotion overlay must be transparent at rest")
    require(REQUIRED_MORPHS <= found,
            "Missing usable facial morphs: " + ", ".join(sorted(REQUIRED_MORPHS - found)))
    return len(found)


def main(path):
    doc, binary = parse_glb(Path(path).read_bytes())
    count = validate(doc, binary)
    print(f"PASS: {count} usable facial morphs, Head-skinned overlays and Idle/Walk/Run in {path}")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python scripts/facial_asset_contract.py PATH_TO_GENERATED_GLB")
        main(sys.argv[1])
    except (OSError, ValueError, KeyError, IndexError, struct.error, json.JSONDecodeError) as exc:
        sys.exit(f"FAIL: generated facial asset: {exc}")
