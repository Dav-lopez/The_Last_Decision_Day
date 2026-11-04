import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOT_KINDS, SHOT_SECONDS, SPEAKER_RESIDENTS, orbitFrom, planShots, sceneCard, sceneMood, shotPose } from '../src/world/cutscene.mjs';
import { CAST, CHAPTERS, DECISIONS, NEW_STORY } from '../src/world/storyChapters.mjs';
import { NPC_DIALOGUES } from '../src/world/npcConversations.mjs';

const position = (pose) => ({
  x: pose.target.x + pose.radius * Math.cos(pose.alpha) * Math.sin(pose.beta),
  y: pose.target.y + pose.radius * Math.cos(pose.beta),
  z: pose.target.z + pose.radius * Math.sin(pose.alpha) * Math.sin(pose.beta),
});

test('speakers who live in the world map onto the residents the conversations use', () => {
  for (const [speaker, resident] of Object.entries(SPEAKER_RESIDENTS)) {
    assert.ok(speaker in CAST, speaker);
    const npc = Object.values(NPC_DIALOGUES).find(entry => entry.speaker === speaker);
    assert.equal(npc?.resident, resident, `${speaker} is ${resident}`);
  }
});

test('chapter openings and the endings are marked, with title cards', () => {
  assert.equal(sceneMood(NEW_STORY), 'opening');
  assert.deepEqual(sceneCard(NEW_STORY), { kicker: 'Chapter 1', title: 'New in Town' });
  assert.equal(sceneMood({ chapter: 0, step: 1, seen: false }), 'scene');
  assert.equal(sceneCard({ chapter: 0, step: 1, seen: false }), null);
  assert.deepEqual(sceneCard({ chapter: 1, step: 0, seen: false }), { kicker: 'Chapter 2', title: 'The Note' });
  const last = CHAPTERS.length - 1;
  const steps = CHAPTERS[last].steps;
  const dayAfter = steps.findIndex((step, index) => steps[index - 1]?.decide);
  assert.ok(dayAfter > 0);
  assert.equal(sceneMood({ chapter: last, step: dayAfter, seen: false, decision: 'garden' }), 'ending');
  const epilogue = steps.findIndex(step => step.final);
  for (const decision of Object.values(DECISIONS)) {
    assert.deepEqual(sceneCard({ chapter: last, step: epilogue, seen: false, decision: decision.id }), { kicker: 'Ending', title: decision.title });
  }
  assert.equal(sceneCard({ chapter: last, step: epilogue, seen: false }).title, 'The Last Decision Day');
});

test('every scene in the story gets one known shot per line', () => {
  for (const chapter of CHAPTERS) chapter.steps.forEach((step, index) => {
    const scenes = step.scene === null ? [] : Array.isArray(step.scene) ? [step.scene] : Object.values(step.scene);
    for (const lines of scenes) for (const near of [() => false, () => true]) {
      const shots = planShots(lines, { mood: sceneMood({ chapter: CHAPTERS.indexOf(chapter), step: index }), near });
      assert.equal(shots.length, lines.length);
      for (const shot of shots) assert.ok(SHOT_KINDS.includes(shot.kind), `${step.id}: ${shot.kind}`);
    }
  });
});

test('shots follow who speaks: openings establish, texts go to the phone, people present get over-the-shoulder', () => {
  const opening = planShots(CHAPTERS[0].steps[0].scene, { mood: 'opening' });
  assert.deepEqual(opening.map(shot => shot.kind), ['establish', 'narration', 'phone', 'close']);
  const lawn = planShots(CHAPTERS[0].steps[1].scene, { near: speaker => speaker === 'maya' || speaker === 'jordan' });
  assert.deepEqual(lawn.map(shot => [shot.kind, shot.subject]), [['speaker', 'maya'], ['speaker', 'jordan'], ['speaker', 'maya']]);
  // Nobody near: the player listens to a voice instead of the camera looking for someone who isn't there.
  assert.deepEqual(planShots(CHAPTERS[0].steps[1].scene).map(shot => shot.kind), ['listen', 'listen', 'listen']);
  // Answering someone present cuts to the reverse angle on the player; the same speaker twice holds the shot.
  const okafor = planShots(CHAPTERS[2].steps[3].scene, { near: speaker => speaker === 'okafor' });
  assert.deepEqual(okafor.map(shot => shot.kind), ['speaker', 'speaker', 'speaker', 'speaker', 'reverse']);
  assert.deepEqual(okafor.map(shot => shot.hold), [false, true, true, true, false]);
  assert.equal(okafor[4].subject, 'okafor');
  // The note from "A." is read like a text, close on your hands.
  assert.equal(planShots(CHAPTERS[1].steps[0].scene, { mood: 'opening' })[1].kind, 'phone');
  // Endings open on a crane shot and narrate from high up.
  const ending = planShots([{ speaker: 'okafor', text: 'a' }, { speaker: 'narrator', text: 'b' }], { mood: 'ending', near: () => true });
  assert.deepEqual(ending.map(shot => shot.kind), ['crane', 'crane']);
});

test('orbitFrom inverts the ArcRotateCamera position formula', () => {
  const camera = { x: 3, y: 2.5, z: -4 }, target = { x: 1, y: 1.4, z: 0.5 };
  const pose = orbitFrom(camera, target);
  const back = position(pose);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(back[axis] - camera[axis]) < 1e-9, axis);
});

test('over-the-shoulder shots sit behind the listener and look at the speaker', () => {
  const player = { x: 0, z: 0 }, other = { x: 0, z: 3 };
  const shot = { kind: 'speaker', speaker: 'maya', subject: 'maya', hold: false };
  for (const seconds of [0, SHOT_SECONDS / 2, SHOT_SECONDS * 2]) {
    const pose = shotPose(shot, { player, other }, seconds);
    const at = position(pose);
    assert.ok(at.z < 0, 'behind the player, away from Maya');
    assert.ok(Math.abs(at.x) > 0.3 && Math.abs(at.x) < 1, 'off one shoulder');
    assert.ok(pose.target.z > 2, 'looking at Maya');
    assert.ok(pose.radius > 3 && pose.radius < 5);
  }
  const reverse = shotPose({ kind: 'reverse', speaker: 'you', subject: 'maya', hold: false }, { player, other }, 1);
  assert.ok(position(reverse).z > 3, 'reverse angle from behind Maya');
  assert.ok(reverse.target.z < 1, 'onto the player');
  // The shoulders alternate so the eyelines meet across the cut.
  assert.ok(Math.sign(position(shotPose(shot, { player, other }, 1)).x) === Math.sign(position(reverse).x));
});

test('shots move slowly, hold after their move, keep the player in frame and stay still under reduced motion', () => {
  const ctx = { player: { x: 5, z: -2 }, baseAlpha: 1 };
  for (const kind of SHOT_KINDS) {
    const shot = { kind, speaker: 'narrator', subject: null, hold: false };
    for (const indoor of [false, true]) {
      const start = shotPose(shot, { ...ctx, indoor }, 0);
      const end = shotPose(shot, { ...ctx, indoor }, SHOT_SECONDS);
      const later = shotPose(shot, { ...ctx, indoor }, SHOT_SECONDS * 3);
      assert.deepEqual(later, end, `${kind} holds after its move`);
      for (const pose of [start, end]) {
        assert.ok(Math.hypot(pose.target.x - 5, pose.target.z + 2) < 0.01, `${kind} looks at the player`);
        assert.ok(pose.beta > 0.4 && pose.beta < 1.5, `${kind} beta ${pose.beta}`);
        assert.ok(pose.radius >= 2 && pose.radius <= (indoor ? 10 : 22), `${kind} radius ${pose.radius}`);
        assert.ok(position(pose).y > 1, `${kind} camera above the ground`);
      }
      if (indoor) assert.ok(start.radius <= 10 && end.radius <= 10, 'indoor shots stay under the cutaway');
      const calm = [0, 3, 30].map(seconds => shotPose(shot, { ...ctx, indoor, reduced: true }, seconds));
      assert.deepEqual(calm[0], calm[1]);
      assert.deepEqual(calm[1], calm[2]);
    }
  }
  const establish = { kind: 'establish', speaker: 'narrator', subject: null, hold: false };
  assert.ok(shotPose(establish, ctx, 0).radius > shotPose(establish, ctx, SHOT_SECONDS).radius, 'the establishing shot pushes in');
  const crane = { kind: 'crane', speaker: 'narrator', subject: null, hold: false };
  assert.ok(shotPose(crane, ctx, SHOT_SECONDS).beta < shotPose(crane, ctx, 0).beta, 'the crane rises');
  // Two-person shots with nobody to look at fall back to a shot of the player.
  const lonely = shotPose({ kind: 'speaker', speaker: 'maya', subject: 'maya', hold: false }, ctx, 1);
  assert.ok(Math.hypot(lonely.target.x - 5, lonely.target.z + 2) < 0.01);
});
