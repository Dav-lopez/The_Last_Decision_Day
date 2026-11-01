import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS, STATION_IDS, nextStation, programAt, programLength, radioStep, radioStepSeconds, readRadioStation, tuneInStep, writeRadioStation } from '../src/world/audio/radio.mjs';
import { createGameAudio } from '../src/world/audio/director.mjs';
import { AUDIO_DEFAULTS } from '../src/world/audio/settings.mjs';

test('four original stations, each with two songs, a jingle and several DJ lines', () => {
  assert.equal(STATIONS.length, 4);
  assert.equal(new Set(STATIONS.map(s => s.name)).size, 4);
  for (const station of STATIONS) {
    assert.ok(station.songs.length >= 2 && station.lines.length >= 3 && station.motif.length >= 3);
    assert.ok(station.lines.every(line => line.length > 10 && line.length < 120), 'idents are short enough to speak over a jingle');
    assert.ok(radioStepSeconds(station.id) > .2 && radioStepSeconds(station.id) < .4);
  }
});

test('every step of every station is bounded note data the director can play', () => {
  for (const id of STATION_IDS) {
    const length = programLength(id);
    assert.ok(length > 300);
    for (let step = 0; step < length; step++) {
      const notes = radioStep(id, step, { intensity: step % 2 });
      assert.ok(notes.length <= 5, `${id}@${step}`);
      for (const n of notes) {
        assert.ok(Number.isFinite(n.frequency) && n.frequency > 20 && n.frequency < 2000, `${id}@${step} ${n.frequency}`);
        assert.ok(n.gain > 0 && n.gain <= .03 && n.duration > 0 && n.duration < 3 && typeof n.instrument === 'string');
      }
    }
  }
  assert.deepEqual(radioStep('nope', 0), []);
  assert.notDeepEqual(radioStep('maple', 40), radioStep('pulse', 40), 'stations sound different');
});

test('a program alternates songs and idents, rotating the DJ lines', () => {
  const id = 'downtown', length = programLength(id);
  const kinds = [], titles = new Set(), lines = new Set();
  for (let step = 0; step < length * 2; step++) {
    const now = programAt(id, step);
    if (kinds.at(-1) !== now.kind) kinds.push(now.kind);
    if (now.kind === 'song') titles.add(now.title); else lines.add(now.line);
  }
  assert.deepEqual(kinds.slice(0, 4), ['song', 'ident', 'song', 'ident']);
  assert.equal(titles.size, 2);
  assert.ok(lines.size >= 3, 'idents vary over time');
  assert.deepEqual(programAt(id, length + 5).title, programAt(id, 5).title, 'program loops');
  assert.equal(programAt(id, -1).kind, 'ident', 'negative steps wrap');
  const ident = programAt(id, 24 * 8);
  assert.equal(ident.kind, 'ident'); assert.equal(ident.next, STATIONS[2].songs[1].title);
});

test('stations play on while you are away: tuning in lands mid-program', () => {
  const step = tuneInStep('maple', 1_700_000_000_000);
  assert.ok(step >= 0 && step < programLength('maple'));
  const later = tuneInStep('maple', 1_700_000_000_000 + 10_000);
  const moved = (later - step + programLength('maple')) % programLength('maple');
  assert.ok(Math.abs(moved - 10 / radioStepSeconds('maple')) <= 1, `moved ${moved}`);
  assert.equal(tuneInStep('none', 5), 0);
});

test('the dial cycles through every station and off, both ways, and remembers the choice', () => {
  const seen = []; let at = null;
  for (let i = 0; i < 5; i++) { at = nextStation(at, 1); seen.push(at); }
  assert.deepEqual(seen, ['maple', 'lowtide', 'downtown', 'pulse', null]);
  assert.equal(nextStation(null, -1), 'pulse');
  assert.equal(nextStation('maple', -1), null);
  assert.equal(nextStation('bogus', 1), 'maple');
  const store = new Map(); const storage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readRadioStation(storage), 'maple', 'first drive: radio on');
  writeRadioStation(null, storage); assert.equal(readRadioStation(storage), null);
  writeRadioStation('pulse', storage); assert.equal(readRadioStation(storage), 'pulse');
  store.set('tld-radio-v1', 'gone'); assert.equal(readRadioStation(storage), 'maple');
  assert.equal(readRadioStation({ getItem() { throw new Error('blocked'); } }), 'maple');
});

/** A minimal clocked Web Audio double (see game-audio.test.mjs). */
function audioContext() {
  const context = { currentTime: 0, state: 'suspended', sampleRate: 8000, sources: [], destination: {} };
  const param = () => ({ value: 0, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; } });
  const node = () => ({ connect() {}, disconnect() {} });
  const source = kind => { const n = { ...node(), kind, frequency: param(), detune: param(), start() {}, stop() {} }; context.sources.push(n); return n; };
  context.createGain = () => ({ ...node(), gain: param() });
  context.createOscillator = () => source('oscillator'); context.createBufferSource = () => source('buffer');
  context.createBiquadFilter = () => ({ ...node(), frequency: param() });
  context.createDynamicsCompressor = () => ({ ...node(), threshold: param(), ratio: param(), attack: param(), release: param() });
  context.createBuffer = (_c, size) => ({ getChannelData: () => new Float32Array(size) });
  context.resume = async () => { context.state = 'running'; };
  context.suspend = async () => { context.state = 'suspended'; };
  context.close = async () => { context.state = 'closed'; };
  return context;
}

test('the radio replaces place music only while driving, and the DJ speaks idents', async () => {
  const spoken = []; let cancels = 0;
  const speech = { speak: (line, voice) => spoken.push({ line, voice }), cancel: () => { cancels++; } };
  const context = audioContext();
  const audio = createGameAudio({ createContext: () => context, speech });
  audio.setSettings({ ...AUDIO_DEFAULTS, effects: 0, ambience: 0, music: .5 });
  await audio.enable();
  await audio.setRadio('pulse');
  const realNow = Date.now;
  try {
    // Park the wall clock just before Pulse's first ident, then drive through it.
    const identStep = 24 * 8;
    Date.now = () => (identStep - 1) * radioStepSeconds('pulse') * 1000 + 1;
    audio.update({ location: 'street', drivingSpeed: 5 });
    for (let i = 0; i < 40; i++) { context.currentTime += radioStepSeconds('pulse'); audio.update({ location: 'street', drivingSpeed: 5 }); }
  } finally { Date.now = realNow; }
  assert.equal(spoken.length, 1, 'one ident per break');
  assert.match(spoken[0].line, /Pulse/);
  assert.ok(spoken[0].voice.volume > 0 && spoken[0].voice.volume <= 1);
  const before = cancels;
  audio.update({ location: 'street', drivingSpeed: null });
  assert.ok(cancels > before, 'getting out of the car silences the DJ');
  audio.setRadio('nonsense');
  audio.update({ location: 'street', drivingSpeed: 3 });
  audio.setSettings({ ...AUDIO_DEFAULTS, muted: true });
  assert.ok(cancels > before + 1, 'mute silences speech');
  audio.dispose();
});

test('the DJ stays quiet with music at zero and during dialogue', async () => {
  const spoken = [];
  const context = audioContext();
  const audio = createGameAudio({ createContext: () => context, speech: { speak: line => spoken.push(line), cancel() {} } });
  audio.setSettings({ ...AUDIO_DEFAULTS, music: .5 });
  await audio.enable(); await audio.setRadio('maple');
  const realNow = Date.now;
  try {
    Date.now = () => (24 * 8 - 1) * radioStepSeconds('maple') * 1000 + 1;
    for (let i = 0; i < 30; i++) { context.currentTime += radioStepSeconds('maple'); audio.update({ drivingSpeed: 4, reading: true }); }
  } finally { Date.now = realNow; }
  assert.equal(spoken.length, 0);
  audio.dispose();
});

test('the songs stay out of the start-up download: only the dial is imported eagerly', async () => {
  const { readFile } = await import('node:fs/promises');
  const director = await readFile(new URL('../src/world/audio/director.mjs', import.meta.url), 'utf8');
  const scene = await readFile(new URL('../src/world/WorldScene.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(director, /^import .*'\.\/radio\.mjs'/m);
  assert.doesNotMatch(scene, /^import .*audio\/(radio\.mjs|RadioHud)'/m);
  assert.match(scene, /lazy\(\(\) => import\('\.\/audio\/RadioHud'\)/);
});
