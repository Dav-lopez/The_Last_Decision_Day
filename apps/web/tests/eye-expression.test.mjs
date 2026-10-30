import test from 'node:test';
import assert from 'node:assert/strict';
import { composeEyeExpression } from '../src/world/eyeExpression.mjs';

test('a fully closed blink suppresses competing squint and wide morphs', () => {
  for (const name of ['eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookUpLeft', 'eyeLookUpRight']) {
    assert.equal(composeEyeExpression(name, 0.8, {left: 1, right: 1}), 0);
    assert.equal(composeEyeExpression(name, 0.8, {left: 0, right: 0}), 0.8);
  }
});

test('staggered blinks affect only the corresponding eye', () => {
  const blink = {left: 1, right: 0.25};
  assert.equal(composeEyeExpression('eyeWideLeft', 0.8, blink), 0);
  assert.ok(Math.abs(composeEyeExpression('eyeWideRight', 0.8, blink) - 0.6) < 1e-12);
  assert.ok(Math.abs(composeEyeExpression('eyeSquintRight', 0.8, blink) - 0.6) < 1e-12);
});

test('mouth, cheeks and brow continue expressing during a blink', () => {
  for (const name of ['mouthSmileLeft', 'mouthFrownRight', 'cheekSquintLeft', 'browInnerUp', 'jawOpen']) {
    assert.equal(composeEyeExpression(name, 0.7, {left: 1, right: 1}), 0.7);
  }
});

test('invalid values cannot create NaN or out-of-range morph weights', () => {
  for (const expression of [NaN, Infinity, -1, 3]) {
    for (const blink of [null, {left: NaN, right: Infinity}, {left: -1, right: 3}]) {
      for (const name of ['eyeSquintLeft', 'eyeWideRight', 'mouthOpen']) {
        const value = composeEyeExpression(name, expression, blink);
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      }
    }
  }
});


import { FACIAL_PRESETS, facialPresetWeight } from '../src/world/facialPresets.mjs';
import { advanceFacialMorph } from '../src/world/faceDynamics.mjs';

const validMorphs = new Set([
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'eyeWideRight',
  'eyeSquintLeft', 'eyeSquintRight', 'eyeLookUpLeft', 'eyeLookUpRight',
  'eyeLookDownLeft', 'eyeLookDownRight', 'browInnerUp', 'browDownLeft',
  'browDownRight', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft',
  'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight', 'jawOpen',
  'mouthOpen', 'cheekSquintLeft', 'cheekSquintRight',
]);

test('every emotional pose uses authored facial morphs with finite bounded weights', () => {
  assert.deepEqual(Object.keys(FACIAL_PRESETS).sort(),
    ['neutral', 'happy', 'sad', 'angry', 'fear', 'embarrassed', 'exerted'].sort());
  assert.deepEqual(FACIAL_PRESETS.neutral, {});
  for (const [emotion, weights] of Object.entries(FACIAL_PRESETS)) {
    assert.ok(Object.isFrozen(weights), emotion);
    for (const [name, weight] of Object.entries(weights)) {
      assert.ok(validMorphs.has(name), `${emotion} uses unknown morph ${name}`);
      assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1, `${emotion}:${name}`);
      assert.equal(facialPresetWeight(emotion, name), weight);
    }
  }
});

test('emotion poses use natural asymmetry and distinct mouth and brow shapes', () => {
  assert.ok(facialPresetWeight('happy', 'mouthSmileLeft') > facialPresetWeight('happy', 'mouthSmileRight'));
  assert.ok(facialPresetWeight('sad', 'mouthFrownLeft') > facialPresetWeight('sad', 'mouthFrownRight'));
  assert.ok(facialPresetWeight('angry', 'browDownLeft') > facialPresetWeight('angry', 'browDownRight'));
  assert.ok(facialPresetWeight('fear', 'jawOpen') > facialPresetWeight('sad', 'jawOpen'));
  assert.ok(facialPresetWeight('exerted', 'mouthOpen') > facialPresetWeight('fear', 'mouthOpen'));
});

test('no emotion fights itself with simultaneous smile/frown or eye wide/squint', () => {
  for (const [emotion, weights] of Object.entries(FACIAL_PRESETS)) {
    for (const side of ['Left', 'Right']) {
      assert.ok(!(weights[`mouthSmile${side}`] > 0 && weights[`mouthFrown${side}`] > 0), emotion);
      assert.ok(!(weights[`eyeWide${side}`] > 0 && weights[`eyeSquint${side}`] > 0), emotion);
      assert.ok(!(weights[`eyeLookUp${side}`] > 0 && weights[`eyeLookDown${side}`] > 0), emotion);
    }
  }
});

test('legacy morphs, unknown emotions and malformed inputs remain safe', () => {
  for (const value of [null, undefined, {}, NaN, Infinity, 'nonexistent']) {
    assert.equal(facialPresetWeight(value, 'eyeBlinkLeft'), 0);
    assert.equal(facialPresetWeight('happy', value), 0);
  }
  assert.equal(facialPresetWeight('happy', 'eyeBlinkLeft'), 0);
  assert.equal(facialPresetWeight('happy', '__proto__'), 0);
  assert.equal(facialPresetWeight('happy', 'constructor'), 0);
});

test('asymmetric emotional poses remain blink-compatible during smooth transitions', () => {
  for (const side of ['Left', 'Right']) {
    const name = `eyeWide${side}`;
    const goal = facialPresetWeight('fear', name);
    const animated = advanceFacialMorph({ value: 0, velocity: 0 }, goal, 1 / 60, name);
    assert.ok(animated.value > 0 && animated.value < goal);
    assert.equal(composeEyeExpression(name, animated.value, { left: 1, right: 1 }), 0);
    assert.equal(composeEyeExpression(name, animated.value, { left: 0, right: 0 }), animated.value);
  }
});
