import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, type Scene } from '@babylonjs/core';
import { CAREERS, workplaceCentre, type CareerId } from './careers.mjs';
import { toWorld, type City, type CityCollider } from './cityLayout.mjs';
import type { PlanarPosition } from './movement.mjs';

const SIGNS: Record<CareerId, { text: string; colour: string; ink: string }> = {
  police: { text: 'POLICE', colour: '#1d3f8f', ink: '#ffffff' },
  soldier: { text: 'ARMY RECRUITING', colour: '#4b5320', ink: '#f2e6b8' },
  firefighter: { text: 'FIRE STATION', colour: '#b3261e', ink: '#ffffff' },
};

/** The walkable spot outside each workplace (nearest free point to the building), with a sign over it. */
export function buildWorkplaces(scene: Scene, city: City, collider: CityCollider) {
  const doors = new Map<CareerId, PlanarPosition>();
  const meshes: Mesh[] = [];
  for (const id of Object.keys(CAREERS) as CareerId[]) {
    const centre = workplaceCentre(city, id);
    if (!centre) continue;
    const [cx, cz] = centre.local;
    let door: [number, number] | null = null;
    for (let r = 2; r < 60 && !door; r += 0.5) {
      for (let a = 0; a < 32; a++) {
        const x = cx + Math.cos(a / 32 * Math.PI * 2) * r; const z = cz + Math.sin(a / 32 * Math.PI * 2) * r;
        if (!collider.blockedLocal(x, z)) { door = [x, z]; break; }
      }
    }
    if (!door) continue;
    const world = toWorld(door);
    doors.set(id, world);
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
  return { doors, dispose: () => { for (const mesh of meshes) mesh.dispose(); } };
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
