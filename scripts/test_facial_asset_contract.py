#!/usr/bin/env python3
"""Synthetic regression tests for the generated-face release gate (offline)."""
import copy
import json
import struct
import unittest

from facial_asset_contract import (
    HEAD_MESHES, REQUIRED_MORPHS, TRANSPARENT, parse_glb, validate, vectors,
)


def fixture():
    binary = bytearray()
    doc = {
        "asset": {"version": "2.0"}, "buffers": [{"byteLength": 0}],
        "bufferViews": [], "accessors": [], "materials": [],
        "nodes": [{"name": "Head"}], "skins": [{"joints": [0]}],
        "meshes": [], "animations": [{"name": x} for x in ("Idle", "Walk", "Run")],
    }

    def accessor(values, kind, component):
        widths = {5121: "B", 5126: "f"}
        code = widths[component]
        start = len(binary)
        for row in values:
            binary.extend(struct.pack("<" + code * len(row), *row))
        size = len(binary) - start
        view = len(doc["bufferViews"])
        doc["bufferViews"].append({"buffer": 0, "byteOffset": start, "byteLength": size})
        index = len(doc["accessors"])
        doc["accessors"].append({
            "bufferView": view, "componentType": component,
            "count": len(values), "type": kind,
        })
        return index

    for name in sorted(HEAD_MESHES):
        pos = accessor([(0.0, 1.6, 0.08)], "VEC3", 5126)
        joints = accessor([(0, 0, 0, 0)], "VEC4", 5121)
        weights = accessor([(1.0, 0.0, 0.0, 0.0)], "VEC4", 5126)
        material = len(doc["materials"])
        is_overlay = name in TRANSPARENT
        doc["materials"].append({
            "name": TRANSPARENT[name] if is_overlay else "Student lips",
            "alphaMode": "BLEND" if is_overlay else "OPAQUE",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.5, 0.5, 0.5, 0.0 if is_overlay else 1.0],
            },
        })
        morphs = sorted(REQUIRED_MORPHS) if name == "Student expressive lips" else []
        targets = [{"POSITION": accessor([(0.001, 0.0, 0.0)], "VEC3", 5126)}
                   for _ in morphs]
        mesh_id = len(doc["meshes"])
        doc["meshes"].append({
            "name": name,
            "extras": {"targetNames": morphs},
            "primitives": [{
                "attributes": {"POSITION": pos, "JOINTS_0": joints, "WEIGHTS_0": weights},
                "material": material, "targets": targets,
            }],
        })
        doc["nodes"].append({"name": name + " surface", "mesh": mesh_id, "skin": 0})
    doc["buffers"][0]["byteLength"] = len(binary)
    return doc, bytes(binary)


def glb(doc, binary):
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 28 + len(encoded) + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total) +
            struct.pack("<II", len(encoded), 0x4E4F534A) + encoded +
            struct.pack("<II", len(binary), 0x004E4942) + binary)


class FacialAssetContractTests(unittest.TestCase):
    def test_valid_generated_fixture(self):
        doc, binary = fixture()
        loaded, data = parse_glb(glb(doc, binary))
        self.assertEqual(validate(loaded, data), len(REQUIRED_MORPHS))

    def test_missing_morph_is_rejected(self):
        doc, binary = fixture()
        lips = next(m for m in doc["meshes"] if m["name"] == "Student expressive lips")
        lips["extras"]["targetNames"].pop()
        lips["primitives"][0]["targets"].pop()
        with self.assertRaisesRegex(ValueError, "Missing usable facial morphs"):
            validate(doc, binary)

    def test_zero_displacement_is_rejected(self):
        doc, binary = fixture()
        lips = next(m for m in doc["meshes"] if m["name"] == "Student expressive lips")
        index = lips["primitives"][0]["targets"][0]["POSITION"]
        view = doc["bufferViews"][doc["accessors"][index]["bufferView"]]
        changed = bytearray(binary)
        struct.pack_into("<fff", changed, view["byteOffset"], 0.0, 0.0, 0.0)
        with self.assertRaisesRegex(ValueError, "zero or implausibly large"):
            validate(doc, changed)

    def test_unskinned_tear_is_rejected(self):
        doc, binary = fixture()
        node = next(n for n in doc["nodes"] if n.get("name") == "Student tear Left surface")
        del node["skin"]
        with self.assertRaisesRegex(ValueError, "not skinned"):
            validate(doc, binary)

    def test_opaque_blush_is_rejected(self):
        doc, binary = fixture()
        material = next(m for m in doc["materials"] if m["name"] == "Student cheek blush")
        material["pbrMetallicRoughness"]["baseColorFactor"][3] = 1
        with self.assertRaisesRegex(ValueError, "transparent at rest"):
            validate(doc, binary)

    def test_accessor_cannot_read_past_buffer_view(self):
        doc, binary = fixture()
        index = doc["meshes"][0]["primitives"][0]["attributes"]["POSITION"]
        doc["bufferViews"][doc["accessors"][index]["bufferView"]]["byteLength"] = 4
        with self.assertRaisesRegex(ValueError, "extends beyond"):
            vectors(doc, binary, index)

    def test_glb_truncation_is_rejected(self):
        doc, binary = fixture()
        with self.assertRaisesRegex(ValueError, "length mismatch"):
            parse_glb(glb(doc, binary)[:-4])


if __name__ == "__main__":
    unittest.main()
