#!/usr/bin/env python3
"""Slim an animation-only GLB (the action clips built by build-actions.py).

The clip files are skeleton nodes plus keyframes, and most of their weight is
JSON bookkeeping (one bufferView per accessor) and keys that a straight line
between their neighbours already reproduces. This repacker:

1. drops keys that linear interpolation (slerp for rotations) between the kept
   neighbours reproduces within a tight tolerance, so playback is unchanged to
   the eye (well under a hundredth of a degree, a tenth of a millimetre);
2. stores rotations as normalized 16-bit integers (glTF 2.0 core allows this
   for animation outputs; no extension or decoder needed);
3. shares identical key-time arrays and packs every accessor into one
   bufferView per data layout.

`verify()` samples the slimmed clip at every original key time and reports the
worst error, so a regression shows up when the clips are rebuilt.
Python 3.10+, standard library only.

Usage: python scripts/slim_clips.py apps/web/public/models/human-actions.glb [...]
"""
import json
import math
import struct
import sys
from pathlib import Path

ROTATION_TOLERANCE = 2e-4     # max quaternion component error (≈0.02°)
TRANSLATION_TOLERANCE = 1e-4  # metres
FLOAT, SHORT = 5126, 5122
WIDTHS = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}


def read_glb(data):
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    blen = struct.unpack_from("<I", data, 20 + jlen)[0]
    return doc, data[28 + jlen:28 + jlen + blen]


def write_glb(doc, binary):
    binary = bytes(binary) + b"\0" * (-len(binary) % 4)
    doc["buffers"] = [{"byteLength": len(binary)}]
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    return (struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(binary))
            + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def read_accessor(doc, binary, index):
    a = doc["accessors"][index]
    view = doc["bufferViews"][a["bufferView"]]
    width = WIDTHS[a["type"]]
    fmt, size = ("f", 4) if a["componentType"] == FLOAT else ("h", 2)
    start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = view.get("byteStride", size * width)
    rows = [struct.unpack_from("<" + fmt * width, binary, start + i * stride) for i in range(a["count"])]
    if a["componentType"] == SHORT and a.get("normalized"):
        rows = [tuple(max(c / 32767.0, -1.0) for c in row) for row in rows]
    return rows


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def slerp(a, b, t):
    dot = sum(x * y for x, y in zip(a, b))
    if dot < 0:
        b, dot = tuple(-x for x in b), -dot
    if dot > 0.9995:
        q = lerp(a, b, t)
    else:
        theta = math.acos(min(dot, 1.0))
        s = math.sin(theta)
        wa, wb = math.sin((1 - t) * theta) / s, math.sin(t * theta) / s
        q = tuple(wa * x + wb * y for x, y in zip(a, b))
    n = math.sqrt(sum(x * x for x in q)) or 1.0
    return tuple(x / n for x in q)


def sample(times, values, t, rotation):
    if t <= times[0]:
        return values[0]
    if t >= times[-1]:
        return values[-1]
    lo, hi = 0, len(times) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if times[mid] <= t:
            lo = mid
        else:
            hi = mid
    span = times[hi] - times[lo]
    u = 0.0 if span <= 0 else (t - times[lo]) / span
    return (slerp if rotation else lerp)(values[lo], values[hi], u)


def error(a, b, rotation):
    if rotation and sum(x * y for x, y in zip(a, b)) < 0:
        b = tuple(-x for x in b)
    return max(abs(x - y) for x, y in zip(a, b))


def quantize(q):
    return tuple(max(-32767, min(32767, round(c * 32767))) for c in q)


def dequantize(q):
    return tuple(max(c / 32767.0, -1.0) for c in q)


def reduce_keys(times, values, rotation):
    """Greedy: extend each span while every skipped key stays within tolerance."""
    tolerance = ROTATION_TOLERANCE if rotation else TRANSLATION_TOLERANCE
    if all(error(values[0], v, rotation) < 1e-7 for v in values):
        return [times[0], times[-1]], [values[0], values[0]]
    kept = [0]
    i = 0
    while i < len(times) - 1:
        j = i + 1
        while j + 1 < len(times):
            candidate = j + 1
            ok = True
            for k in range(i + 1, candidate):
                u = (times[k] - times[i]) / (times[candidate] - times[i])
                guess = (slerp if rotation else lerp)(values[i], values[candidate], u)
                # Leave headroom for 16-bit rounding of the stored keys.
                if error(guess, values[k], rotation) > tolerance * 0.6:
                    ok = False
                    break
            if not ok:
                break
            j = candidate
        kept.append(j)
        i = j
    return [times[k] for k in kept], [values[k] for k in kept]


def slim(data):
    doc, binary = read_glb(data)
    out = bytearray()
    views = {}      # layout -> (bufferView index, bytearray)
    blobs = {}      # (layout, bytes) -> accessor index
    accessors = []

    def accessor(rows, kind, rotation=False, bounds=False):
        if rotation:
            raw = b"".join(struct.pack("<4h", *quantize(q)) for q in rows)
            layout = (SHORT, kind, True)
        else:
            raw = b"".join(struct.pack("<" + "f" * WIDTHS[kind], *r) for r in rows)
            layout = (FLOAT, kind, False)
        key = (layout, raw)
        if key in blobs:
            return blobs[key]
        chunk = views.setdefault(layout, bytearray())
        entry = {"bufferView": layout, "byteOffset": len(chunk), "componentType": layout[0],
                 "type": kind, "count": len(rows)}
        if layout[2]:
            entry["normalized"] = True
        if bounds:
            entry["min"] = [min(r[c] for r in rows) for c in range(WIDTHS[kind])]
            entry["max"] = [max(r[c] for r in rows) for c in range(WIDTHS[kind])]
        chunk.extend(raw)
        accessors.append(entry)
        blobs[key] = len(accessors) - 1
        return blobs[key]

    for clip in doc["animations"]:
        samplers = []
        for channel in clip["channels"]:
            sampler = clip["samplers"][channel["sampler"]]
            rotation = channel["target"]["path"] == "rotation"
            times = [t[0] for t in read_accessor(doc, binary, sampler["input"])]
            values = read_accessor(doc, binary, sampler["output"])
            times, values = reduce_keys(times, values, rotation)
            channel["sampler"] = len(samplers)
            samplers.append({"input": accessor([(t,) for t in times], "SCALAR", bounds=True),
                             "output": accessor(values, "VEC4" if rotation else "VEC3", rotation),
                             "interpolation": "LINEAR"})
        clip["samplers"] = samplers

    buffer_views = []
    layout_index = {}
    for layout, chunk in views.items():
        out.extend(b"\0" * (-len(out) % 4))
        layout_index[layout] = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": len(out), "byteLength": len(chunk)})
        out.extend(chunk)
    for entry in accessors:
        entry["bufferView"] = layout_index[entry["bufferView"]]
    doc["accessors"] = accessors
    doc["bufferViews"] = buffer_views
    doc.setdefault("extras", {})["slimmed"] = {
        "tool": "scripts/slim_clips.py", "rotationTolerance": ROTATION_TOLERANCE,
        "translationTolerance": TRANSLATION_TOLERANCE, "rotationStorage": "normalized int16"}
    return write_glb(doc, out)


def verify(original, slimmed):
    """Worst per-channel error, sampled at every original key time."""
    a_doc, a_bin = read_glb(original)
    b_doc, b_bin = read_glb(slimmed)
    worst = {"rotation": 0.0, "translation": 0.0}
    for clip_a, clip_b in zip(a_doc["animations"], b_doc["animations"]):
        assert clip_a["name"] == clip_b["name"]
        for ch_a, ch_b in zip(clip_a["channels"], clip_b["channels"]):
            assert ch_a["target"] == ch_b["target"]
            rotation = ch_a["target"]["path"] == "rotation"
            sa, sb = clip_a["samplers"][ch_a["sampler"]], clip_b["samplers"][ch_b["sampler"]]
            ta = [t[0] for t in read_accessor(a_doc, a_bin, sa["input"])]
            va = read_accessor(a_doc, a_bin, sa["output"])
            tb = [t[0] for t in read_accessor(b_doc, b_bin, sb["input"])]
            vb = read_accessor(b_doc, b_bin, sb["output"])
            assert abs(ta[-1] - tb[-1]) < 1e-6, "clip length changed"
            for t, v in zip(ta, va):
                path = "rotation" if rotation else "translation"
                worst[path] = max(worst[path], error(sample(tb, vb, t, rotation), v, rotation))
    return worst


def main(paths):
    for name in paths:
        path = Path(name)
        original = path.read_bytes()
        if read_glb(original)[0].get("extras", {}).get("slimmed"):
            print(f"{path.name}: already slimmed, skipping")
            continue
        slimmed = slim(original)
        worst = verify(original, slimmed)
        if worst["rotation"] > ROTATION_TOLERANCE or worst["translation"] > TRANSLATION_TOLERANCE:
            raise SystemExit(f"{path.name}: error too large {worst}")
        path.write_bytes(slimmed)
        print(f"{path.name}: {len(original):,} -> {len(slimmed):,} bytes; worst rotation "
              f"{worst['rotation']:.2e}, translation {worst['translation']:.2e}")


if __name__ == "__main__":
    main(sys.argv[1:])
