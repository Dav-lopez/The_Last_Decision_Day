# Original neighborhood assets

`oak.glb`, `house.glb`, `sedan.glb` and every embedded PNG texture were authored
specifically for The Last Decision Day by `tools/assets/build_street_assets.py`.
No downloaded models, photographs, paid APIs or third-party animation clips are
included in these three files. They may be used, modified and redistributed with
this project, including commercial game builds.

These are original stylized assets, not photorealistic scans. Rebuild with Python 3
and Pillow: `python tools/assets/build_street_assets.py` from the repository root.

Coordinates: glTF Y-up, metres, ground-level origin; house front is +Z. Their
footprints match the existing buildings and the shared parked-car collision data.
Textures are embedded; no external image host or decoder download is required.
