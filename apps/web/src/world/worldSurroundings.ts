import { Color3, Mesh, MeshBuilder, StandardMaterial, type Scene } from '@babylonjs/core';
import {
  DISTANT_HOUSES, DISTANT_TREES, FENCES, GROUND_SIZE, HILLS, PLAYABLE_HALF, ROAD_BARRICADE, ROAD_HALF, ROAD_REACH,
  SIDEWALK_CENTER, SIDEWALK_WIDTH,
} from './surroundingsLayout.mjs';

/**
 * The town around the playable street: ground to the horizon, the road and
 * sidewalks continuing, houses, trees, hills, and fences at the playable edge.
 * Everything is instanced, unpickable, frozen and outside the sun's shadow pass.
 */
export function buildSurroundings(scene: Scene): () => void {
  const meshes: Mesh[] = [];
  const paint = (name: string, hex: string) => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.specularColor = new Color3(0.04, 0.04, 0.04);
    return material;
  };
  const keep = <T extends Mesh>(mesh: T, receive = true): T => {
    mesh.isPickable = false;
    mesh.receiveShadows = receive;
    meshes.push(mesh);
    return mesh;
  };
  const freeze = () => { for (const mesh of meshes) mesh.freezeWorldMatrix(); };

  // Ground to the horizon, just below the playable lawn so the two never flicker.
  const ground = keep(MeshBuilder.CreateGround('town ground', { width: GROUND_SIZE, height: GROUND_SIZE }, scene));
  ground.position.y = -0.03;
  ground.material = paint('town grass', '#6a925f');

  // The road and sidewalks carry on north of the street and behind the school.
  const asphalt = paint('town asphalt', '#5d6164');
  const concrete = paint('town sidewalk', '#c7c0b2');
  const paintLine = paint('town lane paint', '#e9e3c9');
  const length = ROAD_REACH - PLAYABLE_HALF;
  for (const direction of [1, -1]) {
    const centre = direction * (PLAYABLE_HALF + length / 2);
    const road = keep(MeshBuilder.CreateGround('town road', { width: ROAD_HALF * 2, height: length }, scene));
    road.position.set(0, 0.012, centre);
    road.material = asphalt;
    for (const side of [-1, 1]) {
      const walk = keep(MeshBuilder.CreateBox('town sidewalk', { width: SIDEWALK_WIDTH, height: 0.045, depth: length }, scene));
      walk.position.set(side * SIDEWALK_CENTER, 0.022, centre);
      walk.material = concrete;
    }
  }
  const dash = keep(MeshBuilder.CreateGround('town lane dash', { width: 0.12, height: 1.6 }, scene));
  dash.material = paintLine;
  dash.position.set(0, 0.02, PLAYABLE_HALF + 2);
  for (let z = PLAYABLE_HALF + 5.5; z < ROAD_REACH; z += 3.5) {
    for (const direction of [1, -1]) {
      const copy = dash.createInstance('town lane dash');
      copy.position.set(0, 0.02, direction * z);
      copy.isPickable = false;
    }
  }

  // Houses: a body and a pitched roof per house, four siding tones.
  const tones = ['#d8cbb7', '#899eac', '#c9a98f', '#b8c4b0'].map((hex, i) => {
    const body = keep(MeshBuilder.CreateBox(`town house body ${i}`, { size: 1 }, scene));
    body.material = paint(`town siding ${i}`, hex);
    body.isVisible = false;
    return body;
  });
  const roof = keep(MeshBuilder.CreateCylinder('town house roof', { diameter: 1, height: 1, tessellation: 3 }, scene));
  roof.material = paint('town roof shingles', '#4a4f5a');
  roof.isVisible = false;
  const doorBase = keep(MeshBuilder.CreateBox('town house door', { width: 1, height: 1, depth: 1 }, scene));
  doorBase.material = paint('town front door', '#5f4636');
  doorBase.isVisible = false;
  for (const house of DISTANT_HOUSES) {
    const body = tones[house.tone].createInstance('town house');
    body.scaling.set(house.width, house.height, house.depth);
    body.position.set(house.x, house.height / 2, house.z);
    body.rotation.y = house.rotation;
    // A triangular prism lying along the house's width makes a gable roof.
    const top = roof.createInstance('town house roof');
    top.rotation.set(0, house.rotation, Math.PI / 2);
    top.scaling.set(house.depth * 0.62, house.width + 0.4, house.depth * 1.05);
    // The prism's base sits a quarter of its height (0.62 × depth) below its centre: rest it on the walls.
    top.position.set(house.x, house.height + house.depth * 0.62 * 0.25, house.z);
    const door = doorBase.createInstance('town house door');
    door.scaling.set(0.95, 2.05, 0.08);
    door.rotation.y = house.rotation;
    door.position.set(house.x + Math.sin(house.rotation) * (house.depth / 2 + 0.02), 1.02, house.z + Math.cos(house.rotation) * (house.depth / 2 + 0.02));
    for (const copy of [body, top, door]) copy.isPickable = false;
  }

  // Trees: a trunk and a rounded crown, three leaf shades.
  const trunk = keep(MeshBuilder.CreateCylinder('town tree trunk', { height: 2.6, diameterTop: 0.22, diameterBottom: 0.38, tessellation: 7 }, scene));
  trunk.material = paint('town bark', '#5c4532');
  trunk.isVisible = false;
  const crowns = ['#3d6b3f', '#4f7d45', '#365c3a'].map((hex, i) => {
    const crown = keep(MeshBuilder.CreateIcoSphere(`town tree crown ${i}`, { radius: 1.6, subdivisions: 1 }, scene));
    crown.material = paint(`town leaves ${i}`, hex);
    crown.isVisible = false;
    return crown;
  });
  for (const tree of DISTANT_TREES) {
    const stem = trunk.createInstance('town tree trunk');
    stem.scaling.setAll(tree.scale);
    stem.position.set(tree.x, 1.3 * tree.scale, tree.z);
    const crown = crowns[tree.tone].createInstance('town tree crown');
    crown.scaling.set(tree.scale * 1.1, tree.scale * 0.95, tree.scale * 1.05);
    crown.position.set(tree.x, 3.4 * tree.scale, tree.z);
    stem.isPickable = crown.isPickable = false;
  }

  // Low hills on the horizon.
  const hillMaterial = paint('town distant hills', '#5f8a5a');
  for (const hill of HILLS) {
    const mound = keep(MeshBuilder.CreateSphere('town hill', { diameter: 1, segments: 12 }, scene), false);
    mound.scaling.set(hill.radius * 2, hill.height * 2, hill.radius * 2);
    mound.position.set(hill.x, -hill.height * 0.35, hill.z);
    mound.material = hillMaterial;
  }

  // White picket fences along the playable edge, and a striped "road closed" barricade.
  const picketMaterial = paint('town picket fence', '#f1ede2');
  const picket = keep(MeshBuilder.CreateBox('town fence picket', { width: 0.08, height: 0.9, depth: 0.04 }, scene));
  picket.material = picketMaterial;
  picket.isVisible = false;
  const rail = keep(MeshBuilder.CreateBox('town fence rail', { width: 1, height: 0.07, depth: 0.03 }, scene));
  rail.material = picketMaterial;
  rail.isVisible = false;
  for (const fence of FENCES) {
    const dx = fence.to.x - fence.from.x;
    const dz = fence.to.z - fence.from.z;
    const span = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz) - Math.PI / 2;
    for (let along = 0; along <= span; along += 0.22) {
      const post = picket.createInstance('town fence picket');
      post.position.set(fence.from.x + dx * along / span, 0.45, fence.from.z + dz * along / span);
      post.rotation.y = heading;
      post.isPickable = false;
    }
    for (const y of [0.3, 0.68]) {
      const bar = rail.createInstance('town fence rail');
      bar.scaling.x = span;
      bar.rotation.y = heading;
      bar.position.set(fence.from.x + dx / 2, y, fence.from.z + dz / 2);
      bar.isPickable = false;
    }
  }
  const stripeOrange = paint('town barricade orange', '#e2702d');
  const stripeWhite = paint('town barricade white', '#f4f2ec');
  const width = ROAD_BARRICADE.halfWidth * 2;
  for (let i = 0; i < 9; i++) {
    const stripe = keep(MeshBuilder.CreateBox('town barricade stripe', { width: width / 9, height: 0.28, depth: 0.06 }, scene));
    stripe.position.set(-ROAD_BARRICADE.halfWidth + width / 18 + i * width / 9, 0.95, ROAD_BARRICADE.z);
    stripe.material = i % 2 ? stripeWhite : stripeOrange;
  }
  for (const x of [-ROAD_BARRICADE.halfWidth + 0.1, 0, ROAD_BARRICADE.halfWidth - 0.1]) {
    const leg = keep(MeshBuilder.CreateBox('town barricade leg', { width: 0.07, height: 1.05, depth: 0.07 }, scene));
    leg.position.set(x, 0.52, ROAD_BARRICADE.z);
    leg.material = stripeWhite;
  }
  const sign = keep(MeshBuilder.CreateBox('town road closed sign', { width: 1.6, height: 0.42, depth: 0.04 }, scene));
  sign.position.set(0, 1.42, ROAD_BARRICADE.z);
  sign.material = stripeOrange;

  freeze();
  return () => { for (const mesh of meshes) mesh.dispose(); };
}
