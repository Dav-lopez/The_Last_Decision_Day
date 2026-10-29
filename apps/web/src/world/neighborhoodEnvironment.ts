import { Color3, MeshBuilder, Scene, StandardMaterial } from '@babylonjs/core';

/** Original lightweight neighborhood architecture; no external assets or network requests. */
export function addPlayableNeighborhoodDetails(scene: Scene): void {
  const mat = (name: string, hex: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.08, 0.08, 0.08);
    return m;
  };
  const white = mat('environment window trim', '#e8e4d8');
  const glass = mat('environment window glass', '#477c93');
  glass.specularColor = new Color3(0.55, 0.55, 0.55);
  const hedge = mat('environment hedges', '#326c47');
  const stone = mat('environment paving', '#a8a59c');
  const yellow = mat('environment road marking', '#e7d79c');
  const brick = mat('environment school brick', '#ba8c70');
  const metal = mat('environment lamp metal', '#47505c');
  const lamp = mat('environment lamp light', '#fff0c0');
  lamp.emissiveColor = new Color3(0.7, 0.6, 0.35);
  const detail = (name: string, width: number, height: number, depth: number, x: number, y: number, z: number, material: StandardMaterial) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.material = material;
    return mesh;
  };
  // Visible school facade windows and structural details.
  for (const x of [-2.8, -1.65, 1.65, 2.8]) {
    detail('school window frame', 0.95, 1.3, 0.1, x, 2.35, -6.71, white);
    detail('school window glass', 0.78, 1.13, 0.13, x, 2.35, -6.64, glass);
    detail('school window mullion', 0.05, 1.13, 0.14, x, 2.35, -6.56, white);
  }
  detail('school entrance canopy', 2.55, 0.18, 1.1, 0, 2.9, -6.25, brick);
  for (const x of [-1.2, 1.2]) detail('school entrance column', 0.14, 2.7, 0.14, x, 1.35, -6.14, white);
  // Residential street frontage, trim, windows, and front gardens.
  for (const x of [-8.4, 8.4]) {
    for (const dx of [-1.15, 1.15]) {
      detail('house window frame', 1.05, 1.2, 0.11, x + dx, 2.0, -2.55, white);
      detail('house window glass', 0.87, 1.03, 0.14, x + dx, 2.0, -2.47, glass);
      detail('house window mullion', 0.06, 1.03, 0.16, x + dx, 2.0, -2.38, white);
    }
    detail('house front steps', 1.7, 0.18, 0.75, x, 0.09, -2.16, stone);
    for (const dx of [-1.8, 1.8]) detail('garden hedge', 0.45, 0.6, 1.8, x + dx, 0.3, -1.65, hedge);
  }
  // Crosswalks make the road read as a street rather than a flat grey strip.
  for (const z of [-1.2, 5.5]) {
    for (let i = 0; i < 5; i++) {
      detail('pedestrian crossing', 0.55, 0.014, 0.36, -1.45 + i * 0.72, 0.043, z, white);
    }
  }
  detail('road center line north', 0.08, 0.014, 3, 0, 0.042, 9.6, yellow);
  // Street lighting stays away from the center travel path.
  for (const [x, z] of [[-2.6, 2.8], [2.6, 7.8], [-2.6, -3.5]] as const) {
    const pole = MeshBuilder.CreateCylinder('streetlight pole', { height: 4, diameter: 0.12, tessellation: 8 }, scene);
    pole.position.set(x, 2, z);
    pole.material = metal;
    detail('streetlight head', 0.55, 0.15, 0.32, x, 4.05, z, lamp);
  }
}
