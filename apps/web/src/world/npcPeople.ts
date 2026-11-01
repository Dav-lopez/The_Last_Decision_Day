import { SceneLoader, TransformNode, type Material, type Scene, type ShadowGenerator } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { modelFor, normalizeLook } from './appearance.mjs';
import { dressCharacter } from './riggedAvatar';
import { bindActions, loadActionClips, type BoundAction } from './characterActions';
import { startAction, stepAction, type ActionState } from './actionMixer.mjs';
import { smoothHumanHeading, HUMAN_WALK_SPEED } from './humanMotion.mjs';
import { NEIGHBORS, type Neighbor, PERSON_RADIUS, carAhead, carComing, crossingPace, dodgeFrom, isOut, personHeading, routePose, shouldYield } from './npcLayout.mjs';
import { normalizeRiggedVisual } from './riggedPresentation.mjs';
import { initialNpcBlink, collectNpcEyelids, advanceNpcBlink } from './npcBlink.mjs';
import { collectNpcFaceTargets, initialNpcFace, advanceNpcFace, resetNpcFace } from './npcFace.mjs';
import { npcAttentionGaze } from './npcAttentionGaze.mjs';
import { npcEyeVergence } from './npcEyeVergence.mjs';
import { npcHeadAttentionTarget, stepNpcHeadAttention } from './npcHeadAttention.mjs';
import { createNpcHeadRig } from './npcHeadRig.mjs';
import { npcConversationHeadTarget, stepNpcConversationHead } from './npcConversationHead.mjs';
import { beginNpcSpeech, advanceNpcSpeech, isNpcSpeaking, npcShouldArticulate } from './npcSpeechTimeline.mjs';
import { createNpcFacialMaterials } from './npcFacialMaterials.mjs';
import { resolveNpcBody, resolveNpcClips } from './npcAnimationClips.mjs';

type CarFootprint = { x: number; z: number; rotation: number; speed?: number };
const DODGE_SPEED = 3.2;
export type Person = { x: number; z: number; radius: number };
export type Neighbors = {
  /** Advance everyone one frame; returns the people currently out, for collisions. */
  update: (seconds: number, minute: number, player: { x: number; z: number } | null, cars: ReadonlyArray<CarFootprint>) => Person[];
  /** The nearest neighbour to (x, z), within reach, flinches (bumped by a car). */
  react: (x: number, z: number) => void;
  /** Where each resident who is out stands right now (resident id → position). */
  positions: () => Record<string, { x: number; z: number }>;
  /** Highlight the speaking resident and apply the latest reply emotion; they stop and face the player. */
  setConversation: (residentId: string | null, mood?: 'neutral' | 'happy' | 'sad' | 'angry', line?: string) => void;
  dispose: () => void;
};

const CROSSFADE = 0.25;
/** People standing in a group chat among themselves (Talk replaces Idle); a `solo` stander just waits. */
const chatting = (npc: Neighbor) => npc.route.kind === 'stand' && !(npc as { solo?: boolean }).solo;

/**
 * Neighbours share the player's rigged human model: one download, one copy per
 * person with its own materials (skin, hair, outfit) and walk/idle clips.
 * Resolves null if the model can't load; the street simply stays empty.
 * `residents` defaults to Maple Street's; downtown passes its own regulars.
 */
export async function loadNeighbors(scene: Scene, shadows?: ShadowGenerator, residents: ReadonlyArray<Neighbor> = NEIGHBORS): Promise<Neighbors | null> {
  // One download per body type; each neighbour is a copy of theirs.
  const models = [...new Set(residents.map(npc => modelFor(npc.look)))];
  const loaded = await Promise.all(models.map(model => SceneLoader.LoadAssetContainerAsync('/models/', model, scene).catch(() => null)));
  const containers = new Map(models.map((model, i) => [model, loaded[i]]));
  if (scene.isDisposed || !resolveNpcBody('human.glb', containers)) {
    for (const c of loaded) c?.dispose();
    return null;
  }

  const people = residents.flatMap((npc, index) => {
    // Select clips from the body we actually instantiated, not the male model's
    // animation indices. Fall back to male when a requested body is unusable.
    const chosen = resolveNpcBody(modelFor(npc.look), containers);
    if (!chosen) { console.warn(`[npc] No usable character model for ${npc.id}`); return []; }
    const { model, container } = chosen;
    const entries = container.instantiateModelsToScene(name => `npc ${npc.id} ${name}`, true);
    const clips = resolveNpcClips(container.animationGroups, entries.animationGroups);
    if (!clips) {
      console.warn(`[npc] ${model} cloned without bound Idle/Walk clips for ${npc.id}`);
      entries.dispose();
      return [];
    }
    const { idle, walk } = clips;
    const holder = new TransformNode(`npc ${npc.id}`, scene);
    const visual = new TransformNode(`npc ${npc.id} visual`, scene);
    for (const node of entries.rootNodes) node.parent = visual;
    normalizeRiggedVisual(visual);
    visual.parent = holder;
    // Other animation groups remain stopped until explicitly bound as actions.
    entries.animationGroups.forEach(group => { if (group !== idle && group !== walk) group.stop(); });
    for (const group of [idle, walk]) { group.start(true); group.setWeightForAllAnimatables(group === idle ? 1 : 0); }
    walk.speedRatio = npc.speed / HUMAN_WALK_SPEED;
    const materials = [...new Set(holder.getChildMeshes().map(mesh => mesh.material).filter((m): m is Material => Boolean(m)))];
    dressCharacter(materials, holder.getChildMeshes(), normalizeLook(npc.look));
    // NPC copies own independent PBR facial materials, tear/sweat tracks and
    // complexion-aware blush, not just the existing mouth/eyelid morphs.
    const facialMaterials = createNpcFacialMaterials(materials, holder.getChildMeshes(), normalizeLook(npc.look), index);
    for (const mesh of holder.getChildMeshes()) { mesh.receiveShadows = true; shadows?.addShadowCaster(mesh, false); mesh.isPickable = false; }
    // Blink targets belong to each NPC's cloned meshes. Never animate the
    // original GLB container or the player's morph target manager.
    const eyelids = collectNpcEyelids(holder.getChildMeshes());
    const faceTargets = collectNpcFaceTargets(holder.getChildMeshes());
    const headRig = createNpcHeadRig(scene, holder);
    holder.setEnabled(false);
    const start = routePose(npc, 0);
    const reaction: { state: ActionState | null; clip: BoundAction | null } = { state: null, clip: null };
    const actions = new Map<string, BoundAction>();
    return [{ npc, model, entries, holder, idle, walk, reaction, actions, eyelids, blink: initialNpcBlink(index), faceTargets, face: initialNpcFace(index), facialMaterials, headRig, headYaw: 0, headPose: { pitch: 0, roll: 0 }, walked: 0, walkWeight: 0, heading: personHeading(start.dx, start.dz), visible: false, dodge: { x: 0, z: 0 }, dodgeTarget: { x: 0, z: 0 }, dodgeHold: 0 }];
  });

  // Action clips (a separate download): people standing together talk with their hands; anyone can flinch.
  const clipModels = [...new Set(people.map(person => person.model))];
  void Promise.all(clipModels.map(model => loadActionClips(scene, model))).then(clipSets => {
    if (scene.isDisposed) return;
    for (const person of people) {
      const clips = clipSets[clipModels.indexOf(person.model)];
      if (!clips) continue;
      const prefix = `npc ${person.npc.id} `;
      const bound = bindActions(clips, person.holder.getChildTransformNodes(false), `npc ${person.npc.id}`,
        name => name.startsWith(prefix) ? name.slice(prefix.length) : name);
      for (const [name, clip] of bound) person.actions.set(name, clip);
      const talk = bound.get('Talk');
      if (chatting(person.npc) && talk) {
        // Standing in a group: Talk replaces Idle (offset so the pair don't gesture in unison).
        person.idle.stop();
        person.idle = talk.group;
        talk.group.start(true, 1, talk.group.from, talk.group.to);
        talk.group.goToFrame(talk.group.from + (talk.group.to - talk.group.from) * ((person.npc.id.length % 5) / 5));
        if (!person.visible) talk.group.pause();
      }
    }
  });

  const startle = (person: (typeof people)[number]) => {
    const hit = person.actions.get('Hit');
    if (!hit || person.reaction.state) return;
    person.reaction = { state: startAction('Hit', hit.duration, false), clip: hit };
    hit.group.start(false, 1, hit.group.from, hit.group.to);
    hit.group.setWeightForAllAnimatables(0);
  };
  let speaker = beginNpcSpeech(null, 'neutral', '');
  const live: Record<string, { x: number; z: number }> = {};
  return {
    positions: () => live,
    setConversation(id, mood = 'neutral', line = '') { speaker = beginNpcSpeech(id, mood, line); },
    react(x, z) {
      let nearest: (typeof people)[number] | null = null;
      let best = 2.6;
      for (const person of people) {
        if (!person.visible) continue;
        const d = Math.hypot(person.holder.position.x - x, person.holder.position.z - z);
        if (d < best) { best = d; nearest = person; }
      }
      if (nearest) startle(nearest);
    },
    update(seconds, minute, player, cars) {
      const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.1)) : 0;
      // One shared clock for the selected resident, not one tick per NPC.
      speaker = advanceNpcSpeech(speaker, dt);
      const outside: Person[] = [];
      for (const person of people) {
        const out = isOut(person.npc, minute);
        if (out !== person.visible) {
          person.visible = out;
          person.holder.setEnabled(out);
          for (const group of [person.idle, person.walk]) out ? group.play(true) : group.pause();
          if (!out) {
            person.face = resetNpcFace(person.face, person.faceTargets);
            person.facialMaterials.reset();
            person.headYaw = 0;
            person.headPose = { pitch: 0, roll: 0 };
            person.headRig.setPose({ yaw: 0, pitch: 0, roll: 0 });
          }
        }
        if (!out) { delete live[person.npc.id]; continue; }
        // Advance only visible residents, avoiding hidden-scene morph updates.
        person.blink = advanceNpcBlink(person.blink, dt, person.eyelids);
        let pose = routePose(person.npc, person.walked);
        const obstacles = player ? [{ x: player.x, z: player.z, radius: 0.38 }] : [];
        // Give way to traffic at the kerb; once out on the road, hurry across.
        const talking = speaker.id === person.npc.id;
        const speaking = talking && isNpcSpeaking(speaker);
        const blocked = talking || !pose.moving || shouldYield(pose, obstacles) || carAhead(person.npc, person.walked, cars) || carComing(person.npc, person.walked, cars);
        const pace = blocked ? 1 : crossingPace(pose, cars);
        if (!blocked) {
          person.walked += person.npc.speed * pace * dt;
          pose = routePose(person.npc, person.walked);
        }
        person.walk.speedRatio = (person.npc.speed * pace) / HUMAN_WALK_SPEED;
        // A car about to reach them: step smartly out of its path, then drift back.
        const here = { x: pose.x + person.dodge.x, z: pose.z + person.dodge.z };
        const escape = dodgeFrom(here, cars);
        if (escape) {
          const fresh = person.dodgeHold <= 0 && Math.hypot(person.dodge.x, person.dodge.z) < 0.05;
          person.dodgeTarget = { x: person.dodge.x + escape.x, z: person.dodge.z + escape.z };
          person.dodgeHold = 1.4;
          if (fresh) startle(person);
        } else {
          person.dodgeHold = Math.max(0, person.dodgeHold - dt);
          if (person.dodgeHold <= 0) person.dodgeTarget = { x: 0, z: 0 };
        }
        const target = person.dodgeTarget;
        const gap = Math.hypot(target.x - person.dodge.x, target.z - person.dodge.z);
        if (gap > 1e-4) {
          const step = Math.min(1, (DODGE_SPEED * dt) / gap);
          person.dodge = { x: person.dodge.x + (target.x - person.dodge.x) * step, z: person.dodge.z + (target.z - person.dodge.z) * step };
        }
        pose = { ...pose, x: pose.x + person.dodge.x, z: pose.z + person.dodge.z };
        const weight = blocked ? 0 : 1;
        person.walkWeight += Math.sign(weight - person.walkWeight) * Math.min(Math.abs(weight - person.walkWeight), dt / CROSSFADE);
        const flinch = stepAction(person.reaction.state, dt);
        person.reaction.state = flinch.state;
        if (person.reaction.clip) {
          person.reaction.clip.group.setWeightForAllAnimatables(flinch.weight);
          if (!flinch.state) { person.reaction.clip.group.stop(); person.reaction.clip = null; }
        }
        person.walk.setWeightForAllAnimatables(person.walkWeight * (1 - flinch.weight));
        person.idle.setWeightForAllAnimatables((1 - person.walkWeight) * (1 - flinch.weight));
        // Each visible NPC owns their own morph targets and expression spring.
        // Conversations move jaw/lips, nearby stationary residents acknowledge
        // the player, and Hit actions briefly override those poses with surprise.
        person.face = advanceNpcFace(person.face, dt, person.faceTargets, {
          talking: npcShouldArticulate(speaker, person.npc.id, chatting(person.npc) && person.actions.has('Talk')),
          // A new displayed reply restarts lip motion; an open dialog does not
          // make the NPC mouth loop forever. Ambient Talk clips are unchanged.
          speechElapsed: speaking ? speaker.elapsed : undefined,
          speechDuration: speaking ? speaker.duration : 0,
          prosody: speaking ? speaker.prosody : 'none',
          speechCues: speaking ? speaker.cues : undefined,
          emotion: speaker.id === person.npc.id ? speaker.mood : 'neutral',
          nearby: Boolean(player && Math.hypot(player.x - pose.x, player.z - pose.z) < 2.5),
          moving: person.walkWeight > 0.15,
          flinch: flinch.weight,
          blink: person.blink,
          gaze: npcAttentionGaze(pose, player, person.heading),
          vergence: npcEyeVergence(pose, player, person.heading),
        });
        // Surface reactions use the same conversation mood and Hit response
        // as the facial morphs; hidden residents never run these updates.
        person.facialMaterials.update(dt, talking ? speaker.mood : 'neutral', person.walkWeight > 0.15, flinch.weight);
        // In conversation they turn to face you.
        const facing = talking && player && Math.hypot(player.x - pose.x, player.z - pose.z) > 0.05
          ? personHeading(player.x - pose.x, player.z - pose.z) : personHeading(pose.dx, pose.dz);
        person.heading = smoothHumanHeading(person.heading, facing, dt, 8);
        // A subtle Head-bone turn follows eye contact without rotating the
        // entire torso. Babylon applies it after authored clip evaluation.
        const headTarget = npcHeadAttentionTarget(pose, player, person.heading, {
          talking, moving: person.walkWeight > 0.15, flinch: flinch.weight,
        });
        person.headYaw = stepNpcHeadAttention(person.headYaw, headTarget, dt);
        // The selected speaker's finite line clock drives a gentle nod, while
        // mood retains a restrained pose after the line ends. Walking and Hit
        // actions suppress this overlay; authored clips remain underneath.
        const conversationPose = npcConversationHeadTarget({
          talking, speaking, elapsed: speaker.elapsed, duration: speaker.duration,
          mood: speaker.mood, moving: person.walkWeight > 0.15, flinch: flinch.weight,
        });
        person.headPose = stepNpcConversationHead(person.headPose, conversationPose, dt);
        person.headRig.setPose({ yaw: person.headYaw, ...person.headPose });
        person.holder.position.set(pose.x, 0, pose.z);
        person.holder.rotation.y = person.heading;
        outside.push({ x: pose.x, z: pose.z, radius: PERSON_RADIUS });
        live[person.npc.id] = { x: pose.x, z: pose.z };
      }
      return outside;
    },
    dispose() {
      for (const person of people) {
        for (const { group } of person.actions.values()) group.dispose();
        person.headRig.dispose();
        person.entries.dispose();
        person.holder.dispose();
      }
      for (const c of loaded) c?.dispose();
    },
  };
}
