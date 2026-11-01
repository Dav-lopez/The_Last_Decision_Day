import { CUES, LOCATIONS, beatSeconds, musicStep } from './score.mjs';
import { normalizeAudioSettings } from './settings.mjs';
import { programAt, radioStep, radioStepSeconds, stationById, tuneInStep } from './radio.mjs';

/** Web Audio is created only by enable(), called directly from a user gesture. */
export function createGameAudio({ createContext, onStatus = () => {}, onCue = () => {}, speech } = {}) {
  // Car radio: the chosen station plays instead of the place's music while you drive.
  let radio = null, announced = -1;
  const dj = speech ?? browserSpeech();
  const hush = () => { announced = -1; try { dj.cancel(); } catch {} };
  let context = null, buses = null, master = null, compressor = null;
  let disposed = false, enabled = false, hidden = false, resumeVersion = 0;
  let settings = normalizeAudioSettings(null);
  let nextBeat = 0, beat = 0, nextFootstep = 0, nextAmbient = 0, lastLocation = '';
  let engine = null;
  let reverb = null, reverbSend = null, intensity = 0;
  const voices = new Set(), lastCue = new Map();
  const targets = new WeakMap();
  const now = () => context?.currentTime ?? 0;
  const playable = () => !disposed && enabled && !hidden && !settings.muted && context?.state === 'running';
  const report = () => onStatus(disposed || !enabled ? 'off' : context?.state === 'running' && !hidden ? 'running' : 'suspended');
  const ramp = (param, value) => {
    if(targets.get(param)===value) return;
    targets.set(param,value);param.cancelScheduledValues(now());param.setTargetAtTime(value,now(),.04);
  };

  function release(voice) {
    if (!voices.delete(voice)) return;
    for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
  }
  function stopVoices(category) {
    for (const voice of [...voices]) if (!category || voice.category === category) {
      try { voice.source.stop(); } catch {}
      release(voice);
    }
    if (!category || category === 'effects') engine = null;
  }
  function register(source, gain, category, extra = []) {
    if (voices.size >= 80) return false;
    const voice = { source, nodes: [source,gain,...extra], category };
    voices.add(voice);
    source.onended = () => release(voice);
    return voice;
  }
  function tone(hz, duration, volume, start, category = 'effects', type = 'sine') {
    if (!playable() || voices.size >= 80) return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(hz,start);
    gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(volume,start+.015);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    oscillator.connect(gain); gain.connect(buses[category]);
    register(oscillator,gain,category);
    oscillator.start(start); oscillator.stop(start+duration+.02);
  }
  /**
   * One note on a named instrument. Pads detune two saws through a lowpass,
   * plucks and mallets decay fast, keys add a soft octave, bass is a filtered
   * triangle, brass a filtered square; drums are a pitch-dropping kick, a
   * snare (noise + body) and a hi-hat (bright noise).
   */
  function play(note, start) {
    const instrument = note.instrument ?? 'sine';
    if (instrument === 'kick') return kick(note.gain, start);
    if (instrument === 'snare') { noise(.14, note.gain * .9, 1900, 'music', 'bandpass', start); return tone(190, .1, note.gain * .5, start, 'music', 'triangle'); }
    if (instrument === 'hat') return noise(note.duration, note.gain, 7000, 'music', 'highpass', start);
    if (!playable() || voices.size >= 78) return;
    const gain = context.createGain(), filter = context.createBiquadFilter();
    const oscillators = [];
    const make = (type, hz, detune = 0) => { const o = context.createOscillator(); o.type = type; o.frequency.setValueAtTime(hz, start); if (detune && o.detune) o.detune.setValueAtTime(detune, start); o.connect(filter); oscillators.push(o); };
    let attack = .01, cutoff = 4000, sustain = note.duration;
    if (instrument === 'pad') { make('sawtooth', note.frequency, -7); make('sawtooth', note.frequency, 7); attack = .35; cutoff = 900; }
    else if (instrument === 'keys') { make('sine', note.frequency); make('sine', note.frequency * 2); attack = .008; cutoff = 3000; }
    else if (instrument === 'pluck' || instrument === 'mallet') { make(instrument === 'mallet' ? 'sine' : 'triangle', note.frequency); attack = .004; cutoff = instrument === 'mallet' ? 5000 : 2200; sustain = Math.min(note.duration, .45); }
    else if (instrument === 'bass') { make('triangle', note.frequency); attack = .01; cutoff = 420; }
    else if (instrument === 'brass') { make('square', note.frequency); make('sawtooth', note.frequency, 5); attack = .03; cutoff = 1600; }
    else if (instrument === 'lead') { make('triangle', note.frequency); make('sine', note.frequency * 2); attack = .02; cutoff = 2600; }
    else make(note.type ?? 'sine', note.frequency);
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(note.gain, start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + Math.max(attack + .02, sustain));
    filter.connect(gain); gain.connect(buses.music);
    const voice = register(oscillators[0], gain, 'music', [filter, ...oscillators.slice(1)]);
    if (!voice) return;
    for (const o of oscillators) { o.start(start); o.stop(start + sustain + .05); }
  }
  function kick(volume, start) {
    if (!playable() || voices.size >= 80) return;
    const o = context.createOscillator(), gain = context.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, start); o.frequency.exponentialRampToValueAtTime(45, start + .12);
    gain.gain.setValueAtTime(volume * 1.6, start); gain.gain.exponentialRampToValueAtTime(.0001, start + .22);
    o.connect(gain); gain.connect(buses.music);
    register(o, gain, 'music'); o.start(start); o.stop(start + .25);
  }
  let noiseBuffer = null;
  function noise(duration, volume, cutoff, category = 'effects', filterType = 'lowpass', start = now()) {
    if (!playable() || voices.size >= 80) return;
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1,Math.ceil(context.sampleRate*.5),context.sampleRate);
      const channel = noiseBuffer.getChannelData(0); let seed = 4181;
      for (let i=0;i<channel.length;i++) { seed=(seed*16807)%2147483647; channel[i]=(seed/2147483647)*2-1; }
    }
    const source=context.createBufferSource(), gain=context.createGain(), filter=context.createBiquadFilter();
    source.buffer=noiseBuffer; filter.type=filterType; filter.frequency.setValueAtTime(cutoff,start);
    gain.gain.setValueAtTime(volume,start); gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(filter); filter.connect(gain); gain.connect(buses[category]);
    register(source,gain,category,[filter]); source.start(start); source.stop(start+duration);
  }
  /** The DJ reads the station ident over the jingle (browser speech, when the device has it). */
  function announce(station, step) {
    const now = programAt(station, step);
    if (!now || now.kind !== 'ident' || now.identStep !== 2 || announced === step) return;
    announced = step;
    const volume = Math.max(0, Math.min(1, settings.master * settings.music * 1.8));
    if (volume <= 0) return;
    try { dj.speak(now.line, { volume, pitch: station === 'pulse' ? .8 : station === 'lowtide' ? .95 : 1.05, rate: station === 'lowtide' ? .92 : 1.05 }); } catch {}
  }
  function applySettings() {
    if (!master || !buses) return;
    ramp(master.gain,settings.muted ? 0 : settings.master);
    for (const key of ['music','effects','ambience']) ramp(buses[key].gain,settings[key]);
  }
  function init() {
    const factory = createContext ?? (() => {
      const Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Constructor) throw new Error('Web Audio unavailable');
      return new Constructor();
    });
    context=factory(); master=context.createGain(); compressor=context.createDynamicsCompressor();
    compressor.threshold.value=-18; compressor.ratio.value=6;
    compressor.attack.value=.005; compressor.release.value=.2;
    master.connect(compressor); compressor.connect(context.destination);
    buses=Object.fromEntries(['music','effects','ambience'].map(key=>{
      const gain=context.createGain();gain.connect(master);return [key,gain];
    }));
    // A small generated room reverb on the music (no impulse files to download).
    if (typeof context.createConvolver === 'function') {
      try {
        const length = Math.floor(context.sampleRate * 1.8);
        const impulse = context.createBuffer(2, length, context.sampleRate);
        let seed = 977;
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel);
          for (let i = 0; i < length; i++) { seed = (seed * 16807) % 2147483647; data[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / length, 3); }
        }
        reverb = context.createConvolver(); reverb.buffer = impulse;
        reverbSend = context.createGain(); reverbSend.gain.value = .22;
        buses.music.connect(reverbSend); reverbSend.connect(reverb); reverb.connect(master);
      } catch { reverb = null; reverbSend = null; }
    }
    context.onstatechange=report; applySettings();
  }
  return {
    async enable() {
      if (disposed) return false;
      const version=++resumeVersion;
      try {
        if (!context) init();
        enabled=true;
        await context.resume();
        if (disposed || version!==resumeVersion) return false;
        if (hidden) { await context.suspend(); report(); return false; }
        nextBeat=nextFootstep=nextAmbient=now(); report();
        return context.state==='running';
      } catch { enabled=false; if(!disposed && version===resumeVersion) onStatus('unavailable'); return false; }
    },
    disable() {
      ++resumeVersion; enabled=false;stopVoices();hush();
      if (context) void context.suspend().catch(()=>{});
      report();
    },
    setSettings(value) { settings=normalizeAudioSettings(value); applySettings(); if(settings.muted) { stopVoices(); hush(); } },
    /** The car radio station (an id from radio.mjs, or null for off). Heard only while driving. */
    setRadio(id) { radio = stationById(id) ? id : null; },
    setHidden(value) {
      hidden=Boolean(value);++resumeVersion;stopVoices();hush();
      if (!context || !enabled || disposed) return;
      const version=resumeVersion;
      void (hidden ? context.suspend() : context.resume()).then(()=>{
        if(disposed || version!==resumeVersion) return;
        nextBeat=nextFootstep=nextAmbient=now();report();
      }).catch(()=>{if(!disposed && version===resumeVersion) onStatus('suspended');});
    },
    cue(name) {
      if (!Object.hasOwn(CUES,name)) return;
      // Reported even when muted or before audio is enabled, so captions still describe the sound.
      try { onCue(name); } catch {}
      if (!playable()) return;
      const time=now();
      if(time-(lastCue.get(name) ?? -Infinity)<.3) return;
      lastCue.set(name,time);
      for(const part of CUES[name]) {
        if (Array.isArray(part)) { const [hz,duration,gain,offset]=part; tone(hz,duration,gain,time+offset); }
        else noise(part.duration,part.gain,part.cutoff,'effects',part.filter,time+part.offset);
      }
    },
    update({ location='street', speed=0, drivingSpeed=null, reading=false, paused=false, evening=false, match=false } = {}) {
      if(!playable()) return;
      const time=now();
      location=LOCATIONS.includes(location) ? location : 'street';
      const station=radio && drivingSpeed!==null && Number.isFinite(drivingSpeed) ? radio : null;
      const musicKey=station ? `radio:${station}` : location;
      if(musicKey!==lastLocation) {
        stopVoices('music');hush();nextBeat=time;lastLocation=musicKey;
        // Tune in mid-programme, with a short burst of dial static.
        beat=station ? tuneInStep(station,Date.now()) : 0;
        if(station && settings.music>0) noise(.22,.02,1800,'music','bandpass');
      }
      ramp(buses.music.gain, settings.music*(reading ? .25 : paused ? .45 : 1));
      // At most one short look-ahead window: background tabs never schedule a backlog.
      if(nextBeat<time-.2) nextBeat=time;
      // Energy follows you: running, driving fast or a match brings in the drums.
      const want = match ? 1 : drivingSpeed !== null && Number.isFinite(drivingSpeed) ? Math.min(1, Math.abs(drivingSpeed) / 9) : Math.min(1, Math.max(0, (Number(speed) || 0) - 1.8) / 2.2);
      intensity += (want - intensity) * .08;
      for(let i=0;i<3 && nextBeat<time+.12;i++) {
        if(settings.music>0) {
          for(const note of station ? radioStep(station,beat,{ intensity }) : musicStep(location,beat,{ evening, intensity })) play(note,nextBeat);
          if(station && !reading) announce(station,beat);
        }
        nextBeat+=station ? radioStepSeconds(station) : beatSeconds(location);beat++;
      }
      const moving=Number.isFinite(speed)&&speed>.1&&!paused&&!reading&&drivingSpeed===null;
      if(moving && time>=nextFootstep && settings.effects>0) {
        noise(.075,location==='home' ? .024 : .04,location==='home' ? 550 : 1250);
        nextFootstep=time+(speed>2.8 ? .25 : .43);
      } else if(!moving) nextFootstep=time;
      if(drivingSpeed!==null && Number.isFinite(drivingSpeed) && !paused && !reading && settings.effects>0) {
        if(!engine && voices.size<80) {
          const source=context.createOscillator(),gain=context.createGain();
          source.type='triangle';gain.gain.setValueAtTime(.012,time);source.connect(gain);gain.connect(buses.effects);
          engine=register(source,gain,'effects');if(engine) source.start();
        }
        if(engine) ramp(engine.source.frequency,55+Math.min(35,Math.abs(drivingSpeed))*3);
      } else if(engine) { try {engine.source.stop();}catch{} release(engine);engine=null; }
      if(time>=nextAmbient && !reading && !paused && settings.ambience>0) {
        if (location==='pitch') {
          // The crowd: a broad murmur that swells, with the odd shout.
          noise(2.6,match ? .03 : .015,match ? 1100 : 800,'ambience','bandpass');
          if (match) tone(330+((beat*37)%5)*40,.25,.008,time+.6,'ambience','sawtooth');
          nextAmbient=time+2.2;
        } else if (location==='street'||location==='city') {
          noise(.4,.016,evening ? 650 : 1200,'ambience');
          if(location==='street') tone(evening ? 1750 : 1450,.12,.015,time+.12,'ambience');
          else tone(evening ? 220 : 180,.5,.006,time+.2,'ambience','sawtooth'); // distant traffic
          nextAmbient=time+(location==='city' ? 4 : 7);
        } else nextAmbient=time+7;
      }
    },
    dispose() {
      if(disposed) return;
      disposed=true;enabled=false;++resumeVersion;stopVoices();hush();
      if(context) { context.onstatechange=null; void context.close().catch(()=>{}); }
      for(const bus of Object.values(buses??{})) bus.disconnect();
      reverb?.disconnect(); reverbSend?.disconnect();
      master?.disconnect();compressor?.disconnect();noiseBuffer=null;
    },
  };
}

/** Web Speech for DJ idents; silent where the browser has none. */
function browserSpeech() {
  return {
    speak(line, { volume = 1, pitch = 1, rate = 1 } = {}) {
      const synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance;
      if (!synth || !Utterance) return;
      synth.cancel();
      const utterance = new Utterance(line);
      utterance.volume = volume; utterance.pitch = pitch; utterance.rate = rate; utterance.lang = 'en-US';
      synth.speak(utterance);
    },
    cancel() { globalThis.speechSynthesis?.cancel(); },
  };
}
