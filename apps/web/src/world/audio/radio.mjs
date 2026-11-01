/**
 * Car radio: four original procedural stations, written for this game (no
 * samples, no third-party music, all station names, songs and bands invented).
 *
 *  - Maple 98.1     sunny indie pop
 *  - Low Tide 88.4  lo-fi beats to drive to
 *  - Downtown 101.3 late-night jazz
 *  - Pulse 94.7     synthwave
 *
 * Each station loops a program: song, station ident, song, ident. Like a real
 * station it keeps playing while you're out of the car: tuning in lands you
 * wherever the program is now (tuneInStep), not at the start.
 *
 * radioStep(station, step, mood) returns at most 5 notes for one eighth-note
 * step, in the same { frequency, duration, gain, instrument } shape as the
 * score, so the audio director plays them on the music bus.
 */
import { STATION_IDS } from './radioDial.mjs';

export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

const SONG_BARS = 24;
const IDENT_BARS = 3;
const STEPS_PER_BAR = 8;

export const STATIONS = Object.freeze([
  {
    id: 'maple', name: 'Maple 98.1', short: 'Maple', genre: 'Indie pop', bpm: 104,
    motif: [{ at: 0, n: 72 }, { at: 1, n: 76 }, { at: 2, n: 79 }, { at: 4, n: 84 }], motifInstrument: 'mallet',
    lines: [
      "You're cruising with Maple 98.1, the sound of the suburbs.",
      'Maple 98.1. Windows down, volume up, eyes on the road.',
      "It's a beautiful day on Maple Street. Here's another one for you.",
      'Maple 98.1. Every song sounds better on the drive home.',
    ],
    songs: [
      { title: 'Porch Light Summer', artist: 'The Paper Kites Club', root: 55, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
        melody: [[12, null, 14, 16, null, 16, 14, 12, 11, null, 12, 14, null, null, 7, null], [16, null, 19, 21, 19, 16, null, 14, 12, null, 14, 16, null, 14, 12, null]],
        comp: 'pluck', lead: 'lead', beat: 'pop' },
      { title: 'Bike to the Lake', artist: 'Wendy & the Weekdays', root: 57, chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]],
        melody: [[16, 16, null, 14, 12, null, 9, null, 12, null, 14, null, 16, 19, null, null], [21, null, 19, null, 16, 14, 12, null, 14, null, 12, 9, null, 7, null, null]],
        comp: 'keys', lead: 'pluck', beat: 'pop' },
    ],
  },
  {
    id: 'lowtide', name: 'Low Tide 88.4', short: 'Low Tide', genre: 'Lo-fi beats', bpm: 78,
    motif: [{ at: 0, n: 64 }, { at: 2, n: 67 }, { at: 3, n: 71 }, { at: 6, n: 69 }], motifInstrument: 'keys',
    lines: [
      'Low Tide, eighty-eight point four. Breathe out. Take the long way.',
      'You found Low Tide. Beats for homework, buses and red lights.',
      'Low Tide 88.4. No rush. The road will wait.',
      "This is Low Tide. Whatever you decide today, it's going to be okay.",
    ],
    songs: [
      { title: 'Rainy Homework', artist: 'sleepy.static', root: 50, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]],
        melody: [[16, null, null, 14, 12, null, 11, null, 9, null, null, 11, 12, null, null, null], [19, null, 17, null, 16, null, 14, null, 12, null, 11, null, 9, null, null, null]],
        comp: 'keys', lead: 'mallet', beat: 'lofi' },
      { title: 'Bus Window', artist: 'Mono Lantern', root: 48, chords: [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]],
        melody: [[14, null, 12, null, 9, null, null, null, 12, null, 14, null, 16, null, null, null], [21, null, null, 19, 16, null, null, 14, 12, null, null, 9, 7, null, null, null]],
        comp: 'pad', lead: 'keys', beat: 'lofi' },
    ],
  },
  {
    id: 'downtown', name: 'Downtown 101.3', short: 'Downtown', genre: 'Late-night jazz', bpm: 96,
    motif: [{ at: 0, n: 67 }, { at: 1, n: 70 }, { at: 2, n: 74 }, { at: 3, n: 77 }, { at: 5, n: 76 }], motifInstrument: 'brass',
    lines: [
      'Downtown 101.3. Smooth sounds for city streets.',
      "You're tuned to Downtown, one-oh-one point three. Mind the lights on Fifth.",
      'Downtown 101.3, where the night shift and the night owls meet.',
      'Downtown. Cool jazz, warm city, all night long.',
    ],
    songs: [
      { title: 'Fifth Street Stroll', artist: 'The Blue Hour Trio', root: 50, chords: [[2, 5, 9, 12, 16], [7, 11, 14, 17, 21], [0, 4, 7, 11, 14], [9, 12, 16, 19, 22]],
        melody: [[19, null, 21, 19, 16, null, 14, null, 12, 14, 16, null, 19, null, 17, null], [24, null, 22, 21, 19, null, 17, 16, 14, null, 12, null, 11, null, 12, null]],
        comp: 'keys', lead: 'brass', beat: 'swing' },
      { title: 'Late Shift Blue', artist: 'Marisol Avenue', root: 46, chords: [[0, 4, 7, 10], [5, 9, 12, 15], [0, 4, 7, 10], [7, 11, 14, 17]],
        melody: [[12, null, 15, 16, null, 19, null, null, 15, null, 12, null, 10, null, 12, null], [19, 22, null, 19, 17, null, 15, null, 16, null, 12, null, 10, 12, null, null]],
        comp: 'keys', lead: 'lead', beat: 'swing' },
    ],
  },
  {
    id: 'pulse', name: 'Pulse 94.7', short: 'Pulse', genre: 'Synthwave', bpm: 116,
    motif: [{ at: 0, n: 69 }, { at: 1, n: 69 }, { at: 2, n: 76 }, { at: 4, n: 74 }, { at: 6, n: 81 }], motifInstrument: 'lead',
    lines: [
      'Pulse 94.7. Neon nights and open roads.',
      "Feel that? That's the Pulse. Ninety-four point seven.",
      'Pulse 94.7. The future called. It wants you to drive safe.',
      "You're riding the Pulse. Next track, coming up fast.",
    ],
    songs: [
      { title: 'Neon Overpass', artist: 'Chrome Valley', root: 45, chords: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]],
        melody: [[12, null, 15, null, 19, null, 17, 15, 12, null, 10, null, 12, null, null, null], [24, null, 22, null, 19, null, 17, null, 15, 17, 19, null, 15, null, null, null]],
        comp: 'pad', lead: 'lead', beat: 'synth' },
      { title: 'Last Decision', artist: 'Night Drive Society', root: 47, chords: [[0, 3, 7], [5, 8, 12], [-2, 2, 5], [-5, -2, 2]],
        melody: [[15, 15, null, 14, 12, null, 10, null, 12, null, 14, 15, 17, null, null, null], [19, null, 20, 19, 17, null, 15, null, 14, null, 15, null, 12, null, null, null]],
        comp: 'pad', lead: 'brass', beat: 'synth' },
    ],
  },
]);

export { STATION_IDS, nextStation, readRadioStation, writeRadioStation } from './radioDial.mjs';
export const stationById = id => STATIONS.find(station => station.id === id) ?? null;

/** Seconds per eighth note on a station. */
export const radioStepSeconds = id => 60 / (stationById(id)?.bpm ?? 100) / 2;

const songSteps = SONG_BARS * STEPS_PER_BAR;
const identSteps = IDENT_BARS * STEPS_PER_BAR;
/** One loop of a station: each song followed by an ident. */
export const programLength = id => {
  const station = stationById(id);
  return station ? station.songs.length * (songSteps + identSteps) : 0;
};

/**
 * What a station is playing at a step: a song (title, artist, songStep) or an
 * ident (the DJ line to say). Steps wrap around the program.
 */
export function programAt(id, step) {
  const station = stationById(id);
  if (!station || !Number.isFinite(step)) return null;
  const total = programLength(id);
  const at = ((Math.floor(step) % total) + total) % total;
  const block = songSteps + identSteps;
  const index = Math.floor(at / block), inBlock = at % block;
  const song = station.songs[index];
  if (inBlock < songSteps) return { kind: 'song', station: station.id, songIndex: index, title: song.title, artist: song.artist, songStep: inBlock, remaining: songSteps - inBlock };
  const loops = Math.floor(Math.floor(step) / total);
  const identIndex = (loops * station.songs.length + index) % station.lines.length;
  return { kind: 'ident', station: station.id, songIndex: index, identStep: inBlock - songSteps, line: station.lines[(identIndex + station.lines.length) % station.lines.length], next: station.songs[(index + 1) % station.songs.length].title };
}

/** Where a station's program is at a wall-clock time, so each station plays on while you're away. */
export function tuneInStep(id, nowMs) {
  const total = programLength(id);
  if (!total || !Number.isFinite(nowMs)) return 0;
  return Math.floor(nowMs / 1000 / radioStepSeconds(id)) % total;
}

const DRUM = { kick: { frequency: 58, duration: 0.22, gain: 0.03 }, snare: { frequency: 190, duration: 0.16, gain: 0.018 }, hat: { frequency: 1800, duration: 0.05, gain: 0.008 } };
const BEATS = {
  pop: s => [(s % 8 === 0 || s % 8 === 3) && 'kick', s % 8 === 4 && 'snare', s % 2 === 0 && 'hat'],
  lofi: s => [(s % 8 === 0 || s % 8 === 5) && 'kick', s % 8 === 4 && 'snare', s % 4 === 2 && 'hat'],
  swing: s => [s % 8 === 0 && 'kick', (s % 8 === 3 || s % 8 === 6 || s % 8 === 7) && 'hat', s % 8 === 4 && 'snare'],
  synth: s => [s % 4 === 0 && 'kick', s % 8 === 4 && 'snare', s % 2 === 1 && 'hat'],
};

/**
 * Notes for one eighth-note step of a station's program. Songs build: a two-bar
 * intro without drums, verse (phrase A) and chorus (phrase B) in turn, and a
 * softer last two bars; idents play the station's jingle over a held chord.
 */
export function radioStep(id, step, mood = {}) {
  const now = programAt(id, step);
  if (!now) return [];
  const station = stationById(id);
  const intensity = Math.max(0, Math.min(1, Number(mood.intensity) || 0));
  const notes = [];
  if (now.kind === 'ident') {
    const song = station.songs[now.songIndex];
    if (now.identStep === 0) for (const interval of song.chords[0].slice(0, 3)) notes.push({ frequency: frequency(song.root + interval), duration: 2.4, gain: 0.01, instrument: 'pad' });
    for (const note of station.motif) if (note.at === now.identStep) notes.push({ frequency: frequency(note.n), duration: 0.6, gain: 0.022, instrument: station.motifInstrument });
    if (now.identStep === 8) notes.push({ frequency: frequency(station.motif.at(-1).n), duration: 1.2, gain: 0.014, instrument: 'mallet' });
    return notes.slice(0, 5);
  }
  const song = station.songs[now.songIndex];
  const s = now.songStep, bar = Math.floor(s / STEPS_PER_BAR), inBar = s % STEPS_PER_BAR;
  const intro = bar < 2, outro = bar >= SONG_BARS - 2;
  const level = outro ? 0.6 : 1;
  const chord = song.chords[bar % song.chords.length];
  if (inBar === 0) {
    for (const interval of chord.slice(0, 3)) notes.push({ frequency: frequency(song.root + interval), duration: 2.4, gain: 0.01 * level, instrument: song.comp === 'pluck' ? 'pad' : song.comp });
  } else if (song.comp === 'pluck' && inBar % 2 === 0) {
    notes.push({ frequency: frequency(song.root + chord[(inBar / 2) % chord.length] + 12), duration: 0.4, gain: 0.011 * level, instrument: 'pluck' });
  }
  const walking = song.beat === 'swing';
  if (inBar % 4 === 0 || (walking && inBar % 2 === 0) || (song.beat === 'synth' && inBar % 2 === 1)) {
    const tone = walking ? chord[(inBar / 2) % chord.length] - chord[0] : song.beat === 'synth' && inBar % 2 === 1 ? 12 : 0;
    notes.push({ frequency: frequency(song.root - 12 + chord[0] + tone), duration: 0.4, gain: 0.019 * level, instrument: 'bass' });
  }
  if (!intro) {
    const phrase = song.melody[Math.floor((bar - 2) / 4) % 2];
    const m = phrase[s % phrase.length];
    if (m !== null && notes.length < 5) notes.push({ frequency: frequency(song.root + m), duration: song.beat === 'lofi' ? 0.8 : 0.45, gain: 0.019 * level, instrument: song.lead });
    for (const hit of BEATS[song.beat](inBar)) {
      if (!hit || notes.length >= 5) continue;
      if (hit === 'hat' && outro) continue;
      notes.push({ ...DRUM[hit], gain: DRUM[hit].gain * level * (hit === 'kick' ? 0.85 + intensity * 0.15 : 1), instrument: hit });
    }
  }
  return notes.slice(0, 5);
}

if (STATIONS.some((station, index) => station.id !== STATION_IDS[index])) throw new Error('radio stations and dial disagree');
