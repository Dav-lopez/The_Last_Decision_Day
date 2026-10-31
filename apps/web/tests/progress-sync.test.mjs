import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProgress, chooseNewestProgress, collectProgress, fromServerProgress, markProgressChanged, normalizeProgress,
  readProgressChangedAt, toServerProgress } from '../src/world/progressSync.mjs';
import { readCareer, writeCareer } from '../src/world/careers.mjs';
import { readStory, writeStory } from '../src/world/storyChapters.mjs';
import { readNpcRelations } from '../src/world/npcConversations.mjs';

const memory = () => {
  const items = new Map();
  return { getItem: k => items.has(k) ? items.get(k) : null, setItem: (k, v) => items.set(k, String(v)), items };
};

test('a fresh browser has default progress that has never changed', () => {
  const storage = memory();
  const progress = collectProgress('c1', storage);
  assert.equal(progress.savedAt, 0);
  assert.deepEqual(progress.story, { chapter: 0, step: 0, seen: false });
  assert.equal(progress.career.career, null);
  assert.equal(progress.relations.version, 1);
});

test('collect gathers story, career with training record, and relationships', () => {
  const storage = memory();
  writeStory('c1', { chapter: 1, step: 1, seen: true }, storage);
  writeCareer('c1', { career: 'police', shifts: 3, money: 120, lastShiftAt: 900, training: { best: { police: 0.8 }, lastPaidAt: 500 } }, storage);
  markProgressChanged('c1', 1_700_000_000_000, storage);
  const progress = collectProgress('c1', storage);
  assert.equal(progress.savedAt, 1_700_000_000_000);
  assert.equal(progress.story.chapter, 1);
  assert.equal(progress.career.shifts, 3);
  assert.equal(progress.career.training.best.police, 0.8);
});

test('newest wins: account copy is adopted when newer or equal, browser copy uploaded when newer', () => {
  const older = { savedAt: 1000, story: { chapter: 0, step: 1, seen: true } };
  const newer = { savedAt: 2000, story: { chapter: 1, step: 0, seen: false } };
  const accountNewer = chooseNewestProgress(older, newer);
  assert.equal(accountNewer.source, 'account');
  assert.equal(accountNewer.upload, false);
  assert.equal(accountNewer.progress.story.chapter, 1);
  const browserNewer = chooseNewestProgress(newer, older);
  assert.equal(browserNewer.source, 'browser');
  assert.equal(browserNewer.upload, true);
  assert.equal(chooseNewestProgress(newer, newer).source, 'account');
});

test('an empty account keeps the browser copy, uploading it only once it has changed', () => {
  assert.deepEqual(
    [chooseNewestProgress({ savedAt: 0 }, null).upload, chooseNewestProgress({ savedAt: 5 }, null).upload],
    [false, true]);
});

test('apply writes every part back to the browser saves', () => {
  const storage = memory();
  applyProgress('c2', { savedAt: 4242, story: { chapter: 2, step: 0, seen: true },
    career: { career: 'firefighter', shifts: 1, money: 60, lastShiftAt: null },
    relations: { version: 1, people: { maya: { trust: 3, conversations: 2, lastChoice: null } } } }, storage);
  assert.equal(readStory('c2', storage).chapter, 2);
  assert.equal(readCareer('c2', storage).career, 'firefighter');
  const relations = readNpcRelations('c2', storage);
  const first = Object.keys(relations.people)[0];
  assert.equal(typeof relations.people[first].trust, 'number');
  assert.equal(readProgressChangedAt('c2', storage), 4242);
});

test('server round trip keeps the document and rejects junk', () => {
  const progress = normalizeProgress({ savedAt: 77, story: { chapter: 1, step: 0, seen: false } });
  const body = toServerProgress(progress);
  assert.equal(body.savedAt, 77);
  assert.equal(body.data.story.chapter, 1);
  assert.deepEqual(fromServerProgress({ saved: true, ...body }), progress);
  assert.equal(fromServerProgress({ saved: false, savedAt: 0, data: null }), null);
  assert.equal(fromServerProgress(null), null);
  const junk = normalizeProgress({ savedAt: -5, story: { chapter: 99 }, career: { career: 'pirate', money: -3 } });
  assert.equal(junk.savedAt, 0);
  assert.equal(junk.story.chapter, 0);
  assert.equal(junk.career.career, null);
  assert.equal(junk.career.money, 0);
});
