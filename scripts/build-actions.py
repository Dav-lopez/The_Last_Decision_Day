#!/usr/bin/env python3
"""Build the characters' action clips (talk, sit, drive, interact, jump, dance,
hit reaction, pick up) from the pinned CC0 Quaternius Universal Animation
Library, retargeted onto each body's rest pose the same way
build-character.py retargets locomotion.

Output: apps/web/public/models/human-actions.glb (male rest pose) and
human-female-actions.glb (female rest pose). Each holds only the skeleton's
nodes and the clips; the browser binds them to a loaded character by bone name.
Python 3.10+, standard library only.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import urllib.parse
import urllib.request
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("build_character", ROOT / "scripts/build-character.py")
bc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bc)
_slim_spec = importlib.util.spec_from_file_location("slim_clips", ROOT / "scripts/slim_clips.py")
slim_clips = importlib.util.module_from_spec(_slim_spec)
_slim_spec.loader.exec_module(slim_clips)

OUTPUT = ROOT / "apps/web/public/models"
BASE = bc.BASE
SOURCES = {
    "body.gltf": bc.SOURCES["body.gltf"],
    "female.gltf": (BASE + "Base Characters/Godot - UE/Superhero_Female_FullBody.gltf", "adedf28000a0716f689b009a70314506fc62f827498f77ba852acb5610f3f3f4"),
    "animations.glb": bc.SOURCES["animations.glb"],
}
BODIES = {"human-actions.glb": "body.gltf", "human-female-actions.glb": "female.gltf"}
# Game name: (source clip, loops)
CLIPS = {
    "Talk": ("Idle_Talking_Loop", True),
    "Sit": ("Sitting_Idle_Loop", True),
    "SitTalk": ("Sitting_Talking_Loop", True),
    "Drive": ("Driving_Loop", True),
    "Interact": ("Interact", False),
    "PickUp": ("PickUp_Table", False),
    "JumpStart": ("Jump_Start", False),
    "JumpAir": ("Jump_Loop", True),
    "JumpLand": ("Jump_Land", False),
    "Dance": ("Dance_Loop", True),
    "Hit": ("Hit_Chest", False),
}


def fetch(source_dir):
    files = {}
    for name, (path, expected) in SOURCES.items():
        local = source_dir / name
        if not local.exists():
            local.write_bytes(urllib.request.urlopen(bc.MIRROR + urllib.parse.quote(path), timeout=60).read())
        data = local.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Source checksum mismatch: {name}")
        files[name] = data
    return files


def build(files, output, body_file):
    body = json.loads(files[body_file])
    alen = struct.unpack_from("<I", files["animations.glb"], 12)[0]
    animations = json.loads(files["animations.glb"][20:20+alen])
    abinary = files["animations.glb"][28+alen:]
    skin = body["skins"][0]
    joint_names = {body["nodes"][n]["name"] for n in skin["joints"]}

    b = bc.Builder(body)
    # Skeleton only: no meshes, skins or cameras.
    for node in b.doc["nodes"]:
        for key in ("mesh", "skin", "camera", "extras"):
            node.pop(key, None)
    nodes = {node["name"]: i for i, node in enumerate(body["nodes"])}
    for name, (source_name, loops) in CLIPS.items():
        clip = next(a for a in animations["animations"] if a["name"] == source_name)
        target = {"name": name, "channels": [], "samplers": [], "extras": {"loop": loops, "source": source_name}}
        for channel in clip["channels"]:
            src_node = animations["nodes"][channel["target"]["node"]]
            node_name = src_node["name"]
            path = channel["target"]["path"]
            if node_name not in joint_names or path == "scale" or (path == "translation" and node_name not in {"root", "pelvis"}):
                continue
            dst_node = body["nodes"][nodes[node_name]]
            sampler = clip["samplers"][channel["sampler"]]
            if sampler.get("interpolation", "LINEAR") != "LINEAR":
                raise ValueError("Unexpected source interpolation; inspect before exporting")
            times = bc.read_accessor(animations, abinary, sampler["input"])
            values = bc.read_accessor(animations, abinary, sampler["output"])
            if path == "rotation":
                rest = bc.normalized(src_node.get("rotation", [0, 0, 0, 1]))
                inverse = (-rest[0], -rest[1], -rest[2], rest[3])
                offset = bc.quat_mul(bc.normalized(dst_node.get("rotation", [0, 0, 0, 1])), inverse)
                values = [bc.normalized(bc.quat_mul(offset, q)) for q in values]
                for i in range(1, len(values)):
                    if sum(x*y for x, y in zip(values[i-1], values[i])) < 0:
                        values[i] = tuple(-x for x in values[i])
            else:
                src_rest = src_node.get("translation", [0, 0, 0])
                dst_rest = dst_node.get("translation", [0, 0, 0])
                values = [tuple(v[i]-src_rest[i]+dst_rest[i] for i in range(3)) for v in values]
                if node_name == "root":
                    # Gameplay moves the character; clips never slide it.
                    values = [(dst_rest[0], v[1], dst_rest[2]) for v in values]
            if all(max(abs(a-b) for a, b in zip(values[0], row)) < 1e-6 for row in values):
                times, values = [times[0], times[-1]], [values[0], values[0]]
            target["channels"].append({"sampler": len(target["samplers"]), "target": {"node": nodes[node_name], "path": path}})
            target["samplers"].append({"input": b.accessor(times, "SCALAR", bounds=True), "output": b.accessor(values, "VEC4" if path == "rotation" else "VEC3"), "interpolation": "LINEAR"})
        b.doc["animations"].append(target)
    for key in ("meshes", "skins"):
        b.doc.pop(key, None)
    b.doc["extras"] = {"license": "CC0-1.0", "author": "Quaternius", "sourceCommit": bc.SOURCE_COMMIT,
                       "clips": {name: {"source": src, "loop": loop} for name, (src, loop) in CLIPS.items()}}
    b.binary.extend(b"\0" * (-len(b.binary) % 4))
    b.doc["buffers"][0]["byteLength"] = len(b.binary)
    encoded = json.dumps(b.doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 28+len(encoded)+len(b.binary)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + struct.pack("<II", len(b.binary), 0x004E4942) + b.binary
    # Drop redundant keys, store rotations as 16-bit and share buffer views (about a third of the size).
    slimmed = slim_clips.slim(glb)
    worst = slim_clips.verify(glb, slimmed)
    if worst["rotation"] > slim_clips.ROTATION_TOLERANCE or worst["translation"] > slim_clips.TRANSLATION_TOLERANCE:
        raise ValueError(f"Slimming changed {output} too much: {worst}")
    glb = slimmed
    (OUTPUT / output).write_bytes(glb)
    print(f"Built {output}: {len(glb):,} bytes, {len(CLIPS)} clips")
    return {"file": output, "body": body_file, "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, help="Optional cache of the pinned source downloads")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temporary:
        files = fetch(args.source_dir if args.source_dir else Path(temporary))
        outputs = [build(files, output, body_file) for output, body_file in BODIES.items()]
    manifest = {"creator": "Quaternius", "license": "CC0-1.0",
                "officialSources": ["https://quaternius.com/packs/universalanimationlibrary.html"],
                "sourceMirrorCommit": bc.SOURCE_COMMIT,
                "sources": [{"file": n, "url": bc.MIRROR+urllib.parse.quote(p), "sha256": h} for n, (p, h) in SOURCES.items()],
                "clips": {name: {"source": src, "loop": loop} for name, (src, loop) in CLIPS.items()},
                "outputs": outputs,
                "modifications": ["Retarget rotations onto each body's rest pose; keep only root/pelvis translation; remove horizontal root travel.", "Slimmed by scripts/slim_clips.py: keys a straight line reproduces are dropped (within 2e-4 per quaternion component, 0.1 mm), rotations stored as normalized 16-bit integers.", "Skeleton nodes only: the browser binds clips to a loaded character by bone name."]}
    (OUTPUT / "human-actions.source.json").write_text(json.dumps(manifest, indent=2)+"\n")
