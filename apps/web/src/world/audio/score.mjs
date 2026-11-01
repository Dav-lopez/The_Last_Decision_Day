/**
 * Original procedural score and sound cues, authored for this game (no
 * samples, no third-party music). Each place has its own little band:
 *
 *  - street: sunny acoustic pop (G major, plucked guitar, soft kit); dusk turns it to warm keys
 *  - home:   lo-fi bedroom keys (maj7 chords, brushed beat)
 *  - school: bright marimba groove (C major, claps)
 *  - city:   jazzy downtown lo-fi (ii–V–I with 9ths, walking bass, brushes)
 *  - pitch:  match-day drums with brass stabs over the crowd
 *
 * musicStep(location, step, mood) returns at most 5 notes for one eighth-note
 * step: { frequency, duration, gain, type, instrument }. Intensity (running,
 * driving, a match) adds drums and bass; evening thins and softens everything.
 */
export const LOCATIONS = Object.freeze(['street', 'home', 'school', 'city', 'pitch']);
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

const SONGS = Object.freeze({
  street: { bpm: 92, root: 55, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], melody: [12, null, 14, 16, null, 19, 16, 14, 12, null, 11, 9, 7, null, 9, 11], comp: 'pluck', lead: 'pluck', beat: 'soft' },
  home: { bpm: 72, root: 50, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]], melody: [16, null, null, 14, 12, null, 11, null, 9, null, null, 11, 12, null, 14, null], comp: 'keys', lead: 'keys', beat: 'lofi' },
  school: { bpm: 112, root: 60, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melody: [12, 16, 19, 16, 14, 17, 21, 17, 12, 16, 19, 24, 23, 19, 17, 14], comp: 'mallet', lead: 'mallet', beat: 'claps' },
  city: { bpm: 86, root: 50, chords: [[2, 5, 9, 12, 16], [7, 11, 14, 17, 21], [0, 4, 7, 11, 14], [9, 12, 16, 19, 23]], melody: [19, null, 21, 19, 16, null, 14, null, 12, 14, 16, null, 19, null, 17, null], comp: 'keys', lead: 'lead', beat: 'brush' },
  pitch: { bpm: 120, root: 53, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]], melody: [12, null, 12, null, 16, null, 19, null, 17, null, 16, null, 14, null, 12, null], comp: 'brass', lead: 'brass', beat: 'stadium' },
});
export const songFor = location => SONGS[location] ?? SONGS.street;
/** Seconds per eighth note for a place. */
export const beatSeconds = location => 60 / songFor(location).bpm / 2;
export const BEAT_SECONDS = beatSeconds('street');

const DRUMS = {
  soft: (s, hot) => [s % 8 === 0 && 'kick', s % 8 === 4 && 'snare', hot && s % 2 === 1 && 'hat'],
  lofi: (s, hot) => [(s % 8 === 0 || s % 8 === 5) && 'kick', s % 8 === 4 && 'snare', (hot || s % 4 === 2) && s % 2 === 0 && 'hat'],
  claps: (s, hot) => [s % 4 === 0 && 'kick', s % 8 === 4 && 'snare', s % 2 === 1 && 'hat', hot && s % 8 === 6 && 'snare'],
  brush: (s, hot) => [s % 8 === 0 && 'kick', (s % 8 === 3 || s % 8 === 6) && 'hat', s % 8 === 4 && 'snare', hot && s % 8 === 7 && 'kick'],
  stadium: (s) => [s % 2 === 0 && 'kick', s % 8 === 4 && 'snare', s % 8 === 6 && 'snare', s % 2 === 1 && 'hat'],
};
const DRUM_NOTE = { kick: { frequency: 58, duration: 0.22, gain: 0.03 }, snare: { frequency: 190, duration: 0.16, gain: 0.02 }, hat: { frequency: 1800, duration: 0.05, gain: 0.008 } };

export function musicStep(location, step, mood = {}) {
  if (!LOCATIONS.includes(location) || !Number.isInteger(step) || step < 0) return [];
  const song = songFor(location);
  const evening = Boolean(mood.evening);
  const intensity = Math.max(0, Math.min(1, Number(mood.intensity) || 0));
  const bar = Math.floor(step / 8);
  const chord = song.chords[bar % song.chords.length];
  const quiet = evening ? 0.75 : 1;
  const notes = [];
  // Chord: pad/keys on the bar, plucked arpeggio through it.
  if (step % 8 === 0) {
    for (const interval of chord.slice(0, location === 'pitch' ? 2 : 3)) {
      notes.push({ frequency: frequency(song.root + interval), duration: 2.6, gain: 0.011 * quiet, type: 'sine', instrument: evening && location === 'street' ? 'keys' : song.comp === 'pluck' ? 'pad' : song.comp });
    }
  } else if (song.comp === 'pluck' || song.comp === 'mallet') {
    const interval = chord[(step % 8) % chord.length] + (step % 2 ? 12 : 0);
    if (step % 2 === 0 || intensity > 0.3) notes.push({ frequency: frequency(song.root + interval), duration: 0.45, gain: 0.012 * quiet, type: 'triangle', instrument: song.comp });
  }
  // Bass on the beat (walking downtown).
  if (step % 4 === 0 || (location === 'city' && step % 2 === 0)) {
    const walk = location === 'city' ? [0, 2, 4, 5][(step / 2) % 4 | 0] : 0;
    notes.push({ frequency: frequency(song.root - 12 + chord[0] + (location === 'city' ? chord[walk % chord.length] - chord[0] : 0)), duration: 0.5, gain: 0.02 * quiet, type: 'triangle', instrument: 'bass' });
  }
  // Melody, sparser at dusk.
  const m = song.melody[step % song.melody.length];
  if (m !== null && notes.length < 5 && (!evening || step % 2 === 0)) {
    notes.push({ frequency: frequency(song.root + 12 + m - 12), duration: location === 'home' ? 0.9 : 0.5, gain: 0.02 * quiet, type: 'sine', instrument: song.lead });
  }
  // Drums when there's energy: always at the pitch, otherwise when moving fast or driving.
  const hot = intensity > 0.5;
  if (location === 'pitch' || intensity > 0.15 || location === 'city') {
    for (const hit of DRUMS[song.beat](step, hot)) {
      if (hit && notes.length < 5) notes.push({ ...DRUM_NOTE[hit], gain: DRUM_NOTE[hit].gain * quiet, type: 'sine', instrument: hit });
    }
  }
  return notes.slice(0, 5);
}

/**
 * Sound effects: tones [hz, duration, gain, offset] and noise bursts
 * { noise, duration, gain, cutoff, offset, filter }.
 */
const N = (duration, gain, cutoff, offset = 0, filter = 'lowpass') => ({ noise: true, duration, gain, cutoff, offset, filter });
export const CUES = Object.freeze({
  notice: [[520,.07,.045,0]],
  message: [[660,.12,.05,0],[880,.18,.04,.12]],
  talk: [[390,.07,.022,0]],
  door: [[150,.1,.04,0],[95,.09,.03,.1]],
  car: [[110,.14,.035,0],[165,.18,.025,.1]],
  bus: [[330,.14,.035,0],[440,.22,.03,.12]],
  bell: [[880,.6,.055,0],[1320,.45,.022,.03]],
  food: [[310,.09,.025,0],[465,.12,.025,.1]],
  wake: [[392,.22,.03,0],[494,.22,.03,.2],[587,.4,.03,.4]],
  achievement: [[523,.18,.04,0],[659,.18,.04,.15],[784,.4,.04,.3]],
  kick: [[95,.09,.06,0], N(.05,.03,2400)],
  whistle: [[2600,.18,.03,0],[2750,.32,.03,.2]],
  goal: [N(1.6,.06,1400), [523,.25,.04,.05],[659,.25,.04,.2],[784,.5,.045,.35],[1047,.6,.035,.55]],
  save: [N(.9,.035,900), [392,.18,.025,.1],[330,.3,.025,.25]],
  jump: [N(.12,.018,3000,0,'highpass'), [330,.08,.015,0]],
  land: [[80,.1,.05,0], N(.08,.03,700)],
  shift: [[440,.12,.03,0],[554,.12,.03,.12],[659,.25,.03,.24]],
  promotion: [[392,.15,.04,0],[523,.15,.04,.15],[659,.15,.04,.3],[784,.6,.05,.45],[1047,.6,.03,.45]],
  horn: [[349,.22,.04,0],[440,.22,.03,0]],
  // Career duties: a bright two-note blip at each stop, and a radio squelch with a call tone when a duty starts.
  checkpoint: [[784,.08,.035,0],[1175,.16,.03,.08]],
  dispatch: [N(.18,.03,1800,0,'bandpass'), [988,.12,.025,.16],[740,.16,.022,.3]],
  map: [N(.12,.02,2200,0,'bandpass'), [700,.05,.015,.05]],
  chat: [[880,.06,.03,0],[1175,.09,.025,.07]],
  emote: [[523,.08,.025,0],[784,.12,.025,.08]],
  // Training range: kept short and soft (the player is wearing ear defenders).
  shot: [N(.09,.07,2600), [110,.07,.04,0]],
  rifle: [N(.14,.08,2000), [70,.12,.05,0], N(.25,.015,700,.05)],
  spray: [N(.32,.035,1600,0,'bandpass')],
  ding: [[1760,.45,.028,0],[2637,.3,.012,0]],
  reload: [N(.035,.03,4200,0,'highpass'), N(.04,.03,3200,.2,'highpass')],
});
