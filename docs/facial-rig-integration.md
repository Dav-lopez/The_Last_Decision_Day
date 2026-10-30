# Facial realism: asset acceptance checklist

The bundled `human.glb` is stylized and does **not** yet contain facial blendshapes. PR #82 supplies expression controls, but a detailed face asset is still required.

## Interim mouth animation

The generator now authors a lightweight skinned lip strip attached to the
Quaternius Head joint, with separate smile/frown/press and jaw/mouth opening
POSITION morph targets. The existing emotion controller can drive these once
the generated GLB is reviewed and committed. Run
`python scripts/test_facial_mouth.py` for the geometry unit tests.

This is **stylized geometry**, not a photorealistic replacement face: the
procedural lips use estimated source rest-pose coordinates and must be visually
checked for alignment, clipping, and skin-tone compatibility in Babylon.js.
The current detailed-face validator still requires cheek morphs that the
interim character does not provide.

## Candidate head requirements

- Legally redistributable in a public/commercial game (record license, author and source URL); no personal-use or noncommercial-only downloads.
- GLB 2.0 with a skin/skeleton compatible with the game's idle/walk/run rig; do not overwrite the existing character blindly.
- Detailed facial geometry, eyes, eyelids, nose, lips, eyebrows and realistic skin texture maps. Preserve all body animations.
- Named ARKit-style morph targets for blinking, brow movement, smiling, frowning and jaw opening. Run `python scripts/validate-face-glb.py candidate.glb` to inspect essentials.
- Verify real-time facial deformation and skinning in Babylon.js on desktop **and mobile**; no broken eyelids, texture seams or detached head.
- Keep asset sizes and draw calls within browser budgets; optimize textures and meshes before merging.

## Delivery sequence

1. Source or author a properly licensed facially rigged human asset.
2. Validate morph names and skeletal compatibility; inspect face close-up.
3. Connect PR #82 expression controller and blink animation.
4. Add crying tears, blushing and sweating effects, driven by gameplay.
5. Visual QA, mobile performance and fallback behavior.

This validation PR is **not** a replacement head model and does not itself add visible facial expressions.
