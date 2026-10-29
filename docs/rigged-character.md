# Bundled student character

The guest preview and signed-in world now share one bundled skinned human with
parted hair, a long-sleeve top, trousers and shoes. The GLB includes **Idle**, **Walk**
and **Run**. Transitions reuse the existing 200 ms normalized crossfade helpers; world displacement
comes from the existing collision controller. The camera target and school
interactions remain on that controller, independent of animation.

## Source and license

- Creator: **Quaternius**.
- [Universal Base Characters, Standard](https://quaternius.com/packs/universalbasecharacters.html).
- [Universal Animation Library, Standard](https://quaternius.com/packs/universalanimationlibrary.html).
- The creator's pages and included source licenses explicitly identify **CC0 1.0**,
  allowing commercial use. The unmodified license notices are included under
  `apps/web/public/models/licenses/`.
- `human.source.json` records the pinned source mirror commit, download URLs,
  source/output SHA-256 hashes and modifications. Only asset data is taken from
  that mirror; the authoring script and runtime integration are written here.

The source is the Standard male base, not a commissioned character. This is an
initial human character upgrade; bespoke faces, multiple bodies and additional
outfits can use the same controller later.

## Visual target

The supplied football-game references set the direction for detailed faces,
convincing clothing, natural human movement and coherent lighting. The supplied
arena advertisement labels its output as an AI-generated video; that is a visual
reference, while the product milestone is an interactive scene.

The next art milestone is one complete character in a small polished street/school
scene: clothing geometry, facial detail and expressions, hair, richer materials,
grounded feet, start/stop/turn motion and consistent lighting. Review it from the
front and behind while actually playing. Measure desktop and phone frame time
before expanding the population or neighborhood. The bundled base in this PR is
an intermediate character asset; the reference-level art milestone remains open.

## Rebuild

Run `python3 scripts/build-character.py` with Python 3.10 or later. It downloads
the pinned source data, verifies hashes, rebases animation rotations onto the
character's bind pose, retains target limb lengths, remaps hair joints, creates
customizable clothing materials and embeds the eye texture. A reusable download
cache can be supplied with `--source-dir`. No third-party Python package is needed.

The ordinary frontend build uses the checked-in **707 KB GLB**; it does not run
this script, download model data, contact an asset CDN or require a paid account.

## Runtime behavior

- Keep the existing basic avatar visible while loading or if loading fails.
- Validate the mesh, skeleton, clips and finite bounds before replacing it.
- Normalize the complete character to 2.2 world units and align its rest-pose
  soles with the collision plane. Preserve the original world/camera root.
- Apply skin, hair and outfit controls to the imported materials, including
  choices made while the model is loading.
- Walk at 2.6 units/second and sprint at 5.5, with animation playback matched to
  those speeds and turns smoothed across the angle wrap.
- Dispose animations, meshes and materials when leaving the demo. Ignore late
  loads after unmount.
- Cap rendering at 1.5 device pixels per CSS pixel; high-DPI screens no longer
  accidentally render at a fraction of CSS resolution.

## Verification

`npm run test:character` checks the shipped binary, source hash, licenses,
embedded images, geometry/skin budgets, clip/joint validity, quaternion continuity
and root travel. It also imports the real asset
with Babylon's NullEngine and checks that every clip changes the skeleton pose.
The existing human-motion suite covers frame-rate independence and turning.
Existing movement, controls, appearance and school tests still apply. Browser checks should cover loading,
walking, sprinting, stopping, customization, school interaction, mobile controls,
missing/corrupt assets and leaving/reentering while a model load is pending.

Actual phone performance and final art quality require a physical-device review;
software-rendered browser checks are not a device FPS measurement.
