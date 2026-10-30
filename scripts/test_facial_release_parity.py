#!/usr/bin/env python3
"""Fast offline tests for the two-body facial release gate."""
import hashlib
import unittest
from facial_release_parity import check_manifest, compare_profiles, validate_hairstyles, EXPECTED_HAIR


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


if __name__ == "__main__":
    unittest.main()
