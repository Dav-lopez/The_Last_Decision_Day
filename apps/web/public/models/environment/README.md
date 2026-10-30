# Realistic environment assets

Original `oak.glb`, `house.glb` and `sedan.glb` are now included. The runtime loads these files from `/models/environment/`, validates that clones contain geometry, and only then replaces the procedural trees and houses. Failure leaves the procedural scene intact. See `ATTRIBUTION.md` for provenance.

**Not included:** third-party binary models. Free download does not automatically authorize redistribution. Verify license permits commercial redistribution in a game; preserve license/author/source URL in an accompanying `ATTRIBUTION.md`. Prefer CC0 or CC BY. Do not use NC, ND, editorial-only or personal-use-only assets.

**Authoring requirements:** glTF binary (.glb), textures embedded, Y-up, origin at ground center, scale in meters (tree ~4m high, house ~4m high), front of house toward positive Z. Optimize meshes and textures for mobile. Keep original road and movement geometry unchanged. Preview in a browser and run `npm run build` in `apps/web` before merging.

**Status:** These models provide a detailed stylized scene with alpha-cutout foliage, bark/siding/shingle textures, house trim, windows, guttering and parked sedans. They are not photorealistic models. Run `npm run test:environment` and visually review the browser build before manual deployment.
