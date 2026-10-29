#!/usr/bin/env python3
"""Validate generated GLB containers using only Python's standard library.

Usage: python3 tools/assets/validate_glb.py apps/web/public/models/environment/oak.glb apps/web/public/models/environment/house.glb
"""
import json
import math
import pathlib
import struct
import sys

MAGIC = b"glTF"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942

def validate(path):
    path = pathlib.Path(path)
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("truncated GLB")
    magic, version, declared_length = struct.unpack_from("<4sII", data)
    if magic != MAGIC or version != 2 or declared_length != len(data):
        raise ValueError("invalid GLB header, version, or declared length")
    offset = 12
    chunks = []
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("truncated chunk header")
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        if size % 4 or offset + size > len(data):
            raise ValueError("invalid chunk alignment or size")
        chunks.append((kind, data[offset:offset + size]))
        offset += size
    if not chunks or chunks[0][0] != JSON_CHUNK:
        raise ValueError("missing leading JSON chunk")
    if len(chunks) > 2 or (len(chunks) == 2 and chunks[1][0] != BIN_CHUNK):
        raise ValueError("unexpected GLB chunks")
    doc = json.loads(chunks[0][1].decode("utf-8").rstrip(" \t\r\n\x00"))
    if doc.get("asset", {}).get("version") != "2.0":
        raise ValueError("invalid glTF asset version")
    meshes = doc.get("meshes", [])
    nodes = doc.get("nodes", [])
    if not meshes or not nodes:
        raise ValueError("no renderable meshes or nodes")
    if not any("mesh" in node for node in nodes):
        raise ValueError("no mesh nodes")
    for mesh in meshes:
        if not mesh.get("primitives"):
            raise ValueError("empty mesh primitives")
        for primitive in mesh["primitives"]:
            if "POSITION" not in primitive.get("attributes", {}):
                raise ValueError("mesh primitive missing POSITION")
    for node in nodes:
        for prop in ("translation", "rotation", "scale"):
            if prop in node and not all(isinstance(v, (int, float)) and math.isfinite(v) for v in node[prop]):
                raise ValueError("non-finite node transform")
    for buffer in doc.get("buffers", []):
        if "uri" in buffer:
            raise ValueError("external buffer dependency in self-contained GLB")
        if len(chunks) < 2 or buffer["byteLength"] > len(chunks[1][1]):
            raise ValueError("missing or insufficient embedded binary data")
    return len(meshes), len(nodes)

def main(paths):
    if not paths:
        raise SystemExit("Usage: validate_glb.py FILE.glb [FILE.glb ...]")
    failed = False
    for path in paths:
        try:
            meshes, nodes = validate(path)
            print(f"PASS {path}: {meshes} meshes, {nodes} nodes")
        except (OSError, ValueError, KeyError, TypeError, UnicodeError, json.JSONDecodeError) as exc:
            failed = True
            print(f"FAIL {path}: {exc}", file=sys.stderr)
    return int(failed)

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
