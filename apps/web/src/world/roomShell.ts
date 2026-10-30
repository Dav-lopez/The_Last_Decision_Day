import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial } from '@babylonjs/core';
import { HOME_WALLS, type WallId } from './homeInterior.mjs';

export type RoomSize = { halfWidth: number; halfDepth: number; wallHeight: number; wallThickness: number };
export type RoomShell = {
  add: (mesh: Mesh) => Mesh;
  paint: (name: string, hex: string) => StandardMaterial;
  setFadedWalls: (ids: ReadonlyArray<WallId>, seconds: number) => void;
  dispose: () => void;
};
export type RoomShellOptions = {
  name: string;
  origin: { x: number; z: number };
  room: RoomSize;
  doorHalfWidth: number;
  floor: 'planks' | 'tiles';
  colors: { wall: string; backWall: string; trim: string; door: string; ground: string };
  /** Window centres along each wall (the front wall holds the door). */
  windows: Partial<Record<WallId, number[]>>;
};

function makePaint(scene: Scene) {
  return (name: string, hex: string) => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.specularColor = new Color3(0.05, 0.05, 0.05);
    return material;
  };
}

/** Deterministic plank texture: no downloads, no runtime randomness. */
function plankTexture(scene: Scene, name: string) {
  const texture = new DynamicTexture(`${name} floor planks`, { width: 512, height: 512 }, scene, true);
  const context = texture.getContext();
  const tones = ['#9a6b45', '#a7774e', '#8f6140', '#b07f55'];
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 128;
    for (let col = -1; col < 3; col++) {
      context.fillStyle = tones[(row * 3 + col + 4) % tones.length];
      context.fillRect(col * 256 + offset, row * 64, 256, 64);
      context.fillStyle = '#5d3f28';
      context.fillRect(col * 256 + offset, row * 64, 3, 64);
    }
    context.fillStyle = '#5d3f28';
    context.fillRect(0, row * 64, 512, 2);
    for (let grain = 0; grain < 24; grain++) {
      context.fillStyle = grain % 2 ? '#8a5c3b55' : '#c08a5f44';
      context.fillRect((grain * 97 + row * 41) % 512, row * 64 + 8 + (grain * 13) % 48, 60 + (grain * 7) % 70, 1);
    }
  }
  texture.update();
  texture.uScale = 3;
  texture.vScale = 2.4;
  return texture;
}

/** Speckled school vinyl tiles. */
function tileTexture(scene: Scene, name: string) {
  const texture = new DynamicTexture(`${name} floor tiles`, { width: 256, height: 256 }, scene, true);
  const context = texture.getContext();
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    context.fillStyle = (row + col) % 2 ? '#d9d4c7' : '#c9c3b4';
    context.fillRect(col * 64, row * 64, 64, 64);
  }
  for (let i = 0; i < 700; i++) {
    context.fillStyle = i % 3 ? '#a59f9155' : '#f4f0e655';
    context.fillRect((i * 53 + Math.floor(i / 7) * 29) % 256, (i * 97 + Math.floor(i / 5) * 13) % 256, 2, 2);
  }
  context.fillStyle = '#9d978a';
  for (let k = 0; k <= 4; k++) { context.fillRect(k * 64, 0, 1, 256); context.fillRect(0, k * 64, 256, 1); }
  texture.update();
  texture.uScale = 5;
  texture.vScale = 4;
  return texture;
}

/**
 * Floor, walls with a centred doorway in the front (+Z) wall, windows,
 * baseboards and an open door. Walls fade individually (cutaway view).
 */
export function buildRoomShell(scene: Scene, options: RoomShellOptions): RoomShell {
  const paint = makePaint(scene);
  const { name, origin: { x: ox, z: oz }, doorHalfWidth: doorHalf, colors } = options;
  const { halfWidth: hw, halfDepth: hd, wallHeight: h, wallThickness: t } = options.room;
  const meshes: Mesh[] = [];
  const add = (mesh: Mesh): Mesh => { meshes.push(mesh); mesh.receiveShadows = true; return mesh; };

  const ground = add(MeshBuilder.CreateGround(`${name} grounds`, { width: hw * 2 + 22, height: hd * 2 + 18 }, scene));
  ground.position.set(ox, -0.02, oz);
  ground.material = paint(`${name} grounds grass`, colors.ground);

  const floorMaterial = paint(`${name} floor`, '#ffffff');
  floorMaterial.diffuseTexture = options.floor === 'planks' ? plankTexture(scene, name) : tileTexture(scene, name);
  const floor = add(MeshBuilder.CreateGround(`${name} floor`, { width: hw * 2, height: hd * 2 }, scene));
  floor.position.set(ox, 0.01, oz);
  floor.material = floorMaterial;

  const wallParts = new Map<WallId, { meshes: Mesh[]; materials: StandardMaterial[]; alpha: number }>();
  for (const wall of HOME_WALLS) {
    const plaster = paint(`${name} ${wall.id} wall plaster`, wall.id === 'back' ? colors.backWall : colors.wall);
    const trim = paint(`${name} ${wall.id} wall trim`, colors.trim);
    const glass = paint(`${name} ${wall.id} window`, '#9cc8e6');
    glass.emissiveColor = new Color3(0.32, 0.45, 0.55);
    const parts: Mesh[] = [];
    const along = wall.normal.x === 0;           // back/front run along X
    const length = along ? hw * 2 + t * 2 : hd * 2;
    const cx = ox + wall.normal.x * (hw + t / 2);
    const cz = oz + wall.normal.z * (hd + t / 2);
    const segment = (part: string, width: number, height: number, offset: number, y: number, material: StandardMaterial, depth = t) => {
      const mesh = add(MeshBuilder.CreateBox(`${name} ${wall.id} ${part}`, along
        ? { width, height, depth } : { width: depth, height, depth: width }, scene));
      mesh.position.set(along ? cx + offset : cx, y, along ? cz : cz + offset);
      mesh.material = material;
      parts.push(mesh);
      return mesh;
    };
    if (wall.id === 'front') {
      // Doorway in the middle of the front wall, with a lintel above it.
      const side = (length / 2 - doorHalf);
      for (const sign of [-1, 1]) segment('wall', side, h, sign * (doorHalf + side / 2), h / 2, plaster);
      segment('lintel', doorHalf * 2, h - 2.25, 0, 2.25 + (h - 2.25) / 2, plaster);
      for (const sign of [-1, 1]) segment('door frame', 0.1, 2.25, sign * (doorHalf + 0.05), 1.125, trim, t + 0.06);
      // The door stands open into the room, hinged at the doorway's left edge.
      const door = segment('open door', 0.08, 2.15, -doorHalf + 0.04, 1.08, paint(`${name} door wood`, colors.door), 1.2);
      door.position.z -= 0.6;
    } else {
      segment('wall', length, h, 0, h / 2, plaster);
    }
    for (const offset of options.windows[wall.id] ?? []) {
      // A glass pane slightly proud of the inner face, with a sill.
      segment('window', 1.3, 1.1, offset, 1.65, glass, t + 0.04);
      segment('window sill', 1.45, 0.08, offset, 1.06, trim, t + 0.18);
    }
    segment('baseboard', length - 0.02, 0.12, 0, 0.06, trim, t + 0.05);
    wallParts.set(wall.id, { meshes: parts, materials: [plaster, trim, glass], alpha: 1 });
  }

  return {
    add,
    paint,
    setFadedWalls(ids, seconds) {
      const step = Math.min(1, Math.max(0, seconds) * 8);
      for (const [id, wall] of wallParts) {
        const target = ids.includes(id) ? 0.12 : 1;
        if (wall.alpha === target) continue;
        wall.alpha += (target - wall.alpha) * step;
        if (Math.abs(wall.alpha - target) < 0.01) wall.alpha = target;
        for (const material of wall.materials) {
          material.alpha = wall.alpha;
          material.transparencyMode = wall.alpha < 1 ? 2 : 0; // ALPHABLEND : OPAQUE
        }
        for (const mesh of wall.meshes) mesh.isPickable = wall.alpha > 0.5;
      }
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
    },
  };
}
