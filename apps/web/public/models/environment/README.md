# Realistic environment assets

Place license-reviewed `oak.glb` and `house.glb` here. The runtime will load these files from `/models/environment/` when available, replacing the procedural tree and house meshes. Missing files leave the original environment intact.

**Not included:** third-party binary models. Free download does not automatically authorize redistribution. Verify license permits commercial redistribution in a game; preserve license/author/source URL in an accompanying `ATTRIBUTION.md`. Prefer CC0 or CC BY. Do not use NC, ND, editorial-only or personal-use-only assets.

**Authoring requirements:** glTF binary (.glb), textures embedded, Y-up, origin at ground center, scale in meters (tree ~4m high, house ~4m high), front of house toward positive Z. Optimize meshes and textures for mobile. Keep original road and movement geometry unchanged. Preview in a browser and run `npm run build` in `apps/web` before merging.

**Status:** This PR implements a safe asset replacement pipeline, not a near-photorealistic scene by itself. To achieve the target, actual licensed high-quality models must be supplied and validated.
