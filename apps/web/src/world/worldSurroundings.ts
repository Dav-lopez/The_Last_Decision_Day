import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, type Scene } from '@babylonjs/core';
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
  // Small deterministic canvas textures: no downloads, same look on every load.
  const canvasTexture = (name: string, size: number, draw: (context: CanvasRenderingContext2D, size: number) => void) => {
    const texture = new DynamicTexture(name, { width: size, height: size }, scene, true);
    draw(texture.getContext() as unknown as CanvasRenderingContext2D, size);
    texture.update();
    return texture;
  };
  const speckle = (context: CanvasRenderingContext2D, size: number, colours: string[], count: number, seed: number) => {
    let state = seed;
    const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      context.fillStyle = colours[i % colours.length];
      context.fillRect(next() * size, next() * size, 1 + next() * 3, 1 + next() * 4);
    }
  };

  // Ground to the horizon, just below the playable lawn so the two never flicker.
  const ground = keep(MeshBuilder.CreateGround('town ground', { width: GROUND_SIZE, height: GROUND_SIZE }, scene));
  ground.position.y = -0.03;
  const grassMaterial = paint('town grass', '#ffffff');
  grassMaterial.diffuseTexture = canvasTexture('town grass blades', 256, (context, size) => {
    context.fillStyle = '#62894f';
    context.fillRect(0, 0, size, size);
    speckle(context, size, ['#557d45', '#71985a', '#4d7340', '#7ea463'], 2600, 11);
  });
  const grassTexture = grassMaterial.diffuseTexture as DynamicTexture;
  grassTexture.uScale = GROUND_SIZE / 6;
  grassTexture.vScale = GROUND_SIZE / 6;
  ground.material = grassMaterial;

  // The road and sidewalks carry on north of the street and behind the school.
  const asphalt = paint('town asphalt', '#ffffff');
  asphalt.diffuseTexture = canvasTexture('town asphalt grain', 256, (context, size) => {
    context.fillStyle = '#5a5e61';
    context.fillRect(0, 0, size, size);
    speckle(context, size, ['#4c5053', '#6c7174', '#62676a'], 3000, 23);
  });
  (asphalt.diffuseTexture as DynamicTexture).vScale = (ROAD_REACH - PLAYABLE_HALF) / 4;
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
  // Each face of a house box shows lap siding, two windows with white trim and shutters.
  const facade = (siding: string, shadow: string) => (context: CanvasRenderingContext2D, size: number) => {
    context.fillStyle = siding;
    context.fillRect(0, 0, size, size);
    context.fillStyle = shadow;
    for (let y = 0; y < size; y += 12) context.fillRect(0, y, size, 2);
    for (const x of [0.16, 0.6]) {
      const wx = x * size;
      const wy = size * 0.3;
      const ww = size * 0.24;
      const wh = size * 0.3;
      context.fillStyle = '#f2efe6';
      context.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
      context.fillStyle = '#5d7f96';
      context.fillRect(wx, wy, ww, wh);
      context.fillStyle = '#8fb3c9';
      context.fillRect(wx + 4, wy + 4, ww * 0.42, wh * 0.4);
      context.fillStyle = '#f2efe6';
      context.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      context.fillRect(wx, wy + wh / 2 - 2, ww, 4);
      context.fillStyle = '#3b4a57';
      context.fillRect(wx - 22, wy - 4, 12, wh + 8);
      context.fillRect(wx + ww + 10, wy - 4, 12, wh + 8);
    }
    context.fillStyle = '#e9e5da';
    context.fillRect(0, size - 18, size, 18);
  };
  const tones = [['#d8cbb7', '#bfb19b'], ['#899eac', '#738797'], ['#c9a98f', '#ae8f76'], ['#b8c4b0', '#9eab96']].map(([hex, shade], i) => {
    const body = keep(MeshBuilder.CreateBox(`town house body ${i}`, { size: 1 }, scene));
    const siding = paint(`town siding ${i}`, '#ffffff');
    siding.diffuseTexture = canvasTexture(`town facade ${i}`, 256, facade(hex, shade));
    body.material = siding;
    body.isVisible = false;
    return body;
  });
  const roof = keep(MeshBuilder.CreateCylinder('town house roof', { diameter: 1, height: 1, tessellation: 3 }, scene));
  const shingles = paint('town roof shingles', '#ffffff');
  shingles.diffuseTexture = canvasTexture('town shingle rows', 256, (context, size) => {
    context.fillStyle = '#4b505b';
    context.fillRect(0, 0, size, size);
    for (let row = 0; row < size; row += 16) {
      context.fillStyle = '#3a3e47';
      context.fillRect(0, row, size, 2);
      for (let x = (row / 16) % 2 ? 0 : 12; x < size; x += 24) context.fillRect(x, row, 2, 16);
    }
    speckle(context, size, ['#5a606b', '#40454f'], 900, 5);
  });
  (shingles.diffuseTexture as DynamicTexture).uScale = 3;
  (shingles.diffuseTexture as DynamicTexture).vScale = 3;
  roof.material = shingles;
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
