import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import { HOUSE_SITES, gableRoofGeometry, houseStreetFeatures } from './suburbLayout.mjs';

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
  // The houses previously read as rectangular blocks with flat roofs. Add
  // true gabled roof silhouettes, street-facing garage doors, and connected
  // driveways without replacing the existing collision geometry.
  const shingles = mat('suburban charcoal shingles', '#55575b');
  const siding = mat('suburban cream gable siding', '#d6c8b6');
  siding.backFaceCulling = false;
  const garage = mat('suburban garage door', '#d8d8d2');
  const garageSeams = mat('suburban garage panel joints', '#979b9b');
  const frontDoor = mat('suburban front doors', '#5e4a41');
  const asphaltDriveway = mat('suburban concrete driveway', '#aaa9a2');
  const porchLight = mat('suburban porch lamps', '#f3d9a1');
  porchLight.emissiveColor = new Color3(0.25, 0.19, 0.08);
  const roof = gableRoofGeometry();

  // Continuous sidewalks on either side of the road; driveways are drawn
  // slightly above them to make the crossing unambiguous.
  for (const sidewalkX of [-2.5, 2.5]) {
    detail('American residential sidewalk', 0.65, 0.04, 24, sidewalkX, 0.02, 0, stone);
    for (const z of [-9, -5, -1, 3, 7]) {
      detail('sidewalk expansion joint', 0.65, 0.006, 0.026, sidewalkX, 0.043, z, garageSeams);
    }
  }

  for (const site of HOUSE_SITES) {
    const { streetWallX, garageFacadeX, drivewayX, drivewayLength } = houseStreetFeatures(site);

    // Each pitched roof uses two lightweight sloped rectangular planes.
    // Its ridge runs along the house depth, like a typical US detached home.
    for (const side of [-1, 1]) {
      const panel = MeshBuilder.CreateBox('suburban pitched shingle roof', {
        width: roof.panelWidth + 0.04, height: 0.13, depth: 5.5,
      }, scene);
      panel.position.set(site.x + side * 1.225, roof.panelCenterY, site.z);
      panel.rotation.z = -side * roof.pitchRadians;
      panel.material = shingles;
    }

    // Close both ends of the roof with actual triangular gable walls.
    const positions: number[] = [];
    const indices: number[] = [];
    for (const z of [site.z + 2.46, site.z - 2.46]) {
      const base = positions.length / 3;
      positions.push(
        site.x - 2.1, 3.55, z,
        site.x + 2.1, 3.55, z,
        site.x, roof.ridgeY - 0.06, z,
      );
      indices.push(base, base + 1, base + 2);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const gable = new Mesh('suburban triangular gable', scene);
    const geometry = new VertexData();
    geometry.positions = positions;
    geometry.indices = indices;
    geometry.normals = normals;
    geometry.applyToMesh(gable);
    gable.material = siding;

    // A paved driveway connects the actual street edge to the garage wall.
    detail('suburban driveway', drivewayLength, 0.045, 2.75,
      drivewayX, 0.038, site.z - 0.12, asphaltDriveway);

    // The garage faces the street (x axis), not the house's rear wall.
    detail('suburban garage door', 0.095, 2.35, 2.55,
      garageFacadeX, 1.22, site.z - 0.12, garage);
    for (const y of [0.5, 0.98, 1.46, 1.94]) {
      detail('garage door horizontal panel seam', 0.105, 0.028, 2.49,
        garageFacadeX + site.roadSide * 0.018, y, site.z - 0.12, garageSeams);
    }

    // Front porch details remain clear from the default third-person camera.
    detail('suburban front door', 0.95, 2.15, 0.085,
      site.x, 1.075, site.z + 2.56, frontDoor);
    const knob = MeshBuilder.CreateSphere('front door handle', { diameter: 0.095, segments: 8 }, scene);
    knob.position.set(site.x + 0.31, 1.02, site.z + 2.625);
    knob.material = garageSeams;
    for (const dx of [-0.63, 0.63]) {
      detail('porch wall light', 0.13, 0.26, 0.12,
        site.x + dx, 2.34, site.z + 2.56, porchLight);
    }
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
