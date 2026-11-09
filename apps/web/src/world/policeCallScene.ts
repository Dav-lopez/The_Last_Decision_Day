import {
  Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, SceneLoader, StandardMaterial, TransformNode, Vector3,
  type AnimationGroup, type Material, type Scene, type ShadowGenerator,
} from '../babylon';
import '@babylonjs/loaders/glTF';
import { modelFor, normalizeLook } from './appearance.mjs';
import { dressCharacter } from './riggedAvatar';
import { normalizeRiggedVisual } from './riggedPresentation.mjs';
import { resolveNpcBody, resolveNpcClips } from './npcAnimationClips.mjs';
import { smoothHumanHeading, HUMAN_WALK_SPEED } from './humanMotion.mjs';
import { CITY_ORIGIN } from './cityLayout.mjs';
import type { PoliceCall } from './policeCalls.mjs';

/**
 * The people and things on a police call (open-world 16b), loaded the first time a patrol has one: a lost boy who
 * walks behind you to his dad (red hoodie), a hatchback pulled in at the kerb with its hazards blinking, or a party
 * flat whose window glows to the beat with notes drifting up, and the resident who answers the door. Everything is
 * built from the game's own people and sedan plus a little procedural geometry (no downloads, no extra lights).
 */
export type PoliceCallView = {
  update: (seconds: number, call: PoliceCall, quality: { scale: number }) => void;
  dispose: () => void;
};

type Person = { holder: TransformNode; idle: AnimationGroup; walk: AnimationGroup; walkWeight: number; heading: number; dispose: () => void };

const LOOKS = {
  child: normalizeLook({ body: 'male', skin: 'light', hair: 'blonde', hairStyle: 'buzzed', top: 'tshirt', outfit: 'gold', bottom: 'shorts', bottomColor: 'denim', shoes: 'sneakers', shoeColor: 'red' }),
  dad: normalizeLook({ body: 'male', skin: 'light', hair: 'brown', hairStyle: 'parted', facialHair: 'beard', top: 'hoodie', outfit: 'red', bottom: 'jeans', bottomColor: 'denim', shoes: 'boots', shoeColor: 'brown' }),
  resident: normalizeLook({ body: 'female', skin: 'brown', hair: 'black', hairStyle: 'buns', top: 'tshirt', outfit: 'purple', bottom: 'jeans', bottomColor: 'black', shoes: 'flats', shoeColor: 'pink' }),
};
const world = (x: number, z: number) => new Vector3(CITY_ORIGIN.x + x, 0, CITY_ORIGIN.z + z);

async function loadPerson(scene: Scene, name: string, look: ReturnType<typeof normalizeLook>, scale: number, shadows?: ShadowGenerator | null): Promise<Person | null> {
  const model = modelFor(look);
  const container = await SceneLoader.LoadAssetContainerAsync('/models/', model, scene).catch(() => null);
  if (!container || scene.isDisposed) { container?.dispose(); return null; }
  const chosen = resolveNpcBody(model, new Map([[model, container]]));
  if (!chosen) { container.dispose(); return null; }
  const entries = chosen.container.instantiateModelsToScene(part => `call ${name} ${part}`, true);
  const clips = resolveNpcClips(chosen.container.animationGroups, entries.animationGroups);
  if (!clips) { entries.dispose(); container.dispose(); return null; }
  const holder = new TransformNode(`call ${name}`, scene);
  const visual = new TransformNode(`call ${name} visual`, scene);
  for (const node of entries.rootNodes) node.parent = visual;
  normalizeRiggedVisual(visual);
  visual.parent = holder;
  holder.scaling.setAll(scale);
  entries.animationGroups.forEach(group => { if (group !== clips.idle && group !== clips.walk) group.stop(); });
  clips.idle.start(true); clips.walk.start(true);
  clips.idle.setWeightForAllAnimatables(1); clips.walk.setWeightForAllAnimatables(0);
  // Shorter legs take quicker steps.
  clips.walk.speedRatio = 1.25 / scale;
  const materials = [...new Set(holder.getChildMeshes().map(mesh => mesh.material).filter((m): m is Material => Boolean(m)))];
  dressCharacter(materials, holder.getChildMeshes(), look);
  for (const mesh of holder.getChildMeshes()) { mesh.isPickable = false; mesh.receiveShadows = true; shadows?.addShadowCaster(mesh, false); }
  return { holder, idle: clips.idle, walk: clips.walk, walkWeight: 0, heading: 0, dispose: () => { entries.dispose(); holder.dispose(); container.dispose(); } };
}

function posePerson(person: Person, x: number, z: number, heading: number, moving: boolean, seconds: number, snap = false) {
  person.heading = snap ? heading : smoothHumanHeading(person.heading, heading, seconds, 8);
  person.holder.position.copyFrom(world(x, z));
  person.holder.rotation.y = person.heading;
  const target = moving ? 1 : 0;
  person.walkWeight += Math.sign(target - person.walkWeight) * Math.min(Math.abs(target - person.walkWeight), seconds / 0.2);
  person.walk.setWeightForAllAnimatables(person.walkWeight);
  person.idle.setWeightForAllAnimatables(1 - person.walkWeight);
}

/** A soft round amber lamp (emissive, unlit): the car's hazard lights. */
function lamp(scene: Scene, name: string, material: StandardMaterial) {
  const mesh = MeshBuilder.CreateSphere(name, { diameter: 0.16, segments: 6 }, scene);
  mesh.material = material; mesh.isPickable = false;
  return mesh;
}

export function createPoliceCall(scene: Scene, call: PoliceCall, shadows?: ShadowGenerator | null): PoliceCallView {
  let disposed = false;
  let time = 0;
  const people: Record<'child' | 'dad' | 'resident', Person | null> = { child: null, dad: null, resident: null };
  const placed = new Set<string>();
  const disposers: Array<() => void> = [];
  const load = (key: keyof typeof people, scale: number) => {
    void loadPerson(scene, key, LOOKS[key], scale, shadows).then(person => {
      if (disposed) { person?.dispose(); return; }
      people[key] = person;
      person?.holder.setEnabled(key !== 'resident');
    });
  };

  // Lost child: the boy and his dad.
  if (call.kind === 'lost-child') { load('child', 0.64); load('dad', 1); }

  // Traffic stop: the authored sedan, repainted, pulled in with its hazards going.
  let hazards: { meshes: Mesh[]; material: StandardMaterial } | null = null;
  let carRoot: TransformNode | null = null;
  if (call.kind === 'traffic-stop' && call.car) {
    const car = call.car;
    void SceneLoader.LoadAssetContainerAsync('/models/environment/', 'sedan.glb', scene).then(container => {
      if (disposed || scene.isDisposed) { container.dispose(); return; }
      const entries = container.instantiateModelsToScene(part => `call car ${part}`, true);
      const root = new TransformNode('call car', scene);
      for (const node of entries.rootNodes) node.parent = root;
      for (const mesh of root.getChildMeshes()) {
        const material = mesh.material;
        if (material && /paint/i.test(material.name)) {
          if (material instanceof PBRMaterial) material.albedoColor = Color3.FromHexString('#c9a227');
          else if (material instanceof StandardMaterial) material.diffuseColor = Color3.FromHexString('#c9a227');
        }
        mesh.isPickable = false; mesh.receiveShadows = true; shadows?.addShadowCaster(mesh, false);
      }
      root.position.copyFrom(world(car.x, car.z));
      root.rotation.y = car.rotation;
      // Hazard lamps at the four corners of the body, from its own bounds (in the root's frame).
      root.computeWorldMatrix(true);
      const saved = root.rotation.y; root.rotation.y = 0; root.position.setAll(0); root.computeWorldMatrix(true);
      const { min, max } = root.getHierarchyBoundingVectors(true);
      root.rotation.y = saved; root.position.copyFrom(world(car.x, car.z));
      const material = new StandardMaterial('call hazard', scene);
      material.disableLighting = true; material.emissiveColor = Color3.FromHexString('#ffa21a');
      const y = min.y + (max.y - min.y) * 0.42;
      const meshes = [[min.x + 0.12, min.z], [max.x - 0.12, min.z], [min.x + 0.12, max.z], [max.x - 0.12, max.z]].map(([x, z], i) => {
        const mesh = lamp(scene, `call hazard ${i}`, material);
        mesh.parent = root; mesh.position.set(x, y, z);
        return mesh;
      });
      hazards = { meshes, material };
      carRoot = root;
      disposers.push(() => { for (const mesh of meshes) mesh.dispose(); material.dispose(); root.dispose(); entries.dispose(); container.dispose(); });
    }).catch(() => { /* No car: the call still plays as a conversation. */ });
  }

  // Noise complaint: a glowing party window above the door, pulsing to the beat, and notes drifting up.
  let party: { glow: Mesh; glowMaterial: StandardMaterial; notes: Mesh[]; noteMaterial: StandardMaterial; texture: DynamicTexture } | null = null;
  if (call.kind === 'noise-complaint' && call.door) {
    load('resident', 1);
    const door = call.door;
    const anchor = new TransformNode('call party', scene);
    anchor.position.copyFrom(world(door.x, door.z));
    anchor.rotation.y = door.heading;
    const glowMaterial = new StandardMaterial('call party glow', scene);
    glowMaterial.disableLighting = true; glowMaterial.emissiveColor = Color3.FromHexString('#ff4fb8'); glowMaterial.alpha = 0.75;
    glowMaterial.backFaceCulling = false;
    const glow = MeshBuilder.CreatePlane('call party window', { width: 2.2, height: 1.3 }, scene);
    glow.material = glowMaterial; glow.parent = anchor; glow.position.set(0, 4.6, 1.05); glow.isPickable = false;
    const texture = new DynamicTexture('call note', { width: 64, height: 64 }, scene, true);
    texture.hasAlpha = true;
    const context = texture.getContext() as unknown as CanvasRenderingContext2D;
    context.clearRect(0, 0, 64, 64);
    context.fillStyle = '#ffffff'; context.font = 'bold 52px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText('♪', 32, 34);
    texture.update();
    const noteMaterial = new StandardMaterial('call note', scene);
    noteMaterial.disableLighting = true; noteMaterial.emissiveTexture = texture; noteMaterial.opacityTexture = texture;
    noteMaterial.emissiveColor = Color3.FromHexString('#ffe27a'); noteMaterial.backFaceCulling = false;
    const notes = Array.from({ length: 6 }, (_, i) => {
      const note = MeshBuilder.CreatePlane(`call note ${i}`, { size: 0.42 }, scene);
      note.material = noteMaterial; note.parent = anchor; note.isPickable = false;
      note.billboardMode = Mesh.BILLBOARDMODE_ALL;
      return note;
    });
    party = { glow, glowMaterial, notes, noteMaterial, texture };
    disposers.push(() => { for (const note of notes) note.dispose(); glow.dispose(); glowMaterial.dispose(); noteMaterial.dispose(); texture.dispose(); anchor.dispose(); });
  }

  const colours = ['#ff4fb8', '#7a6bff', '#3fd6ff', '#ffb43f'].map(hex => Color3.FromHexString(hex));
  return {
    update(seconds, current, quality) {
      if (disposed) return;
      time += seconds;
      const { child, dad, resident } = people;
      if (child && current.child) {
        posePerson(child, current.child.x, current.child.z, current.child.heading, current.child.moving, seconds, !placed.has('child'));
        placed.add('child');
      }
      if (dad && current.parent) {
        // Dad looks round for his son until he's back, then turns to him.
        const scanning = current.phase !== 'done' ? Math.sin(time * 0.7) * 0.6 : 0;
        const toChild = current.child && current.phase === 'done'
          ? Math.atan2(-(current.child.x - current.parent.x), -(current.child.z - current.parent.z)) : current.parent.heading + scanning;
        posePerson(dad, current.parent.x, current.parent.z, toChild, false, seconds, !placed.has('dad'));
        placed.add('dad');
      }
      if (resident && current.door) {
        // The resident opens the door once you've knocked.
        const shown = current.phase === 'talk' || current.phase === 'done';
        if (resident.holder.isEnabled() !== shown) resident.holder.setEnabled(shown);
        if (shown) posePerson(resident, current.door.x, current.door.z, current.door.heading, false, seconds, !placed.has('resident'));
        if (shown) placed.add('resident');
      }
      if (hazards) {
        // Hazards blink at 1.5 Hz until the driver pulls away (then the car leaves a few seconds later).
        const on = current.phase !== 'done' && Math.sin(time * Math.PI * 3) > 0;
        hazards.material.emissiveColor.set(on ? 1 : 0.18, on ? 0.64 : 0.1, on ? 0.1 : 0.02);
        if (current.phase === 'done' && carRoot) {
          // Pulls away along its lane and is gone after ~40 m.
          const rotation = carRoot.rotation.y;
          const speed = Math.min(9, 2 + time * 0.5);
          carRoot.position.x += Math.sin(rotation) * speed * seconds;
          carRoot.position.z += Math.cos(rotation) * speed * seconds;
          if (call.car && Math.hypot(carRoot.position.x - (CITY_ORIGIN.x + call.car.x), carRoot.position.z - (CITY_ORIGIN.z + call.car.z)) > 40) carRoot.setEnabled(false);
        }
      }
      if (party) {
        const loud = current.phase === 'travel' || current.phase === 'talk' ? 1 : 0.25;
        const beat = Math.pow(Math.max(0, Math.cos(time * Math.PI * 4)), 6);
        const colour = colours[Math.floor(time * 1.2) % colours.length];
        party.glowMaterial.emissiveColor.copyFrom(colour.scale(0.45 + 0.55 * beat * loud));
        // Fewer notes at lower adaptive quality; none once it's quiet.
        const count = loud < 1 ? 0 : quality.scale > 1.4 ? 2 : quality.scale > 1.15 ? 4 : party.notes.length;
        party.notes.forEach((note, i) => {
          const shown = i < count;
          if (note.isEnabled() !== shown) note.setEnabled(shown);
          if (!shown) return;
          const t = (time * 0.35 + i / party!.notes.length) % 1;
          note.position.set(Math.sin(i * 2.1 + t * 4) * 0.9, 4.8 + t * 3.2, 1.2);
          note.scaling.setAll(0.6 + t * 0.6);
          note.visibility = Math.sin(t * Math.PI);
        });
      }
    },
    dispose() {
      disposed = true;
      for (const person of Object.values(people)) person?.dispose();
      for (const dispose of disposers.splice(0)) dispose();
    },
  };
}
