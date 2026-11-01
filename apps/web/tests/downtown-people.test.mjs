import test from 'node:test';
import assert from 'node:assert/strict';
import { DOWNTOWN_REGULARS, KEEP_CLEAR, TALK_GAP, placeDowntownRegulars, standNear, downtownTalkSpot, regularIsOut } from '../src/world/downtownPeople.mjs';
import { NPC_DIALOGUES, nearbyNpc, beginNpcConversation, chooseNpcReply, newNpcRelations, normalizeNpcRelations } from '../src/world/npcConversations.mjs';
import { STORY_EVENTS } from '../src/world/storyChapters.mjs';
import { normalizeLook } from '../src/world/appearance.mjs';
import { personHeading } from '../src/world/npcLayout.mjs';

const PITCH = { x: 400, z: -300, halfLength: 20, halfWidth: 12 };
const STOP = { x: 100, z: 50, dx: 1, dz: 0, awayX: 0, awayZ: 1 };
const DOORS = new Map([['police', { x: 200, z: 0 }], ['firefighter', { x: 300, z: 10 }], ['soldier', { x: 250, z: 80 }]]);
const sites = (isFree = () => true) => ({ stop: STOP, pitch: PITCH, doors: DOORS, isFree });
const H = hours => hours * 60;

test('three regulars, each with a dialogue, a real look and daytime hours', () => {
  assert.equal(DOWNTOWN_REGULARS.length, 3);
  for (const regular of DOWNTOWN_REGULARS) {
    const dialogue = NPC_DIALOGUES[regular.npc];
    assert.ok(dialogue, regular.npc);
    assert.equal(dialogue.resident, regular.resident);
    assert.equal(dialogue.place, 'city');
    assert.ok(STORY_EVENTS.includes(`talked-${regular.npc}`), regular.npc);
    // Every look part is a real wardrobe option (normalizeLook keeps valid ids).
    const look = normalizeLook(regular.look);
    for (const [part, value] of Object.entries(regular.look)) assert.equal(look[part], value, `${regular.npc} ${part}`);
    assert.ok(regular.from >= H(6) && regular.until <= H(22) && regular.from < regular.until);
  }
});

test('regulars stand clear of the bus-stop, workplace and match prompts', () => {
  const placed = placeDowntownRegulars(sites());
  assert.equal(placed.length, 3);
  const by = Object.fromEntries(placed.map(p => [p.npc, p]));
  const fromStop = p => Math.hypot(p.x - STOP.x, p.z - STOP.z);
  assert.ok(fromStop(by.priya.route.at) > KEEP_CLEAR.stop && fromStop(by.priya.talk) > KEEP_CLEAR.stop);
  const door = DOORS.get('firefighter');
  for (const p of [by.brooks.route.at, by.brooks.talk]) assert.ok(Math.hypot(p.x - door.x, p.z - door.z) > KEEP_CLEAR.workplace);
  for (const [, other] of DOORS) assert.ok(Math.hypot(by.priya.talk.x - other.x, by.priya.talk.z - other.z) > KEEP_CLEAR.workplace);
  for (const p of [by.dee.route.at, by.dee.talk]) {
    const onPitch = Math.abs(p.x - PITCH.x) <= PITCH.halfLength + KEEP_CLEAR.pitchMargin && Math.abs(p.z - PITCH.z) <= PITCH.halfWidth + KEEP_CLEAR.pitchMargin;
    assert.equal(onPitch, false, 'coach is off the pitch');
  }
  // The coach watches the pitch; the others face their landmark.
  assert.ok(Math.abs(by.dee.route.facing - personHeading(0, -1)) < 1e-9);
  for (const p of placed) {
    assert.equal(p.route.kind, 'stand');
    assert.equal(p.solo, true);
    assert.ok(Math.abs(Math.hypot(p.talk.x - p.route.at.x, p.talk.z - p.route.at.z) - TALK_GAP) < 1e-9);
  }
});

test('placement steps around buildings and leaves out anyone without a landmark', () => {
  // A wall along the preferred side of the bus stop (x > 101): the guide goes elsewhere, never inside.
  const wall = (x) => x > 101;
  const placed = placeDowntownRegulars(sites((x, z) => !wall(x, z)));
  const priya = placed.find(p => p.npc === 'priya');
  assert.ok(priya);
  assert.ok(!wall(priya.route.at.x) && !wall(priya.talk.x));
  assert.equal(standNear({ x: 0, z: 0 }, { x: 1, z: 0 }, () => false), null);
  assert.equal(standNear(null, { x: 1, z: 0 }), null);
  const partial = placeDowntownRegulars({ stop: STOP, pitch: null, doors: new Map(), isFree: () => true });
  assert.deepEqual(partial.map(p => p.npc), ['priya']);
  assert.deepEqual(placeDowntownRegulars(), []);
});

test('downtown talk: in range while out, nowhere else, and through the normal conversation flow', () => {
  const placed = placeDowntownRegulars(sites());
  const live = Object.fromEntries(placed.map(p => [p.id, p.route.at]));
  for (const p of placed) {
    const minute = p.from + 30;
    assert.equal(nearbyNpc(p.talk, 'city', minute, live), p.npc);
    assert.equal(nearbyNpc(p.talk, 'street', minute, live), null, 'downtown people are not on Maple Street');
    assert.equal(nearbyNpc(p.talk, 'city', p.until + 5, live), null, 'gone home in the evening');
    assert.equal(nearbyNpc({ x: p.talk.x + 5, z: p.talk.z }, 'city', minute, live), null);
  }
  assert.equal(nearbyNpc(placed[0].talk, 'city', H(12), null), null, 'needs to be rendered to talk');
  const spot = downtownTalkSpot(placed, H(12), placed[2].talk);
  assert.deepEqual(spot, { id: placed[2].npc, x: placed[2].talk.x, z: placed[2].talk.z });
  assert.equal(downtownTalkSpot(placed, H(23)), null);
  assert.equal(regularIsOut(placed[0], Number.NaN), false);

  const started = beginNpcConversation('brooks', newNpcRelations());
  assert.equal(started.greeting, NPC_DIALOGUES.brooks.first);
  const reply = chooseNpcReply(newNpcRelations(), 'dee', 'tips');
  assert.equal(reply.event, 'talked-dee');
  assert.equal(reply.state.people.dee.trust, 2);
  // Saved relations from before this update gain the new people at zero.
  const old = normalizeNpcRelations({ version: 1, people: { maya: { trust: 3, conversations: 2, lastChoice: 'friend' } } });
  assert.equal(old.people.maya.trust, 3);
  assert.deepEqual(old.people.priya, { trust: 0, conversations: 0, lastChoice: null });
});
