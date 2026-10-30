import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCharacterEmotion } from '../src/world/characterEmotion.mjs';

test('neutral expression responds to actual sprint movement, not a Run toggle alone', () => {
  assert.equal(resolveCharacterEmotion('neutral', 0), 'neutral');
  assert.equal(resolveCharacterEmotion('neutral', 1.8), 'neutral');
  assert.equal(resolveCharacterEmotion('neutral', 4), 'exerted');
  assert.equal(resolveCharacterEmotion('neutral', 0), 'neutral');
  assert.equal(resolveCharacterEmotion('neutral', NaN), 'neutral');
});

test('explicitly selected expressions override automatic exertion', () => {
  for (const emotion of ['happy', 'sad', 'angry', 'fear', 'embarrassed', 'exerted']) {
    assert.equal(resolveCharacterEmotion(emotion, 4), emotion);
    assert.equal(resolveCharacterEmotion(emotion, 0), emotion);
  }
});
