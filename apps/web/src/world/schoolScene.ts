import { Color3, DynamicTexture, MeshBuilder, Scene, StandardMaterial } from '@babylonjs/core';
import type { WallId } from './homeInterior.mjs';
import { buildRoomShell } from './roomShell';
import { CHALKBOARD, CLASSROOM, CLASSROOM_DOOR_HALF_WIDTH, SCHOOL_ORIGIN } from './schoolInterior.mjs';

export type SchoolScene = {
  setFadedWalls: (ids: ReadonlyArray<WallId>, seconds: number) => void;
  /** Redraws the chalkboard only when the text changes. */
  setBoard: (title: string, detail: string) => void;
  dispose: () => void;
};

/** The classroom: tiled floor, windows on two sides, a chalkboard with today's lesson, posters and a clock. */
export function buildSchoolScene(scene: Scene): SchoolScene {
  const shell = buildRoomShell(scene, {
    name: 'classroom',
    origin: SCHOOL_ORIGIN,
    room: CLASSROOM,
    doorHalfWidth: CLASSROOM_DOOR_HALF_WIDTH,
    floor: 'tiles',
    colors: { wall: '#e9e2cf', backWall: '#d6e2dc', trim: '#7a6a55', door: '#5a6f7d', ground: '#6b9461' },
    windows: { right: [-2.2, 0, 2.2], left: [-1.4, 1.4] },
  });
  const { x: ox, z: oz } = SCHOOL_ORIGIN;
  const backFace = oz - CLASSROOM.halfDepth + 0.02;

  // Chalkboard: wooden frame, green slate drawn with the current lesson.
  const frame = shell.add(MeshBuilder.CreateBox('classroom chalkboard frame', { width: CHALKBOARD.width + 0.16, height: CHALKBOARD.height + 0.16, depth: 0.04 }, scene));
  frame.position.set(ox + CHALKBOARD.x, CHALKBOARD.y, backFace + 0.02);
  frame.material = shell.paint('classroom chalkboard wood', '#6e5034');
  const boardTexture = new DynamicTexture('classroom chalkboard text', { width: 1024, height: 370 }, scene, true);
  const boardMaterial = new StandardMaterial('classroom chalkboard slate', scene);
  boardMaterial.diffuseTexture = boardTexture;
  boardMaterial.emissiveColor = new Color3(0.18, 0.2, 0.18);
  boardMaterial.specularColor = new Color3(0.02, 0.02, 0.02);
  const board = shell.add(MeshBuilder.CreatePlane('classroom chalkboard', { width: CHALKBOARD.width, height: CHALKBOARD.height }, scene));
  // Planes face -Z by default; the board faces into the room (+Z).
  board.rotation.y = Math.PI;
  board.position.set(ox + CHALKBOARD.x, CHALKBOARD.y, backFace + 0.045);
  board.material = boardMaterial;
  const tray = shell.add(MeshBuilder.CreateBox('classroom chalk tray', { width: CHALKBOARD.width, height: 0.04, depth: 0.1 }, scene));
  tray.position.set(ox + CHALKBOARD.x, CHALKBOARD.y - CHALKBOARD.height / 2 - 0.06, backFace + 0.06);
  tray.material = frame.material;

  // Wall clock and two posters for life.
  const clockFace = shell.add(MeshBuilder.CreateCylinder('classroom wall clock', { diameter: 0.42, height: 0.04, tessellation: 24 }, scene));
  clockFace.rotation.x = Math.PI / 2;
  clockFace.position.set(ox - 3.6, 2.45, backFace + 0.02);
  clockFace.material = shell.paint('classroom clock face', '#f6f2e6');
  const posters: Array<[number, string]> = [[-3.6, '#c8553d'], [-2.2, '#3d7cc8']];
  for (const [x, color] of posters) {
    const poster = shell.add(MeshBuilder.CreatePlane('classroom poster', { width: 0.7, height: 0.95 }, scene));
    poster.rotation.y = Math.PI;
    poster.position.set(ox + x, 1.55, backFace + 0.02);
    poster.material = shell.paint(`classroom poster ${color}`, color);
  }

  let lastBoard = '';
  const setBoard = (title: string, detail: string) => {
    const key = `${title}\n${detail}`;
    if (key === lastBoard) return;
    lastBoard = key;
    const context = boardTexture.getContext();
    context.fillStyle = '#2f4a3a';
    context.fillRect(0, 0, 1024, 370);
    // Faint chalk dust so the slate doesn't look like a flat colour.
    context.fillStyle = '#ffffff0d';
    for (let i = 0; i < 90; i++) context.fillRect((i * 173) % 1024, (i * 97) % 370, 60 + (i * 7) % 90, 2);
    context.fillStyle = '#f2f0e6';
    context.textAlign = 'center';
    context.font = 'bold 92px "Comic Sans MS", "Segoe Print", cursive';
    context.fillText(title, 512, 150);
    context.font = '46px "Comic Sans MS", "Segoe Print", cursive';
    context.fillText(detail, 512, 260);
    boardTexture.update();
  };
  setBoard('Welcome!', 'Lessons start at 8:00 AM');

  return { setFadedWalls: shell.setFadedWalls, setBoard, dispose: shell.dispose };
}
