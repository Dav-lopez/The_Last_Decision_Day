import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, type Scene } from '@babylonjs/core';
import type { CareerId } from './careers.mjs';
import type { PlanarPosition } from './movement.mjs';

const SIGNS: Record<CareerId, { text: string; colour: string; ink: string }> = {
  police: { text: 'POLICE', colour: '#1d3f8f', ink: '#ffffff' },
  soldier: { text: 'ARMY RECRUITING', colour: '#4b5320', ink: '#f2e6b8' },
  firefighter: { text: 'FIRE STATION', colour: '#b3261e', ink: '#ffffff' },
};

/** A sign over each workplace door (see `workplaceDoors`, which finds the doors without touching the scene). */
export function buildWorkplaces(scene: Scene, doors: ReadonlyMap<CareerId, PlanarPosition>) {
  const meshes: Mesh[] = [];
  for (const [id, world] of doors) {
    const sign = SIGNS[id];
    const width = 64 + sign.text.length * 34;
    const texture = new DynamicTexture(`workplace sign ${id}`, { width, height: 96 }, scene, true);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = sign.colour; ctx.fillRect(0, 0, width, 96);
    texture.drawText(sign.text, null, 66, 'bold 52px sans-serif', sign.ink, null, true, false);
    texture.update();
    const material = new StandardMaterial(`workplace sign ${id}`, scene);
    material.diffuseTexture = texture; material.emissiveColor = new Color3(0.35, 0.35, 0.35); material.backFaceCulling = false;
    const board = MeshBuilder.CreatePlane(`workplace sign ${id}`, { width: width / 96 * 0.9, height: 0.9 }, scene);
    board.material = material;
    board.billboardMode = Mesh.BILLBOARDMODE_Y;
    board.position.set(world.x, 3.1, world.z);
    board.isPickable = false;
    const post = MeshBuilder.CreateCylinder(`workplace sign post ${id}`, { height: 2.7, diameter: 0.08 }, scene);
    post.position.set(world.x, 1.35, world.z);
    post.isPickable = false;
    meshes.push(board, post);
  }
  return { dispose: () => { for (const mesh of meshes) mesh.dispose(); } };
}

/** A light bar for a police cruiser: alternating red and blue while on. */
export function createLightBar(scene: Scene) {
  const bar = MeshBuilder.CreateBox('cruiser light bar', { width: 1.0, height: 0.1, depth: 0.22 }, scene);
  const red = new StandardMaterial('cruiser red', scene);
  const blue = new StandardMaterial('cruiser blue', scene);
  const left = MeshBuilder.CreateBox('cruiser light red', { width: 0.46, height: 0.12, depth: 0.2 }, scene);
  const right = MeshBuilder.CreateBox('cruiser light blue', { width: 0.46, height: 0.12, depth: 0.2 }, scene);
  left.material = red; right.material = blue;
  left.parent = bar; right.parent = bar;
  left.position.x = -0.25; right.position.x = 0.25;
  const dark = new StandardMaterial('cruiser bar', scene);
  dark.diffuseColor = Color3.FromHexString('#22252a');
  bar.material = dark;
  for (const mesh of [bar, left, right]) mesh.isPickable = false;
  bar.setEnabled(false);
  let time = 0;
  return {
    bar,
    update(seconds: number, on: boolean) {
      bar.setEnabled(on);
      if (!on) return;
      time += seconds;
      const phase = Math.floor(time * 6) % 2;
      red.emissiveColor = phase ? new Color3(1, 0.1, 0.1) : new Color3(0.2, 0, 0);
      blue.emissiveColor = phase ? new Color3(0, 0.05, 0.2) : new Color3(0.15, 0.35, 1);
      red.diffuseColor = new Color3(0.6, 0.05, 0.05); blue.diffuseColor = new Color3(0.05, 0.1, 0.6);
    },
    dispose() { bar.dispose(); red.dispose(); blue.dispose(); dark.dispose(); },
  };
}

/** A two-tone siren (Web Audio), started by a key press. */
export function createSiren() {
  let context: AudioContext | null = null;
  let oscillator: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let time = 0;
  return {
    get on() { return Boolean(oscillator); },
    toggle() {
      if (oscillator) { oscillator.stop(); oscillator.disconnect(); oscillator = null; return false; }
      try {
        context ??= new AudioContext();
        oscillator = context.createOscillator();
        gain = context.createGain();
        oscillator.type = 'sawtooth';
        gain.gain.value = 0.04;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        return true;
      } catch { oscillator = null; return false; }
    },
    update(seconds: number) {
      if (!oscillator || !context) return;
      time += seconds;
      // A wail: up and down between 650 and 1350 Hz every 2.4 s.
      const t = (time % 2.4) / 2.4;
      oscillator.frequency.setTargetAtTime(650 + 700 * (t < 0.5 ? t * 2 : 2 - t * 2), context.currentTime, 0.05);
    },
    stop() { if (oscillator) { oscillator.stop(); oscillator.disconnect(); oscillator = null; } },
    dispose() { this.stop(); void context?.close(); context = null; },
  };
}

const TASK_COLOURS: Record<CareerId, string> = { police: '#4f8dff', soldier: '#c9d36a', firefighter: '#ff7a3d' };

/**
 * The next duty stop: a glowing ring on the pavement and a soft beam that can be seen down the street, gently
 * pulsing. One marker that moves from stop to stop, so a duty adds two meshes and no lights.
 */
export function createTaskMarker(scene: Scene) {
  const ring = MeshBuilder.CreateTorus('duty stop ring', { diameter: 3.2, thickness: 0.16, tessellation: 40 }, scene);
  const beam = MeshBuilder.CreateCylinder('duty stop beam', { height: 14, diameterTop: 0.9, diameterBottom: 1.6, tessellation: 18, cap: Mesh.NO_CAP }, scene);
  const ringMaterial = new StandardMaterial('duty stop ring', scene);
  const beamMaterial = new StandardMaterial('duty stop beam', scene);
  ringMaterial.disableLighting = true; beamMaterial.disableLighting = true;
  beamMaterial.alpha = 0.22; beamMaterial.backFaceCulling = false;
  ring.material = ringMaterial; beam.material = beamMaterial;
  for (const mesh of [ring, beam]) { mesh.isPickable = false; mesh.setEnabled(false); }
  let time = 0;
  let final = false;
  return {
    show(at: PlanarPosition | null, career: CareerId | null, isFinal = false) {
      const on = Boolean(at && career);
      ring.setEnabled(on); beam.setEnabled(on);
      if (!at || !career) return;
      final = isFinal;
      const colour = Color3.FromHexString(isFinal ? '#7ee08a' : TASK_COLOURS[career]);
      ringMaterial.emissiveColor = colour; beamMaterial.emissiveColor = colour;
      ring.position.set(at.x, 0.12, at.z);
      beam.position.set(at.x, 7, at.z);
    },
    update(seconds: number) {
      if (!ring.isEnabled()) return;
      time += seconds;
      const pulse = 1 + Math.sin(time * 3.2) * 0.08;
      ring.scaling.set(pulse, 1, pulse);
      ring.rotation.y = time * (final ? 0.4 : 0.8);
      beamMaterial.alpha = 0.16 + 0.08 * (0.5 + 0.5 * Math.sin(time * 2.1));
    },
    dispose() { ring.dispose(); beam.dispose(); ringMaterial.dispose(); beamMaterial.dispose(); },
  };
}
