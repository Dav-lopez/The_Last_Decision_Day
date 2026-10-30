import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAST, CHAPTERS, DECISIONS, NEW_STORY, STORY_EVENTS, advanceStory, currentStep, markSceneSeen, normalizeStory, pendingScene, readStory,
  storyComplete, writeStory,
} from '../src/world/storyChapters.mjs';
import { NPC_DIALOGUES, chooseNpcReply, newNpcRelations } from '../src/world/npcConversations.mjs';

test('every step has an objective, completes on real world events, and every line has a known speaker', () => {
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.title && chapter.steps.length > 0);
    for (const step of chapter.steps) {
      assert.ok(step.objective.length > 5, `${step.id} objective`);
      for (const event of step.completeOn) assert.ok(STORY_EVENTS.includes(event), `${step.id}: ${event}`);
      const scenes = step.scene === null ? [] : Array.isArray(step.scene) ? [step.scene] : Object.values(step.scene);
      if (!Array.isArray(step.scene) && step.scene) assert.ok(step.scene.default, `${step.id} has a default scene`);
      for (const line of scenes.flat()) {
        assert.ok(line.speaker in CAST, `${step.id}: ${line.speaker}`);
        assert.ok(line.text.length > 0 && line.text.length < 200, 'lines fit the dialogue box');
      }
    }
  }
  const ids = CHAPTERS.flatMap(chapter => chapter.steps.map(step => `${chapter.id}/${step.id}`));
  assert.equal(new Set(ids).size, ids.length);
});

test('chapter one plays from arrival to the note in order, one scene per step', () => {
  let state = { ...NEW_STORY };
  const order = ['reached-school', 'entered-school', 'attended-class', 'talked-teacher', 'entered-home', 'ate', 'slept'];
  const objectives = [];
  for (const event of order) {
    assert.ok(pendingScene(state), `a scene opens step ${currentStep(state).step.id}`);
    state = markSceneSeen(state);
    assert.equal(pendingScene(state), null, 'and plays once');
    objectives.push(currentStep(state).step.objective);
    // Out-of-order events do nothing.
    const ignored = advanceStory(state, 'drove');
    assert.deepEqual(ignored.state, state);
    assert.equal(ignored.completed, null);
    const result = advanceStory(state, event);
    assert.ok(result.completed, `${event} completes the step`);
    state = result.state;
    if (event === 'slept') assert.equal(result.chapterDone?.id, 'new-in-town');
  }
  assert.equal(objectives.length, 7);
  assert.deepEqual(state, { chapter: 1, step: 0, seen: false }, 'chapter two begins');
  assert.equal(currentStep(state).chapter.id, 'the-note');
});

test('the mystery-note chapter advances only from real classmate conversations', () => {
  let state = { chapter: 1, step: 0, seen: true };
  assert.equal(advanceStory(state, 'talked-jordan').completed, null);
  let result = advanceStory(state, 'talked-maya');
  assert.equal(result.completed?.id, 'ask-around');
  state = result.state;
  assert.equal(currentStep(state).step.id, 'ask-jordan');
  result = advanceStory(state, 'talked-jordan');
  assert.equal(result.completed?.id, 'ask-jordan');
  state = result.state;
  result = advanceStory(state, 'talked-teacher');
  assert.equal(result.completed?.id, 'ask-rivera');
  assert.equal(result.chapterDone?.id, 'the-note');
  assert.equal(currentStep(result.state).chapter.id, 'follow-the-lead');
});

test('the finished story rests on its epilogue: no events move it, and it says so', () => {
  const last = { chapter: CHAPTERS.length - 1, step: CHAPTERS.at(-1).steps.length - 1, seen: true, decision: 'garden' };
  assert.equal(storyComplete(last), true);
  for (const event of STORY_EVENTS) {
    const result = advanceStory(last, event);
    assert.deepEqual(result.state, last);
    assert.equal(result.completed, null, `${event} does not re-complete the ending`);
  }
  assert.ok(/complete/i.test(currentStep(last).step.objective));
  assert.equal(storyComplete({ chapter: 0, step: 0, seen: false }), false);
});

/** Play from a state to the end using only events the world reports, with the given decision. */
function playThrough(state, decisionEvent) {
  const scenes = [];
  for (let guard = 0; guard < 60 && !storyComplete(state); guard++) {
    const scene = pendingScene(state);
    if (scene) { scenes.push(scene); state = markSceneSeen(state); }
    const { step } = currentStep(state);
    const event = step.completeOn.includes(decisionEvent) ? decisionEvent : step.completeOn[0];
    const result = advanceStory(state, event);
    assert.ok(result.completed, `${step.id} completes on ${event}`);
    state = result.state;
  }
  const finale = pendingScene(state);
  if (finale) scenes.push(finale);
  return { state, scenes };
}

test('chapters three to five solve the mystery and end on the decision you made', () => {
  const start = { chapter: 2, step: 0, seen: false };
  const endings = new Map();
  for (const [event, decision] of Object.entries(DECISIONS)) {
    const { state, scenes } = playThrough(start, event);
    assert.equal(storyComplete(state), true);
    assert.equal(state.decision, decision.id);
    assert.equal(currentStep(state).chapter.id, 'last-decision-day');
    const text = scenes.flat().map(line => line.text).join(' ');
    assert.ok(text.includes('A. Rivera'), 'the clue points to Ms. Rivera');
    assert.ok(text.includes('I left the note'), 'and she owns up');
    endings.set(decision.id, scenes.at(-1).map(line => line.text).join(' '));
  }
  assert.equal(new Set(endings.values()).size, 3, 'each decision has its own ending');
  // The decision is saved and survives a reload, but junk is dropped.
  assert.equal(normalizeStory({ chapter: 4, step: 3, seen: true, decision: 'crossing' }).decision, 'crossing');
  assert.equal('decision' in normalizeStory({ chapter: 4, step: 3, seen: true, decision: 'casino' }), false);
});

test('the new chapters only move on events the world really reports', () => {
  const reported = new Set([
    'game-start', 'left-home', 'reached-school', 'entered-school', 'attended-class', 'talked-teacher', 'ate', 'entered-home', 'slept',
    'drove', 'went-downtown', 'joined-career', 'worked-shift', 'played-match',
    ...Object.keys(NPC_DIALOGUES).map(id => chooseNpcReply(newNpcRelations(), id, NPC_DIALOGUES[id].choices[0].id).event),
  ]);
  for (const chapter of CHAPTERS) for (const step of chapter.steps) {
    for (const event of [...step.completeOn, ...step.skipOn]) assert.ok(reported.has(event), `${step.id}: nothing reports ${event}`);
  }
  // Talking to the wrong neighbour, or doing things out of order, does nothing.
  const askRuth = { chapter: 2, step: 1, seen: true };
  assert.equal(advanceStory(askRuth, 'talked-okafor').completed, null);
  assert.equal(advanceStory(askRuth, 'talked-ruth').completed?.id, 'ask-ruth');
  const decide = { chapter: 4, step: 1, seen: true };
  assert.equal(advanceStory(decide, 'talked-elena').completed, null, 'Elena is not one of the three choices');
  assert.equal(advanceStory(decide, 'talked-marcus').state.decision, 'crossing');
});

test('story progress is saved per character and survives bad data', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.deepEqual(readStory('a', storage), { ...NEW_STORY });
  writeStory('a', { chapter: 0, step: 3, seen: true }, storage);
  assert.deepEqual(readStory('a', storage), { chapter: 0, step: 3, seen: true });
  assert.deepEqual(readStory('b', storage), { ...NEW_STORY });
  assert.deepEqual(normalizeStory({ chapter: 99, step: -4, seen: 'yes' }), { chapter: 0, step: 0, seen: false });
  store.set('tld-story-v1:a', '{broken');
  assert.deepEqual(readStory('a', storage), { ...NEW_STORY });
});

test('dinner is optional: going straight to bed skips it and still completes the chapter', () => {
  let state = { chapter: 0, step: CHAPTERS[0].steps.findIndex(step => step.id === 'dinner'), seen: true };
  const result = advanceStory(state, 'slept');
  assert.equal(result.completed?.id, 'sleep');
  assert.equal(result.chapterDone?.id, 'new-in-town');
  assert.deepEqual(result.state, { chapter: 1, step: 0, seen: false });
});
