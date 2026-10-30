import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Vector3, type Scene } from '@babylonjs/core';

type SkyPalette = { zenith: string; upper: string; horizon: string; haze: string; clouds: string; cloudAlpha: number; sun: string };
const DAY: SkyPalette = { zenith: '#3f7fc8', upper: '#78ace0', horizon: '#cfe2f0', haze: '#dbe7ee', clouds: '#ffffff', cloudAlpha: 0.75, sun: '#fff6dc' };
const DUSK: SkyPalette = { zenith: '#141c38', upper: '#3a3f6a', horizon: '#d98a5f', haze: '#7a6a78', clouds: '#f0b48e', cloudAlpha: 0.55, sun: '#ffb070' };

/** Deterministic pseudo-random numbers so the clouds are the same every load. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Paint a sky texture for the inside of a sphere: the gradient runs down the
 * texture's V axis (top = zenith), clouds are soft overlapping puffs that wrap
 * around U so there is no seam.
 */
function paintSky(scene: Scene, name: string, palette: SkyPalette) {
  const width = 1024;
  const height = 512;
  const texture = new DynamicTexture(name, { width, height }, scene, true);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette.zenith);
  gradient.addColorStop(0.32, palette.upper);
  gradient.addColorStop(0.49, palette.horizon);
  gradient.addColorStop(0.53, palette.haze);
  gradient.addColorStop(1, palette.haze);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const next = seeded(7);
  // Cloud bands sit between ~10° and ~40° above the horizon.
  for (let cloud = 0; cloud < 38; cloud++) {
    const cx = next() * width;
    const cy = height * (0.2 + next() * 0.24);
    const size = 30 + next() * 70;
    for (let puff = 0; puff < 9; puff++) {
      const px = cx + (next() - 0.5) * size * 2.6;
      const py = cy + (next() - 0.5) * size * 0.45;
      const radius = size * (0.35 + next() * 0.45);
      for (const offset of [-width, 0, width]) {
        const glow = context.createRadialGradient(px + offset, py, 0, px + offset, py, radius);
        glow.addColorStop(0, hexWithAlpha(palette.clouds, palette.cloudAlpha * 0.55));
        glow.addColorStop(1, hexWithAlpha(palette.clouds, 0));
        context.fillStyle = glow;
        context.fillRect(px + offset - radius, py - radius, radius * 2, radius * 2);
      }
    }
  }
  texture.update();
  return texture;
}

function hexWithAlpha(hex: string, alpha: number) {
  const value = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${value}`;
}

function paintSunGlow(scene: Scene) {
  const texture = new DynamicTexture('sky sun glow', { width: 256, height: 256 }, scene, true);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const glow = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.08, 'rgba(255,250,235,0.95)');
  glow.addColorStop(0.25, 'rgba(255,236,200,0.35)');
  glow.addColorStop(1, 'rgba(255,230,190,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 256, 256);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

export type Atmosphere = { setEvening: (evening: boolean) => void; dispose: () => void };

/**
 * A painted sky dome with clouds and a sun glow, and fog matched to the
 * horizon so the town fades into the sky instead of into a flat colour.
 * `sunDirection` is the direction the sunlight travels (toward the ground).
 */
export function createAtmosphere(scene: Scene, sunDirection: Vector3): Atmosphere {
  const dayTexture = paintSky(scene, 'sky day', DAY);
  const duskTexture = paintSky(scene, 'sky dusk', DUSK);
  const skyMaterial = new StandardMaterial('sky dome', scene);
  skyMaterial.disableLighting = true;
  skyMaterial.backFaceCulling = false;
  skyMaterial.fogEnabled = false;
  skyMaterial.emissiveTexture = dayTexture;
  skyMaterial.diffuseColor = Color3.Black();
  skyMaterial.specularColor = Color3.Black();
  const dome = MeshBuilder.CreateSphere('sky dome', { diameter: 1600, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.material = skyMaterial;
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  // Render behind everything else.
  dome.renderingGroupId = 0;

  const glowMaterial = new StandardMaterial('sky sun glow', scene);
  glowMaterial.disableLighting = true;
  glowMaterial.fogEnabled = false;
  glowMaterial.emissiveTexture = paintSunGlow(scene);
  glowMaterial.opacityTexture = glowMaterial.emissiveTexture;
  glowMaterial.diffuseColor = Color3.Black();
  const glow = MeshBuilder.CreatePlane('sky sun', { size: 150 }, scene);
  glow.material = glowMaterial;
  glow.billboardMode = Mesh.BILLBOARDMODE_ALL;
  glow.infiniteDistance = true;
  glow.isPickable = false;
  glow.applyFog = false;
  glow.position = sunDirection.normalizeToNew().scale(-700);

  const setEvening = (evening: boolean) => {
    const palette = evening ? DUSK : DAY;
    skyMaterial.emissiveTexture = evening ? duskTexture : dayTexture;
    glowMaterial.emissiveColor = Color3.FromHexString(palette.sun);
    glow.visibility = evening ? 0.55 : 0.9;
    // Fog fades distant buildings and trees into the horizon colour.
    const haze = Color3.FromHexString(palette.haze);
    scene.fogColor = haze;
    scene.clearColor = new Color4(haze.r, haze.g, haze.b, 1);
  };
  setEvening(false);
  return {
    setEvening,
    dispose() {
      dome.dispose();
      glow.dispose();
      skyMaterial.dispose();
      glowMaterial.dispose();
      dayTexture.dispose();
      duskTexture.dispose();
    },
  };
}
