# Free automated 3D environment assets

This generator uses **Blender (free, open source)** and Python, without Tripo or any paid API. Run from the repository root:

```bash
blender -b --python tools/assets/generate_environment.py -- --output apps/web/public/models/environment
```

Outputs `oak.glb` and `house.glb`, which the existing `realEnvironmentAssets.ts` loader can discover at runtime. The generator produces original geometry, not downloaded third-party assets. These are **baseline procedural assets**, not photorealistic replacements.

Validate output with a local Blender export/import roundtrip and visually inspect orientation, scale, placement and collisions before merging. Generated GLBs must be committed or deployed with the web app; this script does not run automatically on Vercel. No paid accounts or API keys required.
