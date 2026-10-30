import { BEAT_SECONDS, CUES, LOCATIONS, musicStep } from './score.mjs';
import { normalizeAudioSettings } from './settings.mjs';

/** Web Audio is created only by enable(), called directly from a user gesture. */
export function createGameAudio({ createContext, onStatus = () => {} } = {}) {
  let context = null, buses = null, master = null, compressor = null;
  let disposed = false, enabled = false, hidden = false, resumeVersion = 0;
  let settings = normalizeAudioSettings(null);
  let nextBeat = 0, beat = 0, nextFootstep = 0, nextAmbient = 0, lastLocation = '';
  let engine = null;
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
  let noiseBuffer = null;
  function noise(duration, volume, cutoff, category = 'effects') {
    if (!playable() || voices.size >= 80) return;
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1,Math.ceil(context.sampleRate*.5),context.sampleRate);
      const channel = noiseBuffer.getChannelData(0); let seed = 4181;
      for (let i=0;i<channel.length;i++) { seed=(seed*16807)%2147483647; channel[i]=(seed/2147483647)*2-1; }
    }
    const source=context.createBufferSource(), gain=context.createGain(), filter=context.createBiquadFilter();
    source.buffer=noiseBuffer; filter.type='lowpass'; filter.frequency.setValueAtTime(cutoff,now());
    gain.gain.setValueAtTime(volume,now()); gain.gain.exponentialRampToValueAtTime(.0001,now()+duration);
    source.connect(filter); filter.connect(gain); gain.connect(buses[category]);
    register(source,gain,category,[filter]); source.start(); source.stop(now()+duration);
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
      ++resumeVersion; enabled=false;stopVoices();
      if (context) void context.suspend().catch(()=>{});
      report();
    },
    setSettings(value) { settings=normalizeAudioSettings(value); applySettings(); if(settings.muted) stopVoices(); },
    setHidden(value) {
      hidden=Boolean(value);++resumeVersion;stopVoices();
      if (!context || !enabled || disposed) return;
      const version=resumeVersion;
      void (hidden ? context.suspend() : context.resume()).then(()=>{
        if(disposed || version!==resumeVersion) return;
        nextBeat=nextFootstep=nextAmbient=now();report();
      }).catch(()=>{if(!disposed && version===resumeVersion) onStatus('suspended');});
    },
    cue(name) {
      if (!playable() || !Object.hasOwn(CUES,name)) return;
      const time=now();
      if(time-(lastCue.get(name) ?? -Infinity)<.3) return;
      lastCue.set(name,time);
      for(const [hz,duration,gain,offset] of CUES[name]) tone(hz,duration,gain,time+offset);
    },
    update({ location='street', speed=0, drivingSpeed=null, reading=false, paused=false, evening=false } = {}) {
      if(!playable()) return;
      const time=now();
      location=LOCATIONS.includes(location) ? location : 'street';
      if(location!==lastLocation) { stopVoices('music');nextBeat=time;beat=0;lastLocation=location; }
      ramp(buses.music.gain, settings.music*(reading ? .25 : paused ? .45 : 1));
      // At most one short look-ahead window: background tabs never schedule a backlog.
      if(nextBeat<time-.2) nextBeat=time;
      for(let i=0;i<3 && nextBeat<time+.12;i++) {
        if(settings.music>0) for(const note of musicStep(location,beat)) tone(note.frequency,note.duration,note.gain,nextBeat,'music',note.type);
        nextBeat+=BEAT_SECONDS;beat++;
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
      if(time>=nextAmbient && !reading && !paused && settings.ambience>0 && (location==='street'||location==='city')) {
        noise(.4,.016,evening ? 650 : 1200,'ambience');
        if(location==='street') tone(evening ? 1750 : 1450,.12,.015,time+.12,'ambience');
        nextAmbient=time+7;
      }
    },
    dispose() {
      if(disposed) return;
      disposed=true;enabled=false;++resumeVersion;stopVoices();
      if(context) { context.onstatechange=null; void context.close().catch(()=>{}); }
      for(const bus of Object.values(buses??{})) bus.disconnect();
      master?.disconnect();compressor?.disconnect();noiseBuffer=null;
    },
  };
}
