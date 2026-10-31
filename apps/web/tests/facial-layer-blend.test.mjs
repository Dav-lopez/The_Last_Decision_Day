import test from 'node:test';
import assert from 'node:assert/strict';
import { composeFacialLayer } from '../src/world/facialLayerBlend.mjs';
import { facialPresetWeight } from '../src/world/facialPresets.mjs';
import { actionFacialWeight } from '../src/world/actionFacial.mjs';

const talking = { name: 'Talk', elapsed: 0.18 };

test('sad, angry and fearful players articulate without smiling through their distress', () => {
  for (const emotion of ['sad', 'angry', 'fear']) {
    for (const side of ['Left', 'Right']) {
      const name = 'mouthSmile' + side;
      const genericTalkSmile = actionFacialWeight(name, talking, 1);
      assert.ok(genericTalkSmile > 0, 'test must exercise actual Talk smile');
      assert.equal(composeFacialLayer(name, emotion, facialPresetWeight(emotion, name),
        genericTalkSmile, genericTalkSmile), 0);
    }
    const frown = facialPresetWeight(emotion, 'mouthFrownLeft');
    assert.equal(composeFacialLayer('mouthFrownLeft', emotion, frown, 0, 0), frown);
    const jaw = actionFacialWeight('jawOpen', talking, 1);
    assert.ok(jaw > 0);
    assert.ok(composeFacialLayer('jawOpen', emotion, 0, jaw, jaw) >= jaw);
  }
});

test('neutral, happy and embarrassed speech retains subtle expressive mouth movement', () => {
  for (const emotion of ['neutral', 'happy', 'embarrassed']) {
    const smile = actionFacialWeight('mouthSmileLeft', talking, 1);
    const preset = facialPresetWeight(emotion, 'mouthSmileLeft');
    assert.equal(composeFacialLayer('mouthSmileLeft', emotion, preset, smile, 0),
      Math.max(preset, smile));
  }
});

test('emotional poses do not combine with idle eye drift; neutral gaze stays bounded', () => {
  assert.equal(composeFacialLayer('eyeLookDownLeft', 'sad', 0.28, 0, 0, 0.16), 0.28);
  assert.equal(composeFacialLayer('eyeLookDownLeft', 'neutral', 0, 0, 0, 0.16), 0.16);
  assert.equal(composeFacialLayer('eyeLookDownLeft', 'neutral', 0.95, 0, 0, 0.16), 1);
});

test('malformed weights cannot poison Babylon morph influences', () => {
  for (const bad of [NaN, Infinity, -Infinity, -1, 4, undefined]) {
    const value = composeFacialLayer('jawOpen', 'neutral', bad, bad, bad, bad);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
  assert.equal(composeFacialLayer('jawOpen', 'neutral', 0.2, 0.7, 0.5), 0.7);
});
