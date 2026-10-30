import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, type Scene } from '@babylonjs/core';
import { BALL_RADIUS, PITCH, type Ball } from './football.mjs';

/** Turf with five-a-side markings, drawn once. */
function pitchTexture(scene: Scene) {
  const W = 1024; const H = Math.round(W * PITCH.halfWidth / PITCH.halfLength);
  const t = new DynamicTexture('football turf', { width: W, height: H }, scene, true);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  const stripes = 10;
  for (let i = 0; i < stripes; i++) { c.fillStyle = i % 2 ? '#3f8a3e' : '#4a9846'; c.fillRect(i * W / stripes, 0, W / stripes + 1, H); }
  const m = W / (PITCH.halfLength * 2); // pixels per metre
  c.strokeStyle = '#f4f4ee'; c.lineWidth = Math.max(3, 0.1 * m);
  const inset = 0.5 * m;
  c.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  c.beginPath(); c.moveTo(W / 2, inset); c.lineTo(W / 2, H - inset); c.stroke();
  c.beginPath(); c.arc(W / 2, H / 2, 3 * m, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#f4f4ee'; c.beginPath(); c.arc(W / 2, H / 2, 0.15 * m, 0, Math.PI * 2); c.fill();
  for (const side of [0, 1]) {
    // Five-a-side keeper's area: a 6 m semicircle.
    c.beginPath(); c.arc(side ? W - inset : inset, H / 2, 6 * m, side ? Math.PI / 2 : -Math.PI / 2, side ? Math.PI * 1.5 : Math.PI / 2); c.stroke();
    c.beginPath(); c.arc(side ? W - 6 * m : 6 * m, H / 2, 0.12 * m, 0, Math.PI * 2); c.fill();
  }
  t.update();
  t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}

/** Classic black-and-white panels. */
function ballTexture(scene: Scene) {
  const t = new DynamicTexture('football panels', { width: 256, height: 128 }, scene, true);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = '#f7f7f4'; c.fillRect(0, 0, 256, 128);
  c.fillStyle = '#18181b';
  const pent = (x: number, y: number, r: number) => {
    c.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath(); c.fill();
  };
  for (let i = 0; i < 5; i++) { pent(25 + i * 51, 40, 13); pent(50 + i * 51, 92, 13); }
  pent(128, 6, 12); pent(128, 124, 12);
  t.update();
  return t;
}

/** The caged pitch, goals with nets and the ball. Returns the ball mesh updater and a dispose function. */
export function buildFootballPitch(scene: Scene) {
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  const paint = (name: string, setup: (m: StandardMaterial) => void) => {
    const m = new StandardMaterial(`football ${name}`, scene);
    m.specularColor = new Color3(0.05, 0.05, 0.05);
    setup(m);
    materials.push(m);
    return m;
  };
  const keep = <T extends Mesh>(mesh: T) => { mesh.isPickable = false; meshes.push(mesh); return mesh; };
  const { x, z, halfLength: L, halfWidth: W } = PITCH;

  const turf = keep(MeshBuilder.CreateGround('football turf', { width: L * 2, height: W * 2 }, scene));
  turf.position.set(x, 0.035, z);
  turf.material = paint('turf', m => { m.diffuseTexture = pitchTexture(scene); });

  // Low kick boards with a mesh fence above, open behind each goal.
  const board = paint('boards', m => { m.diffuseColor = Color3.FromHexString('#1f4f8a'); });
  const fence = paint('fence', m => { m.diffuseColor = Color3.FromHexString('#2d3238'); m.alpha = 0.35; m.backFaceCulling = false; });
  const wall = (name: string, length: number, px: number, pz: number, alongX: boolean) => {
    const b = keep(MeshBuilder.CreateBox(`football ${name} board`, { width: alongX ? length : 0.08, depth: alongX ? 0.08 : length, height: 0.6 }, scene));
    b.position.set(px, 0.3, pz); b.material = board;
    const f = keep(MeshBuilder.CreatePlane(`football ${name} fence`, { width: length, height: 2.4 }, scene));
    f.position.set(px, 1.8, pz); f.rotation.y = alongX ? 0 : Math.PI / 2; f.material = fence;
  };
  for (const side of [-1, 1]) wall(side < 0 ? 'south' : 'north', L * 2, x, z + side * W, true);
  const endPiece = W - PITCH.goalHalfWidth;
  for (const end of [-1, 1]) for (const side of [-1, 1]) {
    wall(`end ${end} ${side}`, endPiece, x + end * L, z + side * (PITCH.goalHalfWidth + endPiece / 2), false);
  }

  // Goals: white posts and bar, a translucent net box.
  const white = paint('posts', m => { m.diffuseColor = Color3.FromHexString('#f5f5f0'); m.emissiveColor = new Color3(0.15, 0.15, 0.15); });
  const net = paint('net', m => { m.diffuseColor = Color3.FromHexString('#e8e8e8'); m.alpha = 0.28; m.wireframe = true; m.backFaceCulling = false; });
  for (const end of [-1, 1]) {
    const gx = x + end * L;
    for (const side of [-1, 1]) {
      const post = keep(MeshBuilder.CreateCylinder('football post', { height: PITCH.goalHeight, diameter: 0.1, tessellation: 10 }, scene));
      post.position.set(gx, PITCH.goalHeight / 2, z + side * PITCH.goalHalfWidth); post.material = white;
    }
    const bar = keep(MeshBuilder.CreateCylinder('football crossbar', { height: PITCH.goalHalfWidth * 2, diameter: 0.1, tessellation: 10 }, scene));
    bar.rotation.x = Math.PI / 2; bar.position.set(gx, PITCH.goalHeight, z); bar.material = white;
    const box = keep(MeshBuilder.CreateBox('football net', { width: PITCH.goalDepth, height: PITCH.goalHeight, depth: PITCH.goalHalfWidth * 2, sideOrientation: Mesh.DOUBLESIDE }, scene));
    box.position.set(gx + end * PITCH.goalDepth / 2, PITCH.goalHeight / 2, z); box.material = net;
  }

  // Floodlights at the corners.
  const steel = paint('steel', m => { m.diffuseColor = Color3.FromHexString('#6c737a'); });
  const lamp = paint('lamp', m => { m.diffuseColor = Color3.White(); m.emissiveColor = new Color3(0.9, 0.9, 0.8); });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = keep(MeshBuilder.CreateCylinder('football floodlight pole', { height: 8, diameter: 0.18, tessellation: 8 }, scene));
    pole.position.set(x + sx * (L + 2), 4, z + sz * (W + 1.2)); pole.material = steel;
    const head = keep(MeshBuilder.CreateBox('football floodlight', { width: 1.2, height: 0.5, depth: 0.25 }, scene));
    head.position.set(x + sx * (L + 1.8), 8, z + sz * (W + 1.1)); head.rotation.y = Math.atan2(-sx, -sz); head.material = lamp;
  }

  const ball = keep(MeshBuilder.CreateSphere('football', { diameter: BALL_RADIUS * 2, segments: 16 }, scene));
  ball.material = paint('ball', m => { m.diffuseTexture = ballTexture(scene); m.specularColor = new Color3(0.3, 0.3, 0.3); });
  let lastSpin = 0;
  return {
    ball,
    show(state: Ball) {
      ball.position.set(state.x, state.y, state.z);
      const speed = Math.hypot(state.vx, state.vz);
      if (speed > 0.01) {
        // Roll about the axis across the direction of travel.
        ball.rotation.y = Math.atan2(state.vx, state.vz);
        ball.rotation.x += state.spin - lastSpin;
      }
      lastSpin = state.spin;
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
