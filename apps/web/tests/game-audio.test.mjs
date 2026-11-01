import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAudio } from '../src/world/audio/director.mjs';
import { AUDIO_DEFAULTS, normalizeAudioSettings, readAudioSettings, writeAudioSettings } from '../src/world/audio/settings.mjs';
import { LOCATIONS, musicStep } from '../src/world/audio/score.mjs';

/** A clocked Web Audio graph double; exercises scheduling/lifecycle, not sound quality. */
function audioContext() {
  const context={ currentTime:0, state:'suspended', sampleRate:44100, nodes:[], sources:[], gains:[], destination:{}, resumes:0, closes:0 };
  const param=()=>({value:0,events:[],cancelScheduledValues(){},setTargetAtTime(v){this.value=v;this.events.push(v);},
    setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;}});
  const node=kind=>{const n={kind,connections:[],disconnected:false,connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;this.connections=[];}};context.nodes.push(n);return n;};
  const source=kind=>{const n=node(kind);Object.assign(n,{frequency:param(),started:false,end:Infinity,start(at=context.currentTime){this.started=true;this.startTime=at;},
    stop(at=context.currentTime){this.end=at;if(at<=context.currentTime)this.onended?.();}});context.sources.push(n);return n;};
  context.createGain=()=>{const n=node('gain');n.gain=param();context.gains.push(n);return n;};
  context.createOscillator=()=>source('oscillator');context.createBufferSource=()=>source('buffer');
  context.createBiquadFilter=()=>{const n=node('filter');n.frequency=param();return n;};
  context.createDynamicsCompressor=()=>{const n=node('compressor');for(const key of ['threshold','ratio','attack','release'])n[key]=param();return n;};
  context.createBuffer=(_channels,size)=>({getChannelData:()=>new Float32Array(size)});
  context.resume=async()=>{context.resumes++;context.state='running';context.onstatechange?.();};
  context.suspend=async()=>{context.state='suspended';context.onstatechange?.();};
  context.close=async()=>{context.closes++;context.state='closed';};
  context.advance=seconds=>{context.currentTime+=seconds;for(const s of context.sources)if(s.end<=context.currentTime&&!s.disconnected)s.onended?.();};
  return context;
}
const effectsOnly={...AUDIO_DEFAULTS,music:0,ambience:0};

test('audio is silent and allocates no context before a user enables it',async()=>{
  let created=0;const context=audioContext();const audio=createGameAudio({createContext:()=>{created++;return context;}});
  audio.update({speed:4});audio.cue('bell');assert.equal(created,0);
  assert.equal(await audio.enable(),true);assert.equal(created,1);
  await audio.enable();assert.equal(created,1,'reuse one context');audio.dispose();
});

test('music is bounded original note data, changes with location, and ducks for dialogue',async()=>{
  for(const location of LOCATIONS)for(let step=0;step<64;step++) {
    const notes=musicStep(location,step);assert.ok(notes.length<=5);
    assert.ok(notes.every(n=>Number.isFinite(n.frequency)&&n.frequency>20&&n.frequency<2000&&n.gain<=.03&&n.duration<3));
  }
  assert.notDeepEqual(musicStep('home',0),musicStep('street',0));
  assert.deepEqual(musicStep('unknown',0),[]);
  const context=audioContext();const audio=createGameAudio({createContext:()=>context});await audio.enable();
  audio.setSettings({...AUDIO_DEFAULTS,music:.4});audio.update({location:'home',reading:true});
  assert.ok(context.gains.some(g=>g.gain.value===.1),'dialogue reduces music to 25%');
  const count=context.sources.length;context.advance(3600);audio.update({location:'city'});
  assert.ok(context.sources.length-count<=15,'no hour-long catch-up backlog');audio.dispose();
});

test('footsteps use actual movement, stop during reading, and a car reuses one engine source',async()=>{
  const context=audioContext();const audio=createGameAudio({createContext:()=>context});audio.setSettings(effectsOnly);await audio.enable();
  audio.update({speed:1.8});assert.equal(context.sources.filter(s=>s.kind==='buffer').length,1);
  context.advance(1);audio.update({speed:0});assert.equal(context.sources.length,1);
  audio.update({speed:4});assert.equal(context.sources.length,2);
  context.advance(.3);audio.update({speed:4,reading:true});assert.equal(context.sources.length,2);
  audio.update({drivingSpeed:3});const count=context.sources.length;
  for(let i=0;i<20;i++)audio.update({drivingSpeed:i});assert.equal(context.sources.length,count);
  audio.update({speed:0});assert.ok(context.sources.at(-1).disconnected);audio.dispose();
});

test('mute, background pause and disposal stop existing sources and prevent ghost audio',async()=>{
  const context=audioContext();const statuses=[];const audio=createGameAudio({createContext:()=>context,onStatus:s=>statuses.push(s)});
  await audio.enable();audio.cue('bell');assert.ok(context.sources.length>0);
  audio.setSettings({...AUDIO_DEFAULTS,muted:true});assert.ok(context.sources.every(s=>s.disconnected));
  const count=context.sources.length;audio.cue('door');audio.update({speed:4});assert.equal(context.sources.length,count);
  audio.setSettings(AUDIO_DEFAULTS);audio.setHidden(true);assert.equal(context.state,'suspended');audio.update({speed:4});
  assert.equal(context.sources.length,count);audio.setHidden(false);await Promise.resolve();assert.equal(context.state,'running');
  audio.dispose();audio.dispose();assert.equal(context.closes,1);assert.ok(context.nodes.every(n=>n.disconnected));
  await audio.enable();audio.cue('door');assert.equal(context.sources.length,count);
});

test('failed or stale activation does not crash gameplay or update a disposed panel',async()=>{
  const failed=createGameAudio({createContext:()=>{throw new Error('unsupported');}});assert.equal(await failed.enable(),false);failed.update();failed.dispose();
  const context=audioContext();let reject;const statuses=[];
  context.resume=()=>new Promise((_resolve,no)=>{reject=no;});
  const audio=createGameAudio({createContext:()=>context,onStatus:s=>statuses.push(s)});
  const pending=audio.enable();audio.dispose();reject(new Error('interrupted'));assert.equal(await pending,false);assert.deepEqual(statuses,[]);
});

test('preference validation and storage failures never break the game',()=>{
  assert.deepEqual(normalizeAudioSettings({master:NaN,music:4,effects:-2,ambience:'loud',muted:true}),{master:.65,music:1,effects:0,ambience:.3,muted:true});
  const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');}};
  assert.deepEqual(readAudioSettings(storage),AUDIO_DEFAULTS);assert.equal(writeAudioSettings(AUDIO_DEFAULTS,storage),false);
});

test('each place has its own tempo and band; energy brings in drums, dusk softens it', async () => {
  const { beatSeconds, musicStep, CUES } = await import('../src/world/audio/score.mjs');
  const tempos = new Set(['street', 'home', 'school', 'city', 'pitch'].map(beatSeconds));
  assert.equal(tempos.size, 5);
  const drums = (location, mood) => Array.from({ length: 16 }, (_, s) => musicStep(location, s, mood)).flat().filter(n => ['kick', 'snare', 'hat'].includes(n.instrument)).length;
  assert.equal(drums('street', { intensity: 0 }), 0, 'a quiet walk has no kit');
  assert.ok(drums('street', { intensity: 1 }) > 4, 'running brings the drums');
  assert.ok(drums('pitch', {}) > 8, 'match-day drums');
  const loud = musicStep('street', 0, {}).reduce((s, n) => s + n.gain, 0);
  const soft = musicStep('street', 0, { evening: true }).reduce((s, n) => s + n.gain, 0);
  assert.ok(soft < loud);
  assert.ok(musicStep('city', 0).some(n => n.instrument === 'bass'));
  for (const name of ['kick', 'whistle', 'goal', 'save', 'jump', 'land', 'shift', 'promotion', 'horn', 'map', 'chat', 'emote']) assert.ok(CUES[name]?.length, name);
});

test('noise cues and instrument notes play through the graph without leaking voices', async () => {
  const context = audioContext(); const audio = createGameAudio({ createContext: () => context }); await audio.enable();
  audio.cue('goal'); audio.cue('kick');
  assert.ok(context.sources.some(s => s.kind === 'buffer'), 'crowd roar uses noise');
  for (let i = 0; i < 40; i++) { audio.update({ location: 'pitch', match: true, speed: 4 }); context.advance(0.1); }
  context.advance(10); audio.update({ location: 'pitch', match: true });
  const live = context.sources.filter(s => !s.disconnected).length;
  assert.ok(live <= 80, `${live} live voices`);
  audio.dispose();
});

test('driving: revs set the engine note, sliding tyres squeal (with a caption) and the horn holds while pressed',async()=>{
  const context=audioContext();const cues=[];const audio=createGameAudio({createContext:()=>context,onCue:c=>cues.push(c)});
  audio.setSettings(effectsOnly);await audio.enable();
  audio.update({drivingSpeed:3,car:{rpm:.2,frequency:60,throttle:1,slip:0}});
  const engine=context.sources.find(s=>s.kind==='oscillator');assert.equal(engine.frequency.value,60);
  audio.update({drivingSpeed:5,car:{rpm:.9,frequency:110,throttle:1,slip:0}});assert.equal(engine.frequency.value,110);
  const before=context.sources.length;
  audio.update({drivingSpeed:8,car:{rpm:.9,frequency:110,throttle:0,slip:.8}});
  const squeal=context.sources.slice(before).find(s=>s.kind==='buffer');assert.ok(squeal,'a looped squeal starts');
  assert.ok(cues.includes('skid'));
  for(let i=0;i<10;i++)audio.update({drivingSpeed:8,car:{slip:.8}});
  assert.equal(context.sources.filter(s=>s.kind==='buffer').length,1,'one squeal voice reused');
  audio.update({drivingSpeed:8,car:{slip:0}});assert.ok(squeal.disconnected,'stops when the tyres grip');
  audio.horn(true);audio.update({drivingSpeed:0,car:{}});assert.ok(cues.includes('horn'));
  const horns=context.sources.filter(s=>s.kind==='oscillator'&&s.frequency.value===349);assert.equal(horns.length,1);
  audio.horn(true);audio.update({drivingSpeed:0,car:{}});
  assert.equal(context.sources.filter(s=>s.kind==='oscillator'&&s.frequency.value===349).length,1,'held, not retriggered');
  audio.horn(false);assert.ok(horns[0].disconnected);
  audio.horn(true);audio.update({speed:0});
  assert.equal(context.sources.filter(s=>s.kind==='oscillator'&&s.frequency.value===349&&!s.disconnected).length,0,'no horn on foot');
  audio.dispose();
});
