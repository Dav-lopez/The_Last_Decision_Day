import { MeshBuilder, Scene } from '@babylonjs/core';
import { DOOR_HALF_WIDTH, HOME_ORIGIN, ROOM, type WallId } from './homeInterior.mjs';
import { buildRoomShell } from './roomShell';

export type HomeScene = { setFadedWalls: (ids: ReadonlyArray<WallId>, seconds: number) => void; dispose: () => void };

/**
 * The player's studio home, built once at HOME_ORIGIN. Furniture comes from
 * polyHavenProps (Poly Haven models or stand-ins); this builds the shell and rugs.
 */
export function buildHomeScene(scene: Scene): HomeScene {
  const shell = buildRoomShell(scene, {
    name: 'home',
    origin: HOME_ORIGIN,
    room: ROOM,
    doorHalfWidth: DOOR_HALF_WIDTH,
    floor: 'planks',
    colors: { wall: '#e7dcc8', backWall: '#d9c7a8', trim: '#f4f0e6', door: '#6d4a33', ground: '#5e8f5b' },
    windows: { back: [-2.4, 2.4], right: [-3.2, 0, 3.2], left: [-3.6] },
  });
  const { x: ox, z: oz } = HOME_ORIGIN;
  const rug = shell.add(MeshBuilder.CreateGround('home rug', { width: 2.6, height: 1.9 }, scene));
  rug.position.set(ox - 2.75, 0.02, oz - 1.6);
  rug.material = shell.paint('home rug wool', '#7c4a4a');
  const rugBorder = shell.add(MeshBuilder.CreateGround('home rug border', { width: 2.85, height: 2.15 }, scene));
  rugBorder.position.set(ox - 2.75, 0.015, oz - 1.6);
  rugBorder.material = shell.paint('home rug border wool', '#d8c49a');
  const bedroomRug = shell.add(MeshBuilder.CreateGround('home bedroom rug', { width: 2.2, height: 1.4 }, scene));
  bedroomRug.position.set(ox + 3.3, 0.02, oz - 2.35);
  bedroomRug.material = shell.paint('home bedroom rug wool', '#4f6d7a');
  return { setFadedWalls: shell.setFadedWalls, dispose: shell.dispose };
}
