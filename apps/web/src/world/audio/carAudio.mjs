/**
 * The car's sounds, loaded with the driving-feel code the first time you get
 * in a car: an engine (sawtooth + sub through a lowpass; revs set the pitch,
 * the gas opens the filter), a tyre squeal (looped band of noise that screams
 * louder the harder the tyres slide) and a held horn (two square waves a third
 * apart). Voices are registered with the audio director, so its voice limit,
 * mute and background-tab handling apply to them.
 */
export function createCarSynth({ context, output, register, release, ramp, noise }) {
  let engine = null, squeal = null, horn = null, skidCaptionAt = -Infinity;
  const stop = voice => { if (!voice) return null; try { voice.source.stop(); voice.second?.stop(); } catch {} release(voice); return null; };
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  return {
    /** Forget voices the director has already stopped (mute, hidden tab). */
    reset() { engine = squeal = horn = null; },
    /** Returns true when the tyre squeal caption should show. */
    update({ time, driving, speed, car, horn: hornOn }) {
      let caption = false;
      if (driving) {
        const rpm = Number.isFinite(car?.rpm) ? clamp01(car.rpm) : Math.min(1, Math.abs(speed) / 9);
        const hz = Number.isFinite(car?.frequency) ? car.frequency : 55 + Math.min(35, Math.abs(speed)) * 3;
        const load = clamp01(car?.throttle);
        if (!engine) {
          const source = context.createOscillator(), sub = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain();
          source.type = 'sawtooth'; sub.type = 'triangle'; filter.type = 'lowpass';
          gain.gain.setValueAtTime(.012, time); filter.frequency.setValueAtTime(400, time);
          source.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(output);
          engine = register(source, gain, 'effects', [sub, filter]) || null;
          if (engine) { engine.second = sub; engine.filter = filter; engine.gain = gain; source.start(); sub.start(); }
        }
        if (engine) {
          ramp(engine.source.frequency, hz); ramp(engine.second.frequency, hz / 2);
          ramp(engine.filter.frequency, 260 + rpm * 900 + load * 500);
          ramp(engine.gain.gain, .01 + rpm * .012 + load * .008);
        }
        const slip = clamp01(car?.slip);
        if (slip > .15) {
          if (!squeal) {
            const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
            source.buffer = noise(); source.loop = true; filter.type = 'bandpass'; filter.frequency.setValueAtTime(2300, time);
            if (filter.Q) filter.Q.value = 9;
            gain.gain.setValueAtTime(0, time);
            source.connect(filter); filter.connect(gain); gain.connect(output);
            squeal = register(source, gain, 'effects', [filter]) || null;
            if (squeal) { squeal.gain = gain; squeal.filter = filter; source.start(); }
          }
          if (squeal) { ramp(squeal.gain.gain, .012 + slip * .05); ramp(squeal.filter.frequency, 1900 + slip * 900); }
          if (slip > .45 && time - skidCaptionAt > 4) { skidCaptionAt = time; caption = true; }
        } else squeal = stop(squeal);
      } else { engine = stop(engine); squeal = stop(squeal); }
      if (hornOn && driving) {
        if (!horn) {
          const a = context.createOscillator(), b = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain();
          a.type = 'square'; b.type = 'square'; a.frequency.setValueAtTime(349, time); b.frequency.setValueAtTime(440, time);
          filter.type = 'lowpass'; filter.frequency.setValueAtTime(1800, time);
          gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.03, time + .02);
          a.connect(filter); b.connect(filter); filter.connect(gain); gain.connect(output);
          horn = register(a, gain, 'effects', [b, filter]) || null;
          if (horn) { horn.second = b; a.start(time); b.start(time); }
        }
      } else horn = stop(horn);
      return caption;
    },
  };
}
