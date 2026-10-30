#!/usr/bin/env python3
"""Validate skinned hair-fibre geometry in a generated male/female GLB."""
import json
from pathlib import Path
import struct
import sys

STYLES = ("parted", "buzzed", "pixie", "long", "buns", "beard")
MAX_STRANDS = 112


def validate(path):
    raw = Path(path).read_bytes()
    if raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 8)[0] != len(raw):
        raise ValueError("Invalid GLB header or byte length")
    json_size, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError("Missing glTF JSON chunk")
    doc = json.loads(raw[20:20 + json_size])
    nodes = doc["nodes"]
    meshes = doc["meshes"]
    accessors = doc["accessors"]
    for style in STYLES:
        label = f"Student hair {style} detail"
        matches = [(i, mesh) for i, mesh in enumerate(meshes) if mesh["name"] == label]
        if len(matches) != 1:
            raise ValueError(f"{label}: expected one skinned detail mesh")
        index, mesh = matches[0]
        if len(mesh["primitives"]) != 1:
            raise ValueError(f"{label}: expected one primitive")
        primitive = mesh["primitives"][0]
        if doc["materials"][primitive["material"]]["name"] != "Student hair":
            raise ValueError(f"{label}: must share customizable hair material")
        if not {"POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"} <= primitive["attributes"].keys():
            raise ValueError(f"{label}: missing skinning or surface attributes")
        vertex_count = accessors[primitive["attributes"]["POSITION"]]["count"]
        index_count = accessors[primitive["indices"]]["count"]
        if not (6 <= vertex_count <= MAX_STRANDS * 6 and 12 <= index_count <= MAX_STRANDS * 12):
            raise ValueError(f"{label}: exceeds strand budget or has no geometry")
        if index_count % 3:
            raise ValueError(f"{label}: incomplete triangle indices")
        if not any(node.get("mesh") == index and node.get("skin") == 0 for node in nodes):
            raise ValueError(f"{label}: not attached to the humanoid skin")
        if not any(m["name"] == f"Student hair {style}" for m in meshes):
            raise ValueError(f"{label}: original hairstyle missing")
    print(f"{path}: six skinned hairstyle detail overlays validated")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Usage: validate_hair_detail_glb.py <human.glb> [human-female.glb]")
    for file in sys.argv[1:]:
        validate(file)
