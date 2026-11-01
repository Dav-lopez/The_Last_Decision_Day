import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import { CITY_ORIGIN } from './cityLayout.mjs';
import { TRAFFIC, signalPhase, type LightState, type RoadGraph, type TrafficSignal } from './cityTraffic.mjs';

/** One signal head per approach: where it stands and which way it faces (world coordinates). */
type Head = { x: number; z: number; yaw: number; signal: TrafficSignal; axis: 0 | 1 };

const HEAD_HEIGHT = 3.1;
const LAMP_Y: Record<LightState, number> = { red: 0.3, yellow: 0, green: -0.3 };

/** Stop-line signal heads for every approach to every signalised junction. */
export function signalHeads(graph: RoadGraph, signals: Map<string, TrafficSignal>): Head[] {
  const heads: Head[] = [];
  for (const signal of signals.values()) {
    signal.axes.forEach((ids, axis) => {
      for (const id of ids) {
        const edge = graph.edges[id];
        // Walk back from the junction along the approach to just behind the stop line.
        const arrivingForward = edge.to === signal.node;
        const pts = arrivingForward ? edge.points : [...edge.points].reverse();
        const [nx, nz] = pts[pts.length - 1], [px, pz] = pts[pts.length - 2];
        const len = Math.hypot(nx - px, nz - pz) || 1;
        const dx = (nx - px) / len, dz = (nz - pz) / len; // direction of travel into the junction
        const back = Math.min(len, TRAFFIC.junctionBox + 0.6);
        const side = edge.lane * 2 + 0.9;               // the kerb on the driver's right
        heads.push({
          x: CITY_ORIGIN.x + nx - dx * back + dz * side, z: CITY_ORIGIN.z + nz - dz * back - dx * side,
          yaw: Math.atan2(-dx, -dz), signal, axis: axis as 0 | 1,
        });
      }
    });
  }
  return heads;
}

const glow = (scene: Scene, name: string, hex: string, lit: boolean) => {
  const material = new StandardMaterial(name, scene);
  const colour = Color3.FromHexString(hex);
  material.diffuseColor = lit ? colour : colour.scale(0.18);
  material.emissiveColor = lit ? colour : colour.scale(0.06);
  material.specularColor = new Color3(0.2, 0.2, 0.2);
  material.disableLighting = lit;
  return material;
};

/**
 * Draws the lights: poles, housings and lamps as thin instances (six draw
 * calls for the whole city). Lamps are re-laid when a light changes.
 */
export function buildTrafficLights(scene: Scene, graph: RoadGraph, signals: Map<string, TrafficSignal>) {
  const heads = signalHeads(graph, signals);
  const pole = MeshBuilder.CreateCylinder('traffic light pole', { height: HEAD_HEIGHT + 0.5, diameter: 0.12, tessellation: 8 }, scene);
  const housing = MeshBuilder.CreateBox('traffic light housing', { width: 0.36, height: 1.0, depth: 0.28 }, scene);
  const metal = new StandardMaterial('traffic light metal', scene);
  metal.diffuseColor = Color3.FromHexString('#2a2d31');
  metal.specularColor = new Color3(0.15, 0.15, 0.15);
  pole.material = metal; housing.material = metal;
  const lampMesh = (name: string, material: StandardMaterial) => {
    const lamp = MeshBuilder.CreateCylinder(name, { height: 0.06, diameter: 0.22, tessellation: 12 }, scene);
    lamp.rotation.x = Math.PI / 2; lamp.bakeCurrentTransformIntoVertices();
    lamp.material = material;
    return lamp;
  };
  const lit: Record<LightState, Mesh> = {
    red: lampMesh('traffic lamp red', glow(scene, 'traffic lamp red', '#ff2a1a', true)),
    yellow: lampMesh('traffic lamp yellow', glow(scene, 'traffic lamp yellow', '#ffb000', true)),
    green: lampMesh('traffic lamp green', glow(scene, 'traffic lamp green', '#22e06a', true)),
  };
  const dim = lampMesh('traffic lamp off', glow(scene, 'traffic lamp off', '#8a8f86', false));
  const all = [pole, housing, dim, ...Object.values(lit)];
  for (const mesh of all) { mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true; }

  const matrix = (x: number, y: number, z: number, yaw: number) =>
    Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(0, yaw, 0), new Vector3(x, y, z));
  const fill = (mesh: Mesh, matrices: Matrix[]) => {
    const buffer = new Float32Array(Math.max(1, matrices.length) * 16);
    matrices.forEach((m, i) => m.copyToArray(buffer, i * 16));
    mesh.thinInstanceSetBuffer('matrix', buffer, 16, false);
    mesh.thinInstanceCount = matrices.length;
  };
  fill(pole, heads.map(h => matrix(h.x, (HEAD_HEIGHT + 0.5) / 2, h.z, h.yaw)));
  fill(housing, heads.map(h => matrix(h.x, HEAD_HEIGHT, h.z, h.yaw)));
  // Lamps sit on the housing's front face (local +z, turned towards the traffic).
  const lampAt = (h: Head, state: LightState) => {
    const fx = Math.sin(h.yaw) * 0.16, fz = Math.cos(h.yaw) * 0.16;
    return matrix(h.x + fx, HEAD_HEIGHT + LAMP_Y[state], h.z + fz, h.yaw);
  };
  let last = '';
  const update = (time: number) => {
    const states = heads.map(h => signalPhase(h.signal, time)[h.axis]);
    const key = states.join('');
    if (key === last) return;
    last = key;
    for (const state of ['red', 'yellow', 'green'] as LightState[]) fill(lit[state], heads.filter((_, i) => states[i] === state).map(h => lampAt(h, state)));
    fill(dim, heads.flatMap((h, i) => (['red', 'yellow', 'green'] as LightState[]).filter(s => s !== states[i]).map(s => lampAt(h, s))));
  };
  return {
    count: heads.length,
    update,
    setVisible: (visible: boolean) => { for (const mesh of all) mesh.setEnabled(visible); },
    dispose: () => { for (const mesh of all) { mesh.material?.dispose(); mesh.dispose(); } },
  };
}
