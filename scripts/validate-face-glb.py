#!/usr/bin/env python3
"""Validate a proposed glTF 2.0 GLB facial rig before replacing human.glb.

Usage: python scripts/validate-face-glb.py path/to/candidate.glb
Standard library only; exits nonzero if the asset cannot support facial expressions.
"""
import json
import struct
import sys
from pathlib import Path

REQUIRED = {
    "eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "eyeWideRight",
    "browInnerUp", "browDownLeft", "browDownRight",
    "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight",
    "jawOpen", "mouthPressLeft", "mouthPressRight",
    "cheekSquintLeft", "cheekSquintRight",
}
OPTIONAL = {"eyeLookDownLeft", "eyeLookDownRight", "mouthOpen"}


def inspect(path: Path):
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 4)[0] != 2:
        raise ValueError("Not a glTF 2.0 GLB")
    if struct.unpack_from("<I", raw, 8)[0] != len(raw):
        raise ValueError("GLB declared length does not match file")
    size, kind = struct.unpack_from("<II", raw, 12)
    if kind != 0x4E4F534A or 20 + size > len(raw):
        raise ValueError("Missing or truncated JSON chunk")
    doc = json.loads(raw[20:20 + size])
    names = set()
    for mesh in doc.get("meshes", []):
        extras = mesh.get("extras", {})
        candidates = extras.get("targetNames", [])
        if not isinstance(candidates, list):
            continue
        count = max((len(p.get("targets", [])) for p in mesh.get("primitives", [])), default=0)
        if len(candidates) != count:
            raise ValueError(f"Mesh {mesh.get('name', '?')}: targetNames count differs from morph targets")
        names.update(n for n in candidates if isinstance(n, str))
    missing = sorted(REQUIRED - names)
    print(f"GLB: {path.name} ({len(raw):,} bytes)")
    print(f"Named morph targets: {len(names)}; essential: {len(REQUIRED) - len(missing)}/{len(REQUIRED)}")
    print(f"Optional targets present: {', '.join(sorted(OPTIONAL & names)) or 'none'}")
    print(f"Skeletons: {len(doc.get('skins', []))}; animation clips: {len(doc.get('animations', []))}")
    if missing:
        print("Missing essential face targets: " + ", ".join(missing))
    if not doc.get("skins"):
        print("Missing skeletal skin; existing character locomotion cannot be preserved")
    return not missing and bool(doc.get("skins"))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: validate-face-glb.py PATH_TO_GLb")
    try:
        sys.exit(0 if inspect(Path(sys.argv[1])) else 1)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        sys.exit(f"Invalid face GLB: {exc}")
