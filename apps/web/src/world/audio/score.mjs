/** Original procedural score and sound cues, authored for this game. No sampled music. */
export const BEAT_SECONDS = 60 / 84 / 2;
export const LOCATIONS = Object.freeze(['street', 'home', 'school', 'city']);
const CHORDS = [[48,52,55,59],[45,48,52,55],[41,45,48,52],[43,47,50,53]];
const MELODY = [72,null,76,79,74,null,71,67,69,null,72,76,71,null,67,64];
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export function musicStep(location, step) {
  if (!LOCATIONS.includes(location) || !Number.isInteger(step) || step < 0) return [];
  const shift = location === 'home' ? -12 : location === 'city' ? -5 : location === 'school' ? -7 : 0;
  const voices = [];
  if (step % 8 === 0) for (const midi of CHORDS[Math.floor(step / 8) % 4]) {
    voices.push({ frequency: frequency(midi + shift), duration: 2.8, gain: 0.014, type: 'sine' });
  }
  const note = MELODY[step % MELODY.length];
  if (note !== null && (location !== 'school' || step % 2 === 0)) {
    voices.push({ frequency: frequency(note + shift), duration: 0.55, gain: 0.023, type: 'sine' });
  }
  return voices;
}

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
});
