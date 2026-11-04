import { type BaseTexture, Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, VertexData, type Scene } from '@babylonjs/core';
import { CITY_ORIGIN, laneDashes, pointInRing, triangulate, type City } from './cityLayout.mjs';
import { awningSpans, drawFacade, FACADE_STYLES, FACADE_TILE, facadeVariant, litWindows, rooftopUnits } from './facadeDesign.mjs';
import { AMBIENT, awningShadow, buildingIndex, contactFalloff, contactStrips, edgeNormal, facingNeighbour, wallBreaks, wallShade, type GroundQuad } from './downtownLighting.mjs';

const { bay: BAY, floor: FLOOR, bays: TILE_BAYS, floors: TILE_FLOORS } = FACADE_TILE;
type StyleName = keyof typeof FACADE_STYLES;

/**
 * Four bays by four storeys of one style, as a 512 px canvas: 'day' colour, 'night' lit windows (the
 * emissive map after dark) or 'gloss' (glass shines, walls stay matte). Walls tile it by their UVs.
 */
function facadeTexture(scene: Scene, style: StyleName, mode: 'day' | 'night' | 'gloss') {
  // The colour map gets 128 px per bay; the gloss and night maps are soft anyway, so a quarter of the memory.
  const size = mode === 'day' ? 512 : 256;
  const texture = new DynamicTexture(`city facade ${style} ${mode}`, { width: size, height: size }, scene, true);
  drawFacade(texture.getContext() as unknown as CanvasRenderingContext2D, style, size, mode, litWindows(style.length * 31 + 2));
  texture.update();
  // Dynamic textures clamp by default; facades must repeat along every wall.
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  return texture;
}

/** Canvas awning stripes along the length; the colour comes from each shop's vertex colour. */
function awningTexture(scene: Scene) {
  const texture = new DynamicTexture('city awning stripes', { width: 64, height: 16 }, scene, true);
  const c = texture.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 16);
  c.fillStyle = '#d8d2c4'; c.fillRect(32, 0, 32, 16);
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
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

type Buffers = { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; colors: number[] };
const buffers = (): Buffers => ({ positions: [], normals: [], uvs: [], indices: [], colors: [] });
function toMesh(scene: Scene, name: string, data: Buffers, material: StandardMaterial) {
  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = data.positions;
  vertexData.normals = data.normals;
  vertexData.uvs = data.uvs;
  vertexData.indices = data.indices;
  // Per-building tints ride on vertex colours, so a whole style is still one draw call.
  if (data.colors.length) vertexData.colors = data.colors;
  vertexData.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}
/** Gives every vertex added since `from` this colour. */
function paint(target: Buffers, from: number, rgb: readonly number[]) {
  for (let i = from; i < target.positions.length / 3; i++) target.colors.push(rgb[0], rgb[1], rgb[2], 1);
}

/**
 * Wall quads with outward normals; the ring is counter-clockwise (x east, z north). UVs are in facade
 * tiles (four bays by four storeys); `uShift` (in bays) moves where the window grid starts along each wall.
 */
function addWalls(target: Buffers, ring: number[][], height: number, base = 0, offset = 0, uShift = 0) {
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
    const u0 = uShift / TILE_BAYS; const u1 = u0 + length / BAY / TILE_BAYS;
    const v0 = base / FLOOR / TILE_FLOORS; const v1 = (base + height) / FLOOR / TILE_FLOORS;
    target.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    target.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

/**
 * Like `addWalls`, with baked ambient light (open-world 20b): each wall is cut into bands where the
 * shading bends (`wallBreaks`) and every vertex carries the building's tint times `wallShade` — darker at
 * the pavement and where the building across the alley hides the sky. Returns how many walls face one.
 */
function addShadedWalls(target: Buffers, ring: number[][], height: number, uShift: number, tint: readonly number[],
  neighbour: (a: number[], b: number[], normal: [number, number]) => { distance: number; height: number }) {
  let canyons = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]; const b = ring[(i + 1) % ring.length];
    const normal = edgeNormal(a, b);
    if (!normal) continue;
    const [nx, nz] = normal;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const facing = neighbour(a, b, normal);
    if (facing.distance < Infinity) canyons++;
    const ys = wallBreaks(height, facing.height);
    const u0 = uShift / TILE_BAYS; const u1 = u0 + length / BAY / TILE_BAYS;
    const x0 = CITY_ORIGIN.x + a[0]; const z0 = CITY_ORIGIN.z + a[1];
    const x1 = CITY_ORIGIN.x + b[0]; const z1 = CITY_ORIGIN.z + b[1];
    for (let k = 0; k + 1 < ys.length; k++) {
      const lo = ys[k]; const hi = ys[k + 1];
      const start = target.positions.length / 3;
      target.positions.push(x0, lo, z0, x1, lo, z1, x1, hi, z1, x0, hi, z0);
      for (let n = 0; n < 4; n++) target.normals.push(nx, 0, nz);
      const v0 = lo / FLOOR / TILE_FLOORS; const v1 = hi / FLOOR / TILE_FLOORS;
      target.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      target.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      for (const y of [lo, lo, hi, hi]) {
        const shade = wallShade(y, facing.distance, facing.height);
        target.colors.push(tint[0] * shade, tint[1] * shade, tint[2] * shade, 1);
      }
    }
  }
  return canyons;
}

/** Flat quads on the ground with v running from `near` (corners 0–1) to `far` (corners 2–3). */
function addGroundQuads(target: Buffers, quads: GroundQuad[], y: number, near = 0, far = 1) {
  for (const corners of quads) {
    const start = target.positions.length / 3;
    for (const [x, z] of corners) {
      target.positions.push(CITY_ORIGIN.x + x, y, CITY_ORIGIN.z + z);
      target.normals.push(0, 1, 0);
    }
    target.uvs.push(0.5, near, 0.5, near, 0.5, far, 0.5, far);
    target.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  }
}

/** Contact shadow falloff across a strip (alpha only), sampled from `contactFalloff`. */
function contactTexture(scene: Scene) {
  const texture = new DynamicTexture('city contact shadow', { width: 4, height: 64 }, scene, true);
  texture.hasAlpha = true;
  const c = texture.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, 4, 64);
  for (let row = 0; row < 64; row++) {
    // Canvas row 0 is the top of the texture, which Babylon maps to v = 1 (the outer edge).
    c.fillStyle = `rgba(0,0,0,${contactFalloff(1 - (row + 0.5) / 64).toFixed(3)})`;
    c.fillRect(0, row, 4, 1);
  }
  texture.update();
  return texture;
}

/** An axis-aligned box (rooftop plant), city-local x/z, sitting on `y`. */
function addBox(target: Buffers, x: number, y: number, z: number, width: number, height: number, depth: number) {
  const cx = CITY_ORIGIN.x + x; const cz = CITY_ORIGIN.z + z;
  const hx = width / 2; const hz = depth / 2;
  const faces: Array<[number[], number[][]]> = [
    [[0, 1, 0], [[-hx, height, -hz], [-hx, height, hz], [hx, height, hz], [hx, height, -hz]]],
    [[0, 0, 1], [[-hx, 0, hz], [hx, 0, hz], [hx, height, hz], [-hx, height, hz]]],
    [[0, 0, -1], [[hx, 0, -hz], [-hx, 0, -hz], [-hx, height, -hz], [hx, height, -hz]]],
    [[1, 0, 0], [[hx, 0, hz], [hx, 0, -hz], [hx, height, -hz], [hx, height, hz]]],
    [[-1, 0, 0], [[-hx, 0, -hz], [-hx, 0, hz], [-hx, height, hz], [-hx, height, -hz]]],
  ];
  for (const [normal, corners] of faces) {
    const start = target.positions.length / 3;
    for (const [px, py, pz] of corners) {
      target.positions.push(cx + px, y + py, cz + pz);
      target.normals.push(normal[0], normal[1], normal[2]);
    }
    target.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    target.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

/** A shop awning over a wall span: a canvas slope out from the wall and a short valance at the front. */
function addAwning(target: Buffers, a: number[], b: number[], normal: number[]) {
  const top = 3.2; const drop = 0.55; const reach = 1.25; const valance = 0.24;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [nx, nz] = normal;
  const at = (p: number[], out: number, y: number) => [CITY_ORIGIN.x + p[0] + nx * out, y, CITY_ORIGIN.z + p[1] + nz * out];
  const slope = Math.hypot(reach, drop);
  const quads: Array<[number[], number[][]]> = [
    [[nx * drop / slope, reach / slope, nz * drop / slope], [at(a, 0.05, top), at(b, 0.05, top), at(b, reach, top - drop), at(a, reach, top - drop)]],
    [[nx, 0, nz], [at(a, reach, top - drop), at(b, reach, top - drop), at(b, reach, top - drop - valance), at(a, reach, top - drop - valance)]],
  ];
  const stripes = length / 0.9;
  for (const [n, corners] of quads) {
    const start = target.positions.length / 3;
    for (const [px, py, pz] of corners) { target.positions.push(px, py, pz); target.normals.push(n[0], n[1], n[2]); }
    target.uvs.push(0, 1, stripes, 1, stripes, 0, 0, 0);
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
 * trees and labels on named landmarks; cornices, rooftop plant and shop awnings
 * (open-world 20a); baked ambient light on walls and pavements (20b). Returns a dispose function that also switches the lit
 * windows on after dark (`setEvening`).
 */
export function buildCityScene(scene: Scene, city: City) {
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  const textures: DynamicTexture[] = [];
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

  const walls: Partial<Record<StyleName, Buffers>> = {};
  const storefronts = buffers();
  const roofs = buffers();
  const parapets = buffers();
  const plant = buffers();
  const awnings = buffers();
  const contact = buffers();
  let awningCount = 0;
  let plantCount = 0;
  let canyonWalls = 0;
  let contactCount = 0;
  const footprints = buildingIndex(city.buildings);
  city.buildings.forEach((building, self) => {
    const { style, tint, bayShift, parapet } = facadeVariant(building);
    const look = FACADE_STYLES[style];
    const target = (walls[style] ??= buffers());
    canyonWalls += addShadedWalls(target, building.ring, building.height, bayShift, tint,
      (a, b, normal) => facingNeighbour(city.buildings, footprints, self, a, b, normal));
    // A soft shadow on the pavement along the foot of every wall that isn't against a neighbour.
    const strips = contactStrips(building.ring, (x, z) => footprints.at(x, z, self) >= 0);
    addGroundQuads(contact, strips, 0.05);
    contactCount += strips.length;
    addCap(roofs, building.ring, building.height);
    if (parapet > 0) {
      // A cornice that stands proud of the wall and rises past the roof as a parapet.
      const start = parapets.positions.length / 3;
      addWalls(parapets, building.ring, parapet + 0.32, building.height - 0.32, 0.14);
      const trim = Color3.FromHexString(look.trim);
      paint(parapets, start, [trim.r * tint[0], trim.g * tint[1], trim.b * tint[2]]);
    }
    for (const unit of rooftopUnits(building)) {
      const start = plant.positions.length / 3;
      addBox(plant, unit.x, building.height, unit.z, unit.width, unit.height, unit.depth);
      paint(plant, start, unit.kind === 'housing' ? [0.78, 0.76, 0.72] : [0.62, 0.65, 0.67]);
      plantCount++;
    }
    if (look.storefront && (building.shop || ['commercial', 'retail'].includes(building.kind))) {
      addWalls(storefronts, building.ring, 2.7, 0.35, 0.04);
    }
    for (const span of awningSpans(building, city.roads)) {
      const start = awnings.positions.length / 3;
      addAwning(awnings, span.a, span.b, span.normal);
      const colour = Color3.FromHexString(span.colour);
      paint(awnings, start, [colour.r, colour.g, colour.b]);
      // The awning's shade on the pavement below, deepest by the shop window.
      addGroundQuads(contact, [awningShadow(span)], 0.052, 0.15, 0.85);
      awningCount++;
    }
  });
  // Lit windows after dark: each style's night map goes on as its emissive texture in the evening.
  const nightMaps: Array<{ material: StandardMaterial; night: DynamicTexture }> = [];
  for (const [style, data] of Object.entries(walls) as Array<[StyleName, Buffers]>) {
    const night = facadeTexture(scene, style, 'night');
    textures.push(night);
    const wall = material(`${style} facade`, m => {
      m.diffuseTexture = facadeTexture(scene, style, 'day');
      // Glass catches the sun and the street lamps; brick and stucco stay matte.
      m.specularTexture = facadeTexture(scene, style, 'gloss');
      m.specularColor = new Color3(0.55, 0.55, 0.55);
      m.specularPower = 48;
      m.backFaceCulling = false;
    });
    nightMaps.push({ material: wall, night });
    const mesh = toMesh(scene, `city ${style} walls`, data, wall);
    mesh.checkCollisions = true;
    meshes.push(mesh);
  }
  const shopGlass = material('storefront glass', m => {
    m.diffuseColor = Color3.FromHexString('#24333d');
    m.emissiveColor = new Color3(0.08, 0.1, 0.11);
    m.specularColor = new Color3(0.7, 0.7, 0.7);
    m.backFaceCulling = false;
  });
  meshes.push(toMesh(scene, 'city storefronts', storefronts, shopGlass));
  meshes.push(toMesh(scene, 'city roofs', roofs, material('roofs', m => {
    m.diffuseTexture = speckleTexture(scene, 'roof gravel', '#6d6a66', ['#5b5854', '#7f7c77'], 1);
    m.backFaceCulling = false;
  })));
  meshes.push(toMesh(scene, 'city cornices', parapets, material('cornice', m => {
    m.diffuseTexture = speckleTexture(scene, 'cornice stone', '#f2f0ea', ['#e2dfd7', '#d6d2c8'], 1);
    m.backFaceCulling = false;
  })));
  meshes.push(toMesh(scene, 'city rooftop plant', plant, material('rooftop plant', m => {
    m.diffuseTexture = speckleTexture(scene, 'galvanised', '#e4e6e8', ['#d2d5d8', '#c3c7cb'], 1);
    m.specularColor = new Color3(0.25, 0.25, 0.25);
    m.backFaceCulling = false;
  })));
  meshes.push(toMesh(scene, 'city awnings', awnings, material('awning canvas', m => {
    m.diffuseTexture = awningTexture(scene);
    m.backFaceCulling = false;
  })));

  // Baked contact shadows: one alpha-blended mesh, no lights, no shadow maps.
  const contactMesh = toMesh(scene, 'city contact shadows', contact, material('contact shadow', m => {
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.disableLighting = true;
    m.opacityTexture = contactTexture(scene);
    m.alpha = AMBIENT.contactAlpha;
    m.zOffset = -2;
    m.backFaceCulling = false;
  }));
  meshes.push(contactMesh);

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

  let evening = false;
  const dispose = () => {
    for (const mesh of meshes) mesh.dispose();
    // Each texture once, whether it is on a material now (day maps, labels) or waiting for the evening.
    const owned = new Set<BaseTexture>(textures);
    for (const m of materials) for (const t of m.getActiveTextures()) owned.add(t);
    for (const m of materials) m.dispose();
    for (const t of owned) t.dispose();
  };
  return Object.assign(dispose, {
    /** After dark, windows light up (about two in five) and shop glass glows warm. */
    setEvening(on: boolean) {
      evening = on;
      for (const { material: m, night } of nightMaps) m.emissiveTexture = on ? night : null;
      shopGlass.emissiveColor = on ? new Color3(0.62, 0.5, 0.34) : new Color3(0.08, 0.1, 0.11);
    },
    /** What the playtest checks: facade styles, awnings, rooftop plant, lit windows and the baked ambient light. */
    look: () => ({ styles: nightMaps.length, awnings: awningCount, rooftop: plantCount, lit: evening, contactShadows: contactCount, canyonWalls }),
  });
}
