import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial } from '@babylonjs/core';
import { DOOR_HALF_WIDTH, HOME_ORIGIN, HOME_WALLS, ROOM, type WallId } from './homeInterior.mjs';

export type HomeScene = { setFadedWalls: (ids: ReadonlyArray<WallId>, seconds: number) => void; dispose: () => void };

function paint(scene: Scene, name: string, hex: string) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = new Color3(0.05, 0.05, 0.05);
  return material;
}

/** Deterministic plank texture: no downloads, no runtime randomness. */
function plankTexture(scene: Scene) {
  const texture = new DynamicTexture('home floor planks', { width: 512, height: 512 }, scene, true);
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

/**
 * The player's studio home, built once at HOME_ORIGIN. Furniture comes from
 * polyHavenProps (Poly Haven models or stand-ins); this builds the shell.
 */
export function buildHomeScene(scene: Scene): HomeScene {
  const { x: ox, z: oz } = HOME_ORIGIN;
  const { halfWidth: hw, halfDepth: hd, wallHeight: h, wallThickness: t } = ROOM;
  const meshes: Mesh[] = [];
  const add = (mesh: Mesh): Mesh => { meshes.push(mesh); mesh.receiveShadows = true; return mesh; };

  const yard = add(MeshBuilder.CreateGround('home yard', { width: 30, height: 26 }, scene));
  yard.position.set(ox, -0.02, oz);
  yard.material = paint(scene, 'home yard grass', '#5e8f5b');

  const floorMaterial = paint(scene, 'home floor', '#ffffff');
  floorMaterial.diffuseTexture = plankTexture(scene);
  const floor = add(MeshBuilder.CreateGround('home floor', { width: hw * 2, height: hd * 2 }, scene));
  floor.position.set(ox, 0.01, oz);
  floor.material = floorMaterial;

  const rug = add(MeshBuilder.CreateGround('home rug', { width: 2.6, height: 1.9 }, scene));
  rug.position.set(ox - 2.75, 0.02, oz + 0.2);
  rug.material = paint(scene, 'home rug wool', '#7c4a4a');
  const rugBorder = add(MeshBuilder.CreateGround('home rug border', { width: 2.85, height: 2.15 }, scene));
  rugBorder.position.set(ox - 2.75, 0.015, oz + 0.2);
  rugBorder.material = paint(scene, 'home rug border wool', '#d8c49a');

  const bedroomRug = add(MeshBuilder.CreateGround('home bedroom rug', { width: 2.2, height: 1.4 }, scene));
  bedroomRug.position.set(ox + 3.3, 0.02, oz - 0.55);
  bedroomRug.material = paint(scene, 'home bedroom rug wool', '#4f6d7a');

  // Each wall owns its materials so it can fade on its own.
  const wallParts = new Map<WallId, { meshes: Mesh[]; materials: StandardMaterial[]; alpha: number }>();
  for (const wall of HOME_WALLS) {
    const plaster = paint(scene, `home ${wall.id} wall plaster`, wall.id === 'back' ? '#d9c7a8' : '#e7dcc8');
    const trim = paint(scene, `home ${wall.id} wall trim`, '#f4f0e6');
    const glass = paint(scene, `home ${wall.id} window`, '#9cc8e6');
    glass.emissiveColor = new Color3(0.32, 0.45, 0.55);
    const parts: Mesh[] = [];
    const along = wall.normal.x === 0;           // back/front run along X
    const length = along ? hw * 2 + t * 2 : hd * 2;
    const cx = ox + wall.normal.x * (hw + t / 2);
    const cz = oz + wall.normal.z * (hd + t / 2);
    const segment = (name: string, width: number, height: number, offset: number, y: number, material: StandardMaterial, depth = t) => {
      const mesh = add(MeshBuilder.CreateBox(`home ${wall.id} ${name}`, along
        ? { width, height, depth } : { width: depth, height, depth: width }, scene));
      mesh.position.set(along ? cx + offset : cx, y, along ? cz : cz + offset);
      mesh.material = material;
      parts.push(mesh);
      return mesh;
    };
    if (wall.id === 'front') {
      // Doorway in the middle of the front wall, with a lintel above it.
      const side = (length / 2 - DOOR_HALF_WIDTH);
      for (const sign of [-1, 1]) segment('wall', side, h, sign * (DOOR_HALF_WIDTH + side / 2), h / 2, plaster);
      segment('lintel', DOOR_HALF_WIDTH * 2, h - 2.25, 0, 2.25 + (h - 2.25) / 2, plaster);
      for (const sign of [-1, 1]) segment('door frame', 0.1, 2.25, sign * (DOOR_HALF_WIDTH + 0.05), 1.125, trim, t + 0.06);
      // The door stands open into the room, hinged at the doorway's left edge (see DOOR_LEAF).
      const door = segment('open door', 0.08, 2.15, -DOOR_HALF_WIDTH + 0.04, 1.08, paint(scene, 'home front door wood', '#6d4a33'), 1.2);
      door.position.z -= 0.6;
    } else {
      segment('wall', length, h, 0, h / 2, plaster);
      if (wall.id !== 'left') {
        // Windows: a glass pane slightly proud of the inner face, with a sill.
        const offsets = wall.id === 'back' ? [-2.4, 2.4] : [-1.2, 1.2];
        for (const offset of offsets) {
          segment('window', 1.3, 1.1, offset, 1.65, glass, t + 0.04);
          segment('window sill', 1.45, 0.08, offset, 1.06, trim, t + 0.18);
        }
      }
    }
    segment('baseboard', length - 0.02, 0.12, 0, 0.06, trim, t + 0.05);
    wallParts.set(wall.id, { meshes: parts, materials: [plaster, trim, glass], alpha: 1 });
  }

  return {
    setFadedWalls(ids, seconds) {
      const step = Math.min(1, Math.max(0, seconds) * 8);
      for (const [id, wall] of wallParts) {
        const target = ids.includes(id) ? 0.12 : 1;
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
