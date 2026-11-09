import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Vector3, type Scene } from '../babylon';
import { ROAD_STRAIGHT_TO, centreDashes, roadPose, roadProgress, type OpenRoad } from './openRoad.mjs';

/**
 * The open road between Maple Street and downtown (item 17): tarmac with edge lines and centre dashes where Maple
 * Street's own road ends, a grass verge over the gap between the town's ground and downtown's, reflector posts
 * (they catch your headlights at night) and two road signs. A few frozen, unpickable meshes; no downloads.
 */
export function buildOpenRoadScene(scene: Scene, road: OpenRoad, cityName: string): () => void {
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  const textures: DynamicTexture[] = [];
  const keep = <T extends Mesh>(mesh: T): T => { mesh.isPickable = false; mesh.receiveShadows = true; meshes.push(mesh); return mesh; };
  const paint = (name: string, hex: string) => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.specularColor = new Color3(0.04, 0.04, 0.04);
    materials.push(material);
    return material;
  };
  const canvas = (name: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => {
    const texture = new DynamicTexture(name, { width, height }, scene, true);
    draw(texture.getContext() as unknown as CanvasRenderingContext2D);
    texture.update();
    textures.push(texture);
    return texture;
  };

  const start = roadProgress(road, { x: 0, z: ROAD_STRAIGHT_TO - 2 }).index - 1;
  const samples = road.points.slice(Math.max(0, start));
  const sideways = (i: number) => {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.z - a.z) / length, z: -(b.x - a.x) / length };
  };
  /** A strip along the road, `from`..`to` metres from the centreline (negative is left). */
  const strip = (name: string, from: (half: number) => number, to: (half: number) => number, y: number) => {
    const left: Vector3[] = [], right: Vector3[] = [];
    samples.forEach((p, i) => {
      const side = sideways(i);
      left.push(new Vector3(p.x + side.x * from(p.half), y, p.z + side.z * from(p.half)));
      right.push(new Vector3(p.x + side.x * to(p.half), y, p.z + side.z * to(p.half)));
    });
    return keep(MeshBuilder.CreateRibbon(name, { pathArray: [left, right], sideOrientation: Mesh.DOUBLESIDE }, scene));
  };

  // Grass over the gap between Maple Street's ground (to z = 240) and downtown's paving.
  const verge = keep(MeshBuilder.CreateGround('open road verge', { width: 220, height: 90 }, scene));
  verge.position.set(0, -0.035, 262);
  const grass = paint('open road grass', '#ffffff');
  grass.diffuseTexture = canvas('open road grass blades', 128, 128, context => {
    context.fillStyle = '#62894f';
    context.fillRect(0, 0, 128, 128);
    let state = 7;
    const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 700; i++) {
      context.fillStyle = ['#557d45', '#71985a', '#4d7340', '#7ea463'][i % 4];
      context.fillRect(next() * 128, next() * 128, 1 + next() * 2, 1 + next() * 3);
    }
  });
  (grass.diffuseTexture as DynamicTexture).uScale = 220 / 6;
  (grass.diffuseTexture as DynamicTexture).vScale = 90 / 6;
  verge.material = grass;

  const asphalt = paint('open road asphalt', '#ffffff');
  asphalt.diffuseTexture = canvas('open road asphalt grain', 128, 128, context => {
    context.fillStyle = '#5a5e61';
    context.fillRect(0, 0, 128, 128);
    let state = 23;
    const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 900; i++) {
      context.fillStyle = ['#4c5053', '#6c7174', '#62676a'][i % 3];
      context.fillRect(next() * 128, next() * 128, 1 + next() * 2, 1 + next() * 3);
    }
  });
  (asphalt.diffuseTexture as DynamicTexture).uScale = Math.max(1, (road.length - ROAD_STRAIGHT_TO) / 4);
  strip('open road tarmac', half => -half, half => half, 0.016).material = asphalt;
  const lineWhite = paint('open road edge paint', '#e9e6dc');
  strip('open road edge line', half => -half + 0.25, half => -half + 0.4, 0.024).material = lineWhite;
  strip('open road edge line', half => half - 0.4, half => half - 0.25, 0.024).material = lineWhite;
  // Gravel shoulders either side, so the tarmac doesn't end on a knife edge.
  const gravel = paint('open road shoulder', '#8d8a80');
  strip('open road shoulder', half => -half - 0.9, half => -half, 0.008).material = gravel;
  strip('open road shoulder', half => half, half => half + 0.9, 0.008).material = gravel;

  // Centre dashes, stopping where downtown's own street markings take over.
  const yellow = paint('open road centre paint', '#e2c24a');
  const dash = keep(MeshBuilder.CreateGround('open road dash', { width: 0.14, height: 1 }, scene));
  dash.material = yellow;
  dash.isVisible = false;
  const stopAt = road.length - 50;
  for (const [a, b] of centreDashes(road)) {
    if (roadProgress(road, b).along > stopAt) break;
    const copy = dash.createInstance('open road dash');
    copy.position.set((a.x + b.x) / 2, 0.026, (a.z + b.z) / 2);
    copy.rotation.y = a.rotation;
    copy.scaling.z = Math.hypot(b.x - a.x, b.z - a.z);
    copy.isPickable = false;
  }

  // Reflector posts every 24 m on both verges.
  const postMaterial = paint('open road post', '#f1efe8');
  const reflector = paint('open road reflector', '#ff8a2a');
  reflector.emissiveColor = new Color3(0.35, 0.14, 0.02);
  const post = keep(MeshBuilder.CreateBox('open road post', { width: 0.12, height: 1, depth: 0.12 }, scene));
  post.material = postMaterial;
  post.isVisible = false;
  const cap = keep(MeshBuilder.CreateBox('open road reflector', { width: 0.13, height: 0.16, depth: 0.13 }, scene));
  cap.material = reflector;
  cap.isVisible = false;
  for (let s = roadProgress(road, { x: 0, z: 30 }).along; s < road.length - 40; s += 24) {
    const pose = roadPose(road, s / road.length);
    const half = roadProgress(road, pose).half + 1.4;
    for (const side of [-1, 1]) {
      const x = pose.x + Math.cos(pose.rotation) * half * side, z = pose.z - Math.sin(pose.rotation) * half * side;
      const p = post.createInstance('open road post'); p.position.set(x, 0.5, z); p.isPickable = false;
      const c = cap.createInstance('open road reflector'); c.position.set(x, 0.86, z); c.isPickable = false;
    }
  }

  // Two green road signs: one out of town, one coming home.
  const sign = (name: string, lines: string[], t: number, facing: 1 | -1) => {
    const texture = canvas(`${name} face`, 512, 256, context => {
      context.fillStyle = '#1f6b3a';
      context.fillRect(0, 0, 512, 256);
      context.strokeStyle = '#f4f4ef';
      context.lineWidth = 8;
      context.strokeRect(12, 12, 488, 232);
      context.fillStyle = '#f4f4ef';
      context.textAlign = 'center';
      context.font = 'bold 54px sans-serif';
      context.fillText(lines[0], 256, 104);
      context.font = 'bold 44px sans-serif';
      context.fillText(lines[1], 256, 186);
    });
    const face = paint(`${name} material`, '#ffffff');
    face.diffuseTexture = texture;
    face.emissiveColor = new Color3(0.18, 0.18, 0.18);
    const board = keep(MeshBuilder.CreatePlane(name, { width: 3.2, height: 1.6 }, scene));
    board.material = face;
    const back = keep(MeshBuilder.CreateBox(`${name} back`, { width: 3.3, height: 1.7, depth: 0.06 }, scene));
    back.material = backing;
    const pose = roadPose(road, t);
    const half = roadProgress(road, pose).half + 1.8;
    const side = facing;
    const x = pose.x + Math.cos(pose.rotation) * half * side, z = pose.z - Math.sin(pose.rotation) * half * side;
    // A plane's face looks down -Z: turned to the road's heading, it faces drivers coming towards downtown.
    const turn = pose.rotation + (facing === 1 ? 0 : Math.PI);
    board.position.set(x - Math.sin(turn) * 0.04, 2.6, z - Math.cos(turn) * 0.04);
    board.rotation.y = turn;
    back.position.set(x, 2.6, z);
    back.rotation.y = turn;
    for (const offset of [-1.2, 1.2]) {
      const leg = keep(MeshBuilder.CreateBox(`${name} leg`, { width: 0.1, height: 2.2, depth: 0.1 }, scene));
      leg.material = postMaterial;
      leg.position.set(x + Math.cos(pose.rotation) * offset, 1.1, z - Math.sin(pose.rotation) * offset);
    }
  };
  const backing = paint('open road sign back', '#8a8f93');
  const shortName = cityName.split(',')[0];
  sign('open road sign downtown', [`${shortName} ↑`, `${(road.length / 1000).toFixed(1)} km`], 0.12, 1);
  sign('open road sign maple', ['Maple Street ↑', `via ${road.street}`], 0.86, -1);

  for (const mesh of meshes) mesh.freezeWorldMatrix();
  return () => {
    for (const mesh of meshes) mesh.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  };
}
