#!/usr/bin/env python3
"""Fast offline tests for the two-body facial release gate."""
import hashlib
import struct
import unittest
from facial_release_parity import check_manifest, compare_profiles, validate_hairstyles, verify_morph_shading, EXPECTED_HAIR
from facial_mouth import build_mouth_geometry
from facial_smile_folds import build_smile_fold_geometry


class ReleaseParityTests(unittest.TestCase):
    def setUp(self):
        self.raw = b"generated-glb-bytes"
        self.names = {"eyeBlinkLeft", "eyeBlinkRight"}
        self.manifest = {
            "body": "female", "license": "CC0-1.0",
            "output": {"file": "human-female.glb", "bytes": len(self.raw),
                       "sha256": hashlib.sha256(self.raw).hexdigest(),
                       "morphTargets": sorted(self.names)},
        }
        self.male = {"targets": self.names, "face_meshes": {"Student corneal shells"},
                     "hair": {"parted", "long"}, "clips": {"Idle", "Walk", "Run"},
                     "source_commit": "pinned", "sha256": "male"}
        self.female = {**self.male, "sha256": "female"}

    def test_matching_manifest_and_distinct_bodies(self):
        check_manifest(self.manifest, self.raw, "human-female.glb", "female", self.names)
        compare_profiles(self.male, self.female)

    def test_stale_binary_or_manifest_is_rejected(self):
        for raw in (self.raw + b"!", self.raw[:-1]):
            with self.assertRaisesRegex(ValueError, "length mismatch"):
                check_manifest(self.manifest, raw, "human-female.glb", "female", self.names)
        stale = {**self.manifest, "output": {**self.manifest["output"], "sha256": "0" * 64}}
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            check_manifest(stale, self.raw, "human-female.glb", "female", self.names)

    def test_wrong_body_filename_and_morph_manifest_are_rejected(self):
        for filename, body, names in (("human.glb", "female", self.names),
                                      ("human-female.glb", "male", self.names),
                                      ("human-female.glb", "female", {"eyeBlinkLeft"})):
            with self.assertRaises(ValueError):
                check_manifest(self.manifest, self.raw, filename, body, names)

    def test_different_facial_features_are_rejected(self):
        for field in ("targets", "face_meshes", "hair", "clips", "source_commit"):
            changed = {**self.female, field: {"different"} if field != "source_commit" else "other"}
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                compare_profiles(self.male, changed)
        with self.assertRaisesRegex(ValueError, "identical"):
            compare_profiles(self.male, {**self.female, "sha256": "male"})


    def test_hair_detail_overlays_are_not_counted_as_separate_styles(self):
        meshes = {f"Student hair {style}" for style in EXPECTED_HAIR}
        overlays = {f"Student hair {style} detail" for style in EXPECTED_HAIR}
        self.assertEqual(validate_hairstyles(meshes | overlays, "male"), EXPECTED_HAIR)
        with self.assertRaisesRegex(ValueError, "detail overlays"):
            validate_hairstyles(meshes, "male")
        with self.assertRaisesRegex(ValueError, "hairstyle choices"):
            validate_hairstyles((meshes - {"Student hair parted"}) | overlays, "male")
        with self.assertRaisesRegex(ValueError, "detail overlays"):
            validate_hairstyles(meshes | (overlays - {"Student hair beard detail"}), "female")


def shading_fixture(mesh_name):
    """Encode real procedural face geometry as glTF accessors in a tiny BIN."""
    geometry = (build_mouth_geometry(7) if mesh_name == "Student expressive lips"
                else build_smile_fold_geometry(7))
    binary = bytearray()
    doc = {"meshes": [], "accessors": [], "bufferViews": []}

    def accessor(rows):
        offset = len(binary)
        for row in rows:
            binary.extend(struct.pack("<fff", *row))
        view = len(doc["bufferViews"])
        doc["bufferViews"].append({
            "buffer": 0, "byteOffset": offset, "byteLength": len(rows) * 12,
        })
        index = len(doc["accessors"])
        doc["accessors"].append({
            "bufferView": view, "componentType": 5126,
            "type": "VEC3", "count": len(rows),
        })
        return index

    primitive = {
        "attributes": {
            "POSITION": accessor(geometry["positions"]),
            "NORMAL": accessor(geometry["normals"]),
        },
        "targets": [
            {"POSITION": accessor(positions), "NORMAL": accessor(normals)}
            for positions, normals in zip(geometry["targets"], geometry["normal_targets"])
        ],
    }
    doc["meshes"].append({
        "name": mesh_name, "extras": {"targetNames": list(geometry["names"])},
        "primitives": [primitive],
    })
    return doc, binary


class FacialMorphShadingTests(unittest.TestCase):
    EXPRESSIVE = {"mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight"}

    def verify(self, doc, binary, mesh):
        return verify_morph_shading(doc, binary, mesh, self.EXPRESSIVE)

    def test_generated_lips_and_smile_folds_export_valid_normal_morphs(self):
        for mesh in ("Student expressive lips", "Student nasolabial folds"):
            with self.subTest(mesh=mesh):
                doc, binary = shading_fixture(mesh)
                self.assertGreaterEqual(self.verify(doc, binary, mesh), 4)

    def test_missing_normal_target_is_rejected(self):
        mesh = "Student expressive lips"
        doc, binary = shading_fixture(mesh)
        del doc["meshes"][0]["primitives"][0]["targets"][0]["NORMAL"]
        with self.assertRaisesRegex(ValueError, "missing NORMAL morph"):
            self.verify(doc, binary, mesh)

    def test_flat_frozen_shading_is_rejected(self):
        mesh = "Student nasolabial folds"
        doc, binary = shading_fixture(mesh)
        target = doc["meshes"][0]["primitives"][0]["targets"][0]
        accessor = doc["accessors"][target["NORMAL"]]
        offset = doc["bufferViews"][accessor["bufferView"]]["byteOffset"]
        for i in range(accessor["count"]):
            struct.pack_into("<fff", binary, offset + 12 * i, 0.0, 0.0, 0.0)
        with self.assertRaisesRegex(ValueError, "no expression-responsive shading"):
            self.verify(doc, binary, mesh)

    def test_invalid_normal_count_is_rejected(self):
        mesh = "Student expressive lips"
        doc, binary = shading_fixture(mesh)
        target = doc["meshes"][0]["primitives"][0]["targets"][0]
        doc["accessors"][target["NORMAL"]]["count"] -= 1
        with self.assertRaisesRegex(ValueError, "normal delta count mismatch"):
            self.verify(doc, binary, mesh)

    def test_opposite_cheek_normal_motion_is_rejected(self):
        mesh = "Student nasolabial folds"
        doc, binary = shading_fixture(mesh)
        primitive = doc["meshes"][0]["primitives"][0]
        target = primitive["targets"][0]  # mouthSmileLeft
        positions = build_smile_fold_geometry(7)["positions"]
        opposite = next(i for i, pos in enumerate(positions) if pos[0] > 0)
        accessor = doc["accessors"][target["NORMAL"]]
        offset = doc["bufferViews"][accessor["bufferView"]]["byteOffset"]
        # A tiny contamination preserves unit length within tolerance, so
        # the bilateral isolation check must catch it independently.
        struct.pack_into("<fff", binary, offset + 12 * opposite, 0.01, 0.0, 0.0)
        with self.assertRaisesRegex(ValueError, "opposite cheek"):
            self.verify(doc, binary, mesh)


if __name__ == "__main__":
    unittest.main()
