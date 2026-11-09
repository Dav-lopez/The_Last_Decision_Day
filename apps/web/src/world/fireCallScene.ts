import { Color3, Color4, DynamicTexture, MeshBuilder, ParticleSystem, StandardMaterial, Vector3, type Scene } from '../babylon';
import { HOSE, particleBudget } from './fireHose.mjs';
import type { PlanarPosition } from './movement.mjs';

export type FireCallFrame = {
  heat: number; out: boolean; hitting: boolean; spraying: boolean;
  /** Seconds since the flames went out (smoke thins away over HOSE.smoulderSeconds). */
  sinceOut: number;
  /** Where the player stands and which way they face (world, unit vector). */
  nozzle: PlanarPosition; facing: { x: number; z: number };
};

/** A soft round dot, drawn once and shared by every particle system here (no downloads). */
function dotTexture(scene: Scene) {
  const texture = new DynamicTexture('fire call dot', { width: 64, height: 64 }, scene, false);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  texture.update();
  texture.hasAlpha = true;
  return texture;
}

/**
 * A fire call's fire (open-world 16a): a burning skip on the pavement with flames, a smoke column you can see down
 * the street, a warm glow on the ground, and the hose's water arc and steam when it lands. Everything is particles
 * on one shared procedural texture plus three simple meshes, sized by the adaptive quality budget; no lights.
 */
export function createFireCall(scene: Scene, at: PlanarPosition, along: { x: number; z: number } | null, quality: { scale?: number; base?: number }) {
  const budget = particleBudget(quality);
  const texture = dotTexture(scene);
  const heading = along && Math.hypot(along.x, along.z) > 1e-6 ? Math.atan2(along.x, along.z) : 0;

  // The skip: a steel bin with a charred load inside.
  const skip = MeshBuilder.CreateBox('fire call skip', { width: 1.2, height: 0.95, depth: 1.9 }, scene);
  skip.position.set(at.x, 0.475, at.z);
  skip.rotation.y = heading;
  const steel = new StandardMaterial('fire call skip steel', scene);
  steel.diffuseColor = Color3.FromHexString('#2f5d3a');
  steel.specularColor = new Color3(0.15, 0.15, 0.15);
  skip.material = steel;
  const load = MeshBuilder.CreateBox('fire call skip load', { width: 1.05, height: 0.1, depth: 1.75 }, scene);
  load.parent = skip;
  load.position.y = 0.45;
  const char = new StandardMaterial('fire call char', scene);
  char.diffuseColor = Color3.FromHexString('#1b1714');
  char.emissiveColor = Color3.FromHexString('#5a1d06');
  char.specularColor = Color3.Black();
  load.material = char;
  // A warm glow on the ground instead of a real light (no extra light for the renderer to shade).
  const glow = MeshBuilder.CreateDisc('fire call glow', { radius: 3.4, tessellation: 32 }, scene);
  glow.rotation.x = Math.PI / 2;
  glow.position.set(at.x, 0.035, at.z);
  const glowMaterial = new StandardMaterial('fire call glow', scene);
  glowMaterial.disableLighting = true;
  glowMaterial.emissiveColor = Color3.FromHexString('#ff7a2a');
  glowMaterial.opacityTexture = texture;
  glowMaterial.alpha = 0.4;
  glow.material = glowMaterial;
  for (const mesh of [skip, load, glow]) mesh.isPickable = false;

  const top = new Vector3(at.x, 0.95, at.z);
  const make = (name: string, capacity: number) => {
    const system = new ParticleSystem(name, Math.max(8, capacity), scene);
    system.particleTexture = texture;
    system.emitter = top.clone();
    system.updateSpeed = 1 / 60;
    return system;
  };

  // Flames: additive, short-lived, rising and shrinking from yellow-white to deep red.
  const flames = make('fire call flames', budget.flames);
  flames.minEmitBox = new Vector3(-0.5, 0, -0.5);
  flames.maxEmitBox = new Vector3(0.5, 0.1, 0.5);
  flames.color1 = new Color4(1, 0.82, 0.35, 1);
  flames.color2 = new Color4(1, 0.45, 0.1, 1);
  flames.colorDead = new Color4(0.4, 0.05, 0, 0);
  flames.minSize = 0.35; flames.maxSize = 0.9;
  flames.minLifeTime = 0.35; flames.maxLifeTime = 0.8;
  flames.direction1 = new Vector3(-0.25, 1, -0.25);
  flames.direction2 = new Vector3(0.25, 1.4, 0.25);
  flames.minEmitPower = 1.2; flames.maxEmitPower = 2.4;
  flames.gravity = new Vector3(0, 1.5, 0);
  flames.addSizeGradient(0, 0.7); flames.addSizeGradient(0.35, 1); flames.addSizeGradient(1, 0.2);
  flames.blendMode = ParticleSystem.BLENDMODE_ADD;

  // Smoke: a slow grey column that drifts and spreads, visible from down the street.
  const smoke = make('fire call smoke', budget.smoke);
  smoke.emitter = new Vector3(at.x, 1.5, at.z);
  smoke.minEmitBox = new Vector3(-0.35, 0, -0.5);
  smoke.maxEmitBox = new Vector3(0.35, 0.3, 0.5);
  smoke.color1 = new Color4(0.22, 0.21, 0.2, 0.55);
  smoke.color2 = new Color4(0.36, 0.35, 0.34, 0.45);
  smoke.colorDead = new Color4(0.5, 0.5, 0.5, 0);
  smoke.minSize = 0.9; smoke.maxSize = 1.6;
  smoke.minLifeTime = 3.5; smoke.maxLifeTime = 6;
  smoke.direction1 = new Vector3(-0.3, 1, -0.3);
  smoke.direction2 = new Vector3(0.5, 1.3, 0.3);
  smoke.minEmitPower = 0.8; smoke.maxEmitPower = 1.4;
  smoke.gravity = new Vector3(0.12, 0.25, 0.05);
  smoke.addSizeGradient(0, 0.6); smoke.addSizeGradient(1, 3.2);
  smoke.minAngularSpeed = -0.4; smoke.maxAngularSpeed = 0.4;
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  // Steam where the water lands on the flames: white, quick, puffing up.
  const steam = make('fire call steam', Math.round(budget.smoke * 0.6));
  steam.minEmitBox = new Vector3(-0.5, 0, -0.5);
  steam.maxEmitBox = new Vector3(0.5, 0.2, 0.5);
  steam.color1 = new Color4(0.92, 0.94, 0.96, 0.5);
  steam.color2 = new Color4(0.8, 0.84, 0.88, 0.4);
  steam.colorDead = new Color4(1, 1, 1, 0);
  steam.minSize = 0.5; steam.maxSize = 1.1;
  steam.minLifeTime = 0.8; steam.maxLifeTime = 1.6;
  steam.direction1 = new Vector3(-0.6, 1.5, -0.6);
  steam.direction2 = new Vector3(0.6, 2.2, 0.6);
  steam.minEmitPower = 1; steam.maxEmitPower = 2;
  steam.addSizeGradient(0, 0.5); steam.addSizeGradient(1, 2.4);
  steam.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  // The hose: a jet of small droplets in an arc under gravity, re-aimed every frame from the player's hands.
  const water = make('fire call water', budget.water);
  water.emitter = new Vector3(at.x, 1.1, at.z);
  water.minEmitBox = Vector3.Zero(); water.maxEmitBox = Vector3.Zero();
  water.color1 = new Color4(0.75, 0.88, 1, 0.85);
  water.color2 = new Color4(0.55, 0.75, 0.95, 0.7);
  water.colorDead = new Color4(0.8, 0.9, 1, 0);
  water.minSize = 0.08; water.maxSize = 0.2;
  water.minLifeTime = 0.6; water.maxLifeTime = 0.85;
  water.minEmitPower = 11; water.maxEmitPower = 13;
  water.gravity = new Vector3(0, -9.81, 0);
  water.addSizeGradient(0, 0.6); water.addSizeGradient(1, 1.8);
  water.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  const systems = [flames, smoke, steam, water];
  for (const system of systems) { system.emitRate = 0; system.start(); }
  let time = 0;
  const nozzle = water.emitter as Vector3;

  return {
    update(seconds: number, frame: FireCallFrame) {
      time += seconds;
      const heat = frame.out ? 0 : Math.max(0, Math.min(1, frame.heat));
      const flicker = 0.85 + 0.15 * Math.sin(time * 17) * Math.sin(time * 7.3);
      flames.emitRate = heat > 0 ? budget.flames * (0.25 + 0.75 * heat) * 0.9 : 0;
      flames.minSize = 0.2 + 0.25 * heat; flames.maxSize = 0.45 + 0.6 * heat;
      flames.minEmitPower = 0.8 + 0.6 * heat; flames.maxEmitPower = 1.4 + 1.2 * heat;
      // Smoke keeps rising for a while after the flames are out, then thins away.
      const smoulder = frame.out ? Math.max(0, 1 - frame.sinceOut / HOSE.smoulderSeconds) : 1;
      smoke.emitRate = budget.smoke * 0.22 * (frame.out ? 0.6 * smoulder : 0.4 + 0.6 * heat);
      steam.emitRate = frame.hitting ? budget.smoke * 0.5 : 0;
      glowMaterial.alpha = 0.42 * heat * flicker;
      glow.setEnabled(heat > 0.01);
      char.emissiveColor.set(0.35 * heat * flicker + 0.02, 0.11 * heat * flicker, 0.02 * heat);
      // Aim the jet: out of the player's hands, along their facing, tilted up a little to carry.
      const fx = frame.facing.x, fz = frame.facing.z;
      const sx = -fz * 0.045, sz = fx * 0.045;
      nozzle.set(frame.nozzle.x + fx * 0.55, 1.1, frame.nozzle.z + fz * 0.55);
      water.direction1.set(fx + sx, 0.1, fz + sz);
      water.direction2.set(fx - sx, 0.2, fz - sz);
      water.emitRate = frame.spraying ? budget.water * 0.9 : 0;
    },
    dispose() {
      for (const system of systems) { system.stop(); system.dispose(false); }
      for (const mesh of [load, skip, glow]) mesh.dispose();
      for (const material of [steel, char, glowMaterial]) material.dispose();
      texture.dispose();
    },
  };
}
export type FireCallView = ReturnType<typeof createFireCall>;
