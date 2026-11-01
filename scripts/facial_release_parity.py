#!/usr/bin/env python3
"""Verify that a facial-model release ships *both* compatible character bodies.

Run after build-character.py, before proposing binary changes. The checked-in
GLBs can be older than the generator, so this gate intentionally validates the
freshly generated files, not the existing main-branch artifacts.
"""
import hashlib
import json
import sys
from pathlib import Path

from facial_asset_contract import parse_glb, validate, vectors
from facial_eyelids import EYELID_TARGETS
from facial_brows import STROKES_PER_ROW, ROWS, VERTICES_PER_FIBRE

VARIANTS = {"male": ("human.glb", "human.source.json"),
            "female": ("human-female.glb", "human-female.source.json")}
FACE_MESHES = {
    "Student expressive lips", "Student oral cavity", "Student upper teeth",
    "Student tongue", "Student lower teeth", "Student expressive cheeks", "Student sculpted nose",
    "Student sculpted ears",
    "Student eyebrow fibres", "Student nasolabial folds", "Student eyelid rims", "Student corneal shells",
    "Student tear Left", "Student tear Right", "Student sweat Left", "Student sweat Right",
}
EXPECTED_HAIR = {"parted", "buzzed", "pixie", "long", "buns", "beard"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_manifest(manifest, raw, filename, body, targets):
    output = manifest.get("output", {})
    require(manifest.get("body") == body, f"{body}: manifest body mismatch")
    require(output.get("file") == filename, f"{body}: manifest output filename mismatch")
    require(output.get("bytes") == len(raw), f"{body}: manifest byte length mismatch")
    require(output.get("sha256") == hashlib.sha256(raw).hexdigest(),
            f"{body}: manifest SHA-256 mismatch (stale GLB or manifest)")
    require(output.get("morphTargets") == sorted(targets),
            f"{body}: manifest morph targets differ from actual GLB")
    require(manifest.get("license") == "CC0-1.0", f"{body}: license provenance mismatch")


def compare_profiles(male, female):
    for key in ("targets", "face_meshes", "hair", "clips", "source_commit"):
        require(male[key] == female[key], f"male/female {key} mismatch")
    require(male["sha256"] != female["sha256"],
            "male/female binaries unexpectedly identical; check variant export")



def validate_hairstyles(mesh_names, body):
    """Detail overlays share a hairstyle but are not selectable hairstyles."""
    prefix = "Student hair "
    hair = set()
    detail = set()
    for name in mesh_names:
        if not name.startswith(prefix):
            continue
        style = name[len(prefix):]
        if style.endswith(" detail"):
            detail.add(style.removesuffix(" detail"))
        else:
            hair.add(style)
    require(hair == EXPECTED_HAIR, f"{body}: hairstyle choices missing or unexpected: {hair}")
    require(detail == EXPECTED_HAIR, f"{body}: hairstyle detail overlays missing or unexpected: {detail}")
    return hair

def inspect_variant(folder, body):
    filename, manifest_name = VARIANTS[body]
    raw = (folder / filename).read_bytes()
    manifest = json.loads((folder / manifest_name).read_text())
    doc, binary = parse_glb(raw)
    validate(doc, binary)  # real nonzero morph, head skin, transparent effect contract
    require(doc.get("extras", {}).get("body") == body, f"{body}: wrong GLB body type")
    require(doc.get("extras", {}).get("sourceCommit") == manifest.get("sourceMirrorCommit"),
            f"{body}: source commit provenance mismatch")
    names = {name for mesh in doc["meshes"]
             for name in mesh.get("extras", {}).get("targetNames", [])}
    check_manifest(manifest, raw, filename, body, names)

    skin = doc["skins"][0]
    head = next((i for i, n in enumerate(skin["joints"])
                 if doc["nodes"][n].get("name") == "Head"), None)
    require(head is not None, f"{body}: missing Head joint")
    meshes = {mesh["name"]: (i, mesh) for i, mesh in enumerate(doc["meshes"])}
    require(FACE_MESHES <= meshes.keys(), f"{body}: missing face meshes: {FACE_MESHES - meshes.keys()}")
    for name in FACE_MESHES:
        index, mesh = meshes[name]
        require(any(node.get("mesh") == index and node.get("skin") == 0 for node in doc["nodes"]),
                f"{body}: {name} is not attached to the character skin")
        for primitive in mesh["primitives"]:
            attrs = primitive["attributes"]
            require({"POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"} <= attrs.keys(),
                    f"{body}: {name} lacks skinned geometry attributes")
            joints = vectors(doc, binary, attrs["JOINTS_0"])
            weights = vectors(doc, binary, attrs["WEIGHTS_0"])
            positions = vectors(doc, binary, attrs["POSITION"])
            require(len(joints) == len(weights) == len(positions),
                    f"{body}: {name} vertex/skin count mismatch")
            require(all(j[0] == head and all(v == 0 for v in j[1:]) and
                        abs(w[0] - 1) < 1e-5 and all(abs(v) < 1e-5 for v in w[1:])
                        for j, w in zip(joints, weights)),
                    f"{body}: {name} must follow the Head bone")

    brow = meshes["Student eyebrow fibres"][1]["primitives"][0]
    require(brow["material"] == 4, f"{body}: brow fibres must inherit hair colour")
    require(meshes["Student eyebrow fibres"][1].get("extras", {}).get("targetNames") ==
            ["browInnerUp", "browDownLeft", "browDownRight"],
            f"{body}: eyebrow fibres must follow the existing expression morphs")
    require(len(brow.get("targets", [])) == 3,
            f"{body}: eyebrow fibre morph geometry missing")
    require(len(vectors(doc, binary, brow["attributes"]["POSITION"])) == 2 * ROWS * STROKES_PER_ROW * VERTICES_PER_FIBRE,
            f"{body}: unexpected eyebrow fibre vertex budget")


    folds = meshes["Student nasolabial folds"][1]
    fold_primitive = folds["primitives"][0]
    require(fold_primitive["material"] == 0,
            f"{body}: nasolabial folds must inherit customizable skin")
    require(folds.get("extras", {}).get("targetNames") ==
            ["mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight"],
            f"{body}: smile folds must follow existing bilateral mouth-corner morphs")
    require(len(fold_primitive.get("targets", [])) == 4,
            f"{body}: nasolabial fold morph geometry missing")
    require(len(vectors(doc, binary, fold_primitive["attributes"]["POSITION"])) == 44,
            f"{body}: unexpected smile-fold vertex budget")

    # Eyelid rims and lashes must follow eye-wide/squint as well as blink.
    # Checking the *specific mesh* prevents an unrelated eye morph from
    # accidentally satisfying the generated asset release contract.
    eyelids = meshes["Student eyelid rims"][1]
    eyelid_primitive = eyelids["primitives"][0]
    require(eyelids.get("extras", {}).get("targetNames") == list(EYELID_TARGETS),
            f"{body}: eyelid rims missing synchronized expression morphs")
    require(len(eyelid_primitive.get("targets", [])) == len(EYELID_TARGETS),
            f"{body}: eyelid expression morph geometry missing")
    require(eyelid_primitive["material"] == 4,
            f"{body}: eyelid lashes must inherit hair colour")
    require(len(vectors(doc, binary, eyelid_primitive["attributes"]["POSITION"])) >= 100,
            f"{body}: eyelid/lash geometry unexpectedly sparse")
    for name, target in zip(EYELID_TARGETS, eyelid_primitive["targets"]):
        deltas = vectors(doc, binary, target["POSITION"])
        require(any(abs(row[1]) > 0.001 for row in deltas),
                f"{body}: eyelid {name} has no usable displacement")

    lower_mesh = meshes["Student lower teeth"][1]
    lower = lower_mesh["primitives"][0]
    require(lower_mesh.get("extras", {}).get("targetNames") == ["jawOpen", "mouthOpen"],
            f"{body}: lower teeth must follow both jaw and mouth articulation")
    require(len(lower.get("targets", [])) == 2,
            f"{body}: lower teeth morph geometry missing")
    require(len(vectors(doc, binary, lower["attributes"]["POSITION"])) == 32,
            f"{body}: expected eight independent lower tooth crowns")
    require(len(vectors(doc, binary, lower["indices"])) == 48,
            f"{body}: unexpected lower dental triangle budget")
    require(doc["materials"][lower["material"]]["name"] == "Student lower teeth",
            f"{body}: lower dental material missing")

    hair = validate_hairstyles(meshes.keys(), body)
    clips = {animation["name"] for animation in doc["animations"]}
    require(clips == {"Idle", "Walk", "Run"}, f"{body}: locomotion clips changed: {clips}")
    return {"targets": names, "face_meshes": FACE_MESHES & meshes.keys(),
            "hair": hair, "clips": clips,
            "source_commit": doc["extras"]["sourceCommit"],
            "sha256": hashlib.sha256(raw).hexdigest()}


def verify_release(folder):
    male = inspect_variant(folder, "male")
    female = inspect_variant(folder, "female")
    compare_profiles(male, female)
    print(f"PASS: male and female GLBs contain {len(male['targets'])} matching morphs, "
          f"{len(FACE_MESHES)} head-skinned facial meshes, six hairstyles, "
          "and Idle/Walk/Run; both SHA-256 manifests match")


if __name__ == "__main__":
    try:
        verify_release(Path(sys.argv[1]) if len(sys.argv) == 2 else
                       Path(__file__).resolve().parents[1] / "apps/web/public/models")
    except (OSError, ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        sys.exit(f"FAIL: facial-model release parity: {error}")
