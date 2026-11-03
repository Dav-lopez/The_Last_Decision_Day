import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// WorldScene is the biggest chunk the game downloads before Maple Street appears (see bundle-budget.json).
// These parts are only needed later, so they must stay behind dynamic import() calls.
const scene = await readFile(new URL('../src/world/WorldScene.tsx', import.meta.url), 'utf8');
const staticImports = [...scene.matchAll(/^import (?!type )[^;]*? from '([^']+)';/gm)].map(match => match[1]);

test('downtown 3D builders, the football match and the big map load on demand', () => {
  for (const lazyOnly of ['./cityScene', './cityLights', './footballScene', './cityTrafficScene', './cityPedestriansScene',
    './trafficLightsScene', './footballMatch.mjs', './footballPlayers', './WorldMap', './downtownKit', './footballMatchKit',
    './TrainingRange', './Phone', './audio/RadioHud', './audio/radio.mjs', './driveFeel', './carDamageScene']) {
    assert.ok(!staticImports.includes(lazyOnly), `${lazyOnly} is imported eagerly by WorldScene`);
  }
  for (const kit of ['./downtownKit', './footballMatchKit', './WorldMap']) assert.match(scene, new RegExp(`import\\('${kit.replace('.', '\\.')}'\\)`));
});

test('the kits re-export what WorldScene takes from them', async () => {
  const downtown = await readFile(new URL('../src/world/downtownKit.ts', import.meta.url), 'utf8');
  for (const name of ['buildCityScene', 'buildCityLights', 'buildFootballPitch', 'loadCityTraffic']) assert.match(downtown, new RegExp(`\\b${name}\\b`));
  const match = await readFile(new URL('../src/world/footballMatchKit.ts', import.meta.url), 'utf8');
  for (const name of ['createMatch', 'formatMatchClock', 'saveMessage', 'stepMatch', 'loadFootballPlayers']) assert.match(match, new RegExp(`\\b${name}\\b`));
  const { createMatch, stepMatch, formatClock, saveMessage } = await import('../src/world/footballMatch.mjs');
  for (const fn of [createMatch, stepMatch, formatClock, saveMessage]) assert.equal(typeof fn, 'function');
});
