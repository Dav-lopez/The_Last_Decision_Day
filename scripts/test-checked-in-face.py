#!/usr/bin/env python3
"""Offline smoke test for the checked-in human GLB's facial morph geometry."""
import json
import struct
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "apps/web/public/models/human.glb"
raw = path.read_bytes()
assert raw[:4] == b"glTF", "Not a GLB"
assert struct.unpack_from("<I", raw, 8)[0] == len(raw), "Invalid GLB size"
json_size = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20:20 + json_size])
required = {"eyeBlinkLeft", "eyeBlinkRight", "browInnerUp", "browDownLeft", "browDownRight"}
found = set()
for mesh in doc.get("meshes", []):
    names = mesh.get("extras", {}).get("targetNames", [])
    for primitive in mesh.get("primitives", []):
        if names:
            assert len(primitive.get("targets", [])) == len(names), mesh["name"]
    found.update(names)
assert required <= found, f"Checked-in model is missing facial geometry: {sorted(required - found)}"
assert doc.get("skins"), "Missing character skeleton"
assert {"Idle", "Walk", "Run"} <= {clip["name"] for clip in doc.get("animations", [])}
print(f"PASS: {len(found)} facial targets and skeleton/locomotion present in {path.name}")
