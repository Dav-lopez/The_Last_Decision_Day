import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, VertexData, type Scene } from '@babylonjs/core';
import { CITY_ORIGIN, laneDashes, pointInRing, triangulate, type City, type CityBuilding } from './cityLayout.mjs';

const FLOOR = 3.4;
const BAY = 3.2;

type Style = { wall: string; mortar: string; window: string; frame: string; storefront: boolean };
const STYLES: Record<string, Style> = {
  brick: { wall: '#9a4a36', mortar: '#7d3b2b', window: '#405a6e', frame: '#e8e1d2', storefront: true },
  tan: { wall: '#c9ad86', mortar: '#ad9370', window: '#3f5a6b', frame: '#f2ece0', storefront: true },
  house: { wall: '#c7cfd4', mortar: '#aab3b9', window: '#4a6577', frame: '#ffffff', storefront: false },
  stone: { wall: '#d7d0bf', mortar: '#bdb5a3', window: '#33495a', frame: '#efe9dc', storefront: false },
  modern: { wall: '#7d8a93', mortar: '#6c7880', window: '#2c4252', frame: '#c9d2d8', storefront: true },
};
function styleFor(building: CityBuilding): keyof typeof STYLES {
  if (['civic', 'government', 'public', 'church', 'school', 'university'].includes(building.kind) || /Courthouse|Library|Municipal|Post Office/.test(building.name)) return 'stone';
  if (['house', 'detached', 'residential', 'terrace', 'garage', 'garages', 'shed'].includes(building.kind)) return 'house';
  if (building.height > 18 || building.kind === 'office' || building.kind === 'hotel') return 'modern';
  return building.id % 3 === 0 ? 'tan' : 'brick';
}

/** One storey, one window bay: tiled across every wall by its UVs. */
function facadeTexture(scene: Scene, name: string, style: Style) {
  const texture = new DynamicTexture(`city facade ${name}`, { width: 256, height: 256 }, scene, true);
  const c = texture.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = style.wall;
  c.fillRect(0, 0, 256, 256);
  c.fillStyle = style.mortar;
  for (let y = 0; y < 256; y += 10) for (let x = (y / 10) % 2 ? 0 : 14; x < 256; x += 28) c.fillRect(x, y, 2, 10);
  for (let y = 0; y < 256; y += 10) c.fillRect(0, y, 256, 1);
  c.fillStyle = style.frame;
  c.fillRect(56, 44, 144, 150);
  c.fillStyle = style.window;
  c.fillRect(66, 54, 124, 130);
  c.fillStyle = '#9fbdd055';
  c.fillRect(70, 58, 50, 60);
  c.fillStyle = style.frame;
  c.fillRect(124, 54, 8, 130);
  c.fillRect(66, 116, 124, 6);
  c.fillRect(46, 196, 164, 10);
  texture.update();
  // Dynamic textures clamp by default; facades tile one window bay per 3.2 m × 3.4 m.
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  return texture;
}

function speckleTexture(scene: Scene, name: string, base: string, flecks: string[], scale: number) {
  const texture = new DynamicTexture(`city ${name}`, { width: 256, height: 256 }, scene, true);
  const c = texture.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = base;
  c.fillRect(0, 0, 256, 256);
  let state = 97;
  const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) { c.fillStyle = flecks[i % flecks.length]; c.fillRect(next() * 256, next() * 256, 1 + next() * 2, 1 + next() * 2); }
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  texture.uScale = scale;
  texture.vScale = scale;
  return texture;
}

type Buffers = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
const buffers = (): Buffers => ({ positions: [], normals: [], uvs: [], indices: [] });
function toMesh(scene: Scene, name: string, data: Buffers, material: StandardMaterial) {
  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  Object.assign(vertexData, data);
  vertexData.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

/** Wall quads with outward normals; the ring is counter-clockwise (x east, z north). */
function addWalls(target: Buffers, ring: number[][], height: number, base = 0, offset = 0) {
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.05) continue;
    const nx = (bz - az) / length;
    const nz = -(bx - ax) / length;
    const x0 = CITY_ORIGIN.x + ax + nx * offset; const z0 = CITY_ORIGIN.z + az + nz * offset;
    const x1 = CITY_ORIGIN.x + bx + nx * offset; const z1 = CITY_ORIGIN.z + bz + nz * offset;
    const start = target.positions.length / 3;
    target.positions.push(x0, base, z0, x1, base, z1, x1, base + height, z1, x0, base + height, z0);
    for (let k = 0; k < 4; k++) target.normals.push(nx, 0, nz);
    const u = length / BAY; const v = height / FLOOR;
    target.uvs.push(0, 0, u, 0, u, v, 0, v);
    target.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

function addCap(target: Buffers, ring: number[][], y: number, uvScale = 4) {
  const start = target.positions.length / 3;
  for (const [x, z] of ring) {
    target.positions.push(CITY_ORIGIN.x + x, y, CITY_ORIGIN.z + z);
    target.normals.push(0, 1, 0);
    target.uvs.push(x / uvScale, z / uvScale);
  }
  for (const [a, b, c] of triangulate(ring)) target.indices.push(start + a, start + b, start + c);
}

function addStrip(target: Buffers, points: number[][], width: number, y: number) {
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.05) continue;
    // Extend each segment by half a width so joints overlap instead of leaving notches.
    const ux = (bx - ax) / length; const uz = (bz - az) / length;
    const px = -uz * width / 2; const pz = ux * width / 2;
    const sx = ax - ux * width / 2; const sz = az - uz * width / 2;
    const ex = bx + ux * width / 2; const ez = bz + uz * width / 2;
    const start = target.positions.length / 3;
    for (const [x, z] of [[sx + px, sz + pz], [ex + px, ez + pz], [ex - px, ez - pz], [sx - px, sz - pz]]) {
      target.positions.push(CITY_ORIGIN.x + x, y, CITY_ORIGIN.z + z);
      target.normals.push(0, 1, 0);
      target.uvs.push(x / 4, z / 4);
    }
    target.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

/** Concrete slabs with expansion joints every 1.5 m. */
function sidewalkTexture(scene: Scene) {
  const texture = speckleTexture(scene, 'sidewalk', '#c8c4ba', ['#bdb9af', '#d3cfc6', '#b3afa6'], 1);
  const c = texture.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = '#9f9b93';
  for (let i = 0; i <= 256; i += 96) { c.fillRect(i, 0, 2, 256); c.fillRect(0, i, 256, 2); }
  texture.update();
  texture.uScale = texture.vScale = 4 / 6; // UVs are metres / 4; a 256 px tile spans 6 m
  return texture;
}

/** A polyline shifted sideways by `offset` metres (for double centre lines). */
function offsetLine(points: number[][], offset: number) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)]; const b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] - (b[1] - a[1]) / length * offset, p[1] + (b[0] - a[0]) / length * offset];
  });
}

/**
 * Builds the whole downtown: buildings extruded to their real heights with
 * per-type facades and storefront glass, flat roofs, streets, paths, parks with
 * trees and labels on named landmarks. Returns a dispose function.
 */
export function buildCityScene(scene: Scene, city: City): () => void {
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  const material = (name: string, setup: (m: StandardMaterial) => void) => {
    const m = new StandardMaterial(`city ${name}`, scene);
    m.specularColor = new Color3(0.06, 0.06, 0.06);
    setup(m);
    materials.push(m);
    return m;
  };
  const [hx, hz] = city.halfSize;

  const ground = MeshBuilder.CreateGround('city ground', { width: hx * 2 + 80, height: hz * 2 + 80 }, scene);
  ground.position.set(CITY_ORIGIN.x, -0.01, CITY_ORIGIN.z);
  ground.material = material('paving', m => { m.diffuseTexture = speckleTexture(scene, 'paving', '#a9a59c', ['#9c988f', '#b6b2a9', '#8f8b83'], (hx * 2 + 80) / 5); });
  ground.isPickable = false;
  meshes.push(ground);

  const walls: Record<string, Buffers> = {};
  const storefronts = buffers();
  const roofs = buffers();
  for (const building of city.buildings) {
    const style = styleFor(building);
    walls[style] ??= buffers();
    addWalls(walls[style], building.ring, building.height);
    addCap(roofs, building.ring, building.height);
    if (STYLES[style].storefront && (building.shop || ['commercial', 'retail'].includes(building.kind))) {
      addWalls(storefronts, building.ring, 2.7, 0.35, 0.04);
    }
  }
  for (const [style, data] of Object.entries(walls)) {
    const wall = material(`${style} facade`, m => { m.diffuseTexture = facadeTexture(scene, style, STYLES[style]); m.backFaceCulling = false; });
    const mesh = toMesh(scene, `city ${style} walls`, data, wall);
    mesh.checkCollisions = true;
    meshes.push(mesh);
  }
  meshes.push(toMesh(scene, 'city storefronts', storefronts, material('storefront glass', m => {
    m.diffuseColor = Color3.FromHexString('#24333d');
    m.emissiveColor = new Color3(0.08, 0.1, 0.11);
    m.specularColor = new Color3(0.7, 0.7, 0.7);
    m.backFaceCulling = false;
  })));
  meshes.push(toMesh(scene, 'city roofs', roofs, material('roofs', m => {
    m.diffuseTexture = speckleTexture(scene, 'roof gravel', '#6d6a66', ['#5b5854', '#7f7c77'], 1);
    m.backFaceCulling = false;
  })));

  const streets = buffers();
  const paths = buffers();
  const mall = buffers();
  const centreLines = buffers();
  const laneLines = buffers();
  for (const road of city.roads) {
    if (road.kind === 'pedestrian') { addStrip(mall, road.points, road.width, 0.025); continue; }
    const footpath = ['footway', 'path', 'cycleway', 'steps'].includes(road.kind);
    addStrip(footpath ? paths : streets, road.points, road.width, footpath ? 0.02 : 0.03);
    // Painted lines: double yellow on the main streets, a dashed white centre on the others.
    if (['primary', 'secondary', 'tertiary'].includes(road.kind)) {
      for (const side of [-0.09, 0.09]) addStrip(centreLines, offsetLine(road.points, side), 0.1, 0.045);
    } else if (['residential', 'unclassified'].includes(road.kind)) {
      for (const dash of laneDashes(road.points, 3, 6)) addStrip(laneLines, dash, 0.12, 0.045);
    }
  }
  meshes.push(toMesh(scene, 'city streets', streets, material('asphalt', m => {
    m.diffuseTexture = speckleTexture(scene, 'asphalt', '#55595c', ['#4a4e51', '#676c6f'], 1);
    m.backFaceCulling = false;
  })));
  meshes.push(toMesh(scene, 'city paths', paths, material('sidewalks', m => {
    m.diffuseTexture = sidewalkTexture(scene);
    m.backFaceCulling = false;
  })));
  // Pearl Street Mall and other pedestrian streets: red brick pavers.
  meshes.push(toMesh(scene, 'city pedestrian mall', mall, material('brick pavers', m => {
    m.diffuseTexture = speckleTexture(scene, 'brick paving', '#a8644c', ['#93553f', '#b97660', '#8a4f3b'], 1);
    m.backFaceCulling = false;
  })));
  meshes.push(toMesh(scene, 'city centre lines', centreLines, material('yellow paint', m => {
    m.diffuseColor = Color3.FromHexString('#e0b43a'); m.backFaceCulling = false;
  })));
  meshes.push(toMesh(scene, 'city lane lines', laneLines, material('white paint', m => {
    m.diffuseColor = Color3.FromHexString('#e9e7e0'); m.backFaceCulling = false;
  })));

  const parks = buffers();
  for (const park of city.parks) addCap(parks, park.ring, 0.015);
  meshes.push(toMesh(scene, 'city parks', parks, material('park lawn', m => {
    m.diffuseTexture = speckleTexture(scene, 'lawn', '#5f8a4f', ['#557d45', '#71985a'], 1);
    m.backFaceCulling = false;
  })));

  // Trees scattered inside the parks (deterministic).
  const trunk = MeshBuilder.CreateCylinder('city tree trunk', { height: 2.8, diameterTop: 0.22, diameterBottom: 0.38, tessellation: 7 }, scene);
  trunk.material = material('bark', m => { m.diffuseColor = Color3.FromHexString('#5c4532'); });
  trunk.isVisible = false;
  const crown = MeshBuilder.CreateIcoSphere('city tree crown', { radius: 1.9, subdivisions: 2 }, scene);
  crown.material = material('leaves', m => { m.diffuseColor = Color3.FromHexString('#4a7a42'); });
  crown.isVisible = false;
  meshes.push(trunk, crown);
  let state = 5;
  const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const park of city.parks) {
    const xs = park.ring.map(p => p[0]); const zs = park.ring.map(p => p[1]);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
    const wanted = Math.min(18, Math.max(1, Math.round((maxX - minX) * (maxZ - minZ) / 220)));
    for (let tries = 0, placed = 0; placed < wanted && tries < wanted * 12; tries++) {
      const x = minX + next() * (maxX - minX); const z = minZ + next() * (maxZ - minZ);
      if (!pointInRing(x, z, park.ring)) continue;
      const scale = 0.8 + next() * 0.6;
      const stem = trunk.createInstance('city tree trunk');
      stem.position.set(CITY_ORIGIN.x + x, 1.4 * scale, CITY_ORIGIN.z + z);
      stem.scaling.setAll(scale);
      const top = crown.createInstance('city tree crown');
      top.position.set(CITY_ORIGIN.x + x, 3.7 * scale, CITY_ORIGIN.z + z);
      top.scaling.setAll(scale);
      stem.isPickable = top.isPickable = false;
      placed++;
    }
  }

  // Labels on real, named landmarks and shops.
  const named = city.buildings.filter(b => b.name).slice(0, 36);
  for (const building of named) {
    const text = building.name.length > 34 ? `${building.name.slice(0, 33)}…` : building.name;
    const width = 40 + text.length * 22;
    const label = new DynamicTexture(`city label ${building.id}`, { width, height: 64 }, scene, true);
    label.hasAlpha = true;
    const c = label.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = 'rgba(11,22,38,0.82)';
    c.fillRect(0, 0, width, 64);
    label.drawText(text, null, 44, 'bold 34px sans-serif', '#ffe2a8', null, true, false);
    label.update();
    const sign = MeshBuilder.CreatePlane(`city label ${building.name}`, { width: width / 64 * 1.1, height: 1.1 }, scene);
    const signMaterial = material(`label ${building.id}`, m => {
      m.diffuseTexture = label; m.emissiveTexture = label; m.opacityTexture = label;
      m.disableLighting = true; m.backFaceCulling = false;
    });
    sign.material = signMaterial;
    sign.billboardMode = Mesh.BILLBOARDMODE_Y;
    const cx = building.ring.reduce((s, p) => s + p[0], 0) / building.ring.length;
    const cz = building.ring.reduce((s, p) => s + p[1], 0) / building.ring.length;
    sign.position.set(CITY_ORIGIN.x + cx, building.height + 1.6, CITY_ORIGIN.z + cz);
    sign.isPickable = false;
    meshes.push(sign);
  }

  return () => {
    for (const mesh of meshes) mesh.dispose();
    for (const m of materials) m.dispose();
  };
}

/** A bus stop: pole with a sign and a small bench, on the grass beside the sidewalk. */
export function buildBusStop(scene: Scene, x: number, z: number, facing = 0) {
  const pole = MeshBuilder.CreateCylinder('bus stop pole', { height: 2.6, diameter: 0.07, tessellation: 10 }, scene);
  pole.position.set(x, 1.3, z);
  const steel = new StandardMaterial('bus stop steel', scene);
  steel.diffuseColor = Color3.FromHexString('#5b646b');
  pole.material = steel;
  const signTexture = new DynamicTexture('bus stop sign', { width: 256, height: 160 }, scene, true);
  const c = signTexture.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = '#1e5aa8';
  c.fillRect(0, 0, 256, 160);
  c.fillStyle = '#ffffff';
  c.fillRect(8, 8, 240, 144);
  c.fillStyle = '#1e5aa8';
  c.fillRect(14, 14, 228, 132);
  signTexture.drawText('BUS', null, 82, 'bold 64px sans-serif', '#ffffff', null, true, false);
  signTexture.drawText('Downtown', null, 132, 'bold 34px sans-serif', '#ffd27a', null, true, false);
  signTexture.update();
  const signMaterial = new StandardMaterial('bus stop sign face', scene);
  signMaterial.diffuseTexture = signTexture;
  signMaterial.emissiveColor = new Color3(0.25, 0.25, 0.25);
  signMaterial.backFaceCulling = false;
  const sign = MeshBuilder.CreatePlane('bus stop sign', { width: 0.62, height: 0.39 }, scene);
  sign.material = signMaterial;
  sign.position.set(x, 2.35, z);
  sign.rotation.y = facing;
  const bench = MeshBuilder.CreateBox('bus stop bench', { width: 1.3, height: 0.06, depth: 0.38 }, scene);
  bench.position.set(x - Math.cos(facing) * 0.9, 0.48, z + Math.sin(facing) * 0.9);
  bench.rotation.y = facing;
  bench.material = steel;
  for (const mesh of [pole, sign, bench]) mesh.isPickable = false;
  return () => { for (const mesh of [pole, sign, bench]) mesh.dispose(); signTexture.dispose(); };
}
