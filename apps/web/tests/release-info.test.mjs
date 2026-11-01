import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GAME_TITLE, RELEASE_NOTES, LATEST_RELEASE, unseenNotes, readLastSeen, markSeen,
  PRIVACY_POINTS, isStaleBuildError, describeCrash,
} from '../src/releaseInfo.mjs';

const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) }; };
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('release notes are newest first with unique ids and short items', () => {
  const ids = RELEASE_NOTES.map(n => n.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort().reverse(), ids);
  assert.equal(LATEST_RELEASE, ids[0]);
  for (const note of RELEASE_NOTES) {
    assert.ok(note.title && note.items.length > 0, note.id);
    for (const item of note.items) assert.ok(item.length <= 140, item);
  }
});

test('a first visit shows every note; later visits only the newer ones', () => {
  assert.equal(unseenNotes(null).length, RELEASE_NOTES.length);
  assert.equal(unseenNotes(LATEST_RELEASE).length, 0);
  const older = RELEASE_NOTES[RELEASE_NOTES.length - 1].id;
  assert.deepEqual(unseenNotes(older).map(n => n.id), RELEASE_NOTES.slice(0, -1).map(n => n.id));
  // A same-day second update sorts after the first.
  assert.deepEqual(unseenNotes('2026-10-31', [{ id: '2026-10-31b', title: '', items: [] }, { id: '2026-10-31', title: '', items: [] }]).map(n => n.id), ['2026-10-31b']);
});

test('the last-seen note is remembered, and blocked storage never throws', () => {
  const storage = memory();
  assert.equal(readLastSeen(storage), null);
  assert.equal(markSeen(storage), true);
  assert.equal(readLastSeen(storage), LATEST_RELEASE);
  assert.equal(readLastSeen(broken), null);
  assert.equal(markSeen(broken), false);
  assert.equal(readLastSeen(undefined), null);
});

test('the privacy note covers guests, accounts, rooms, voice and tracking', () => {
  const text = PRIVACY_POINTS.join(' ');
  for (const word of [/only in this browser/, /date of birth/, /chat/, /voice/i, /STUN/, /No ads/, /tracking/]) assert.match(text, word);
});

test('stale-build errors get an update message; other crashes a short, safe summary', () => {
  for (const message of ['Failed to fetch dynamically imported module: https://x/assets/WorldScene-abc.js',
    'Importing a module script failed.', 'error loading dynamically imported module']) {
    assert.ok(isStaleBuildError(new Error(message)), message);
    assert.match(describeCrash(new Error(message)).title, /updated/);
  }
  assert.equal(isStaleBuildError(new Error('x is undefined')), false);
  const crash = describeCrash(new Error('boom\n   at line 1'.repeat(40)));
  assert.match(crash.title, /went wrong/);
  assert.ok(crash.detail.length <= 160 && !crash.detail.includes('\n'));
  assert.equal(describeCrash(undefined).detail, undefined);
});

test('the page has a title, icons, a share image and a manifest that exist', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, new RegExp(`<title>${GAME_TITLE}</title>`));
  for (const tag of [/rel="icon"/, /rel="apple-touch-icon"/, /rel="manifest"/, /property="og:image"/, /name="description"/, /name="theme-color"/]) assert.match(html, tag);
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.name, GAME_TITLE);
  const files = [...html.matchAll(/(?:href|content)="(?:https:\/\/[^/"]+)?\/([\w.-]+\.(?:svg|png|webmanifest))"/g)].map(m => m[1])
    .concat(manifest.icons.map(icon => icon.src.replace(/^\//, '')));
  assert.ok(files.length >= 5, files.join());
  for (const file of files) assert.ok(readFileSync(new URL(`../public/${file}`, import.meta.url)).length > 100, file);
});
