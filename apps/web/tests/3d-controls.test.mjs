import assert from 'node:assert/strict';
import test from 'node:test';
import { createMovementInput } from '../src/world/inputState.mjs';

test('two touch pointers can hold different directions and release independently', () => {
  const input = createMovementInput();
  input.press('pointer:1', 'ArrowUp');
  input.press('pointer:2', 'ArrowRight');
  input.press('pointer:3', 'Shift');
  assert.deepEqual([...input.pressed].sort(), ['ArrowRight', 'ArrowUp', 'Shift']);
  input.release('pointer:1');
  assert.deepEqual([...input.pressed].sort(), ['ArrowRight', 'Shift']);
  input.release('pointer:3');
  assert.deepEqual([...input.pressed], ['ArrowRight']);
  input.release('pointer:2');
  assert.equal(input.pressed.size, 0);
});

test('releasing one of multiple sources for a direction does not stop movement', () => {
  const input = createMovementInput();
  input.press('keyboard:w', 'w');
  input.press('pointer:1', 'w');
  input.release('keyboard:w');
  assert.equal(input.pressed.has('w'), true);
  input.release('pointer:1');
  assert.equal(input.pressed.has('w'), false);
});

test('repeat press and lost capture are idempotent; pointer source can be reassigned', () => {
  const input = createMovementInput();
  input.press('pointer:1', 'ArrowUp');
  input.press('pointer:1', 'ArrowUp');
  assert.equal(input.pressed.size, 1);
  input.press('pointer:1', 'ArrowLeft');
  assert.deepEqual([...input.pressed], ['ArrowLeft']);
  input.release('pointer:1');
  input.release('pointer:1');
  assert.equal(input.pressed.size, 0);
});

test('clear removes all keyboard, touch, and sprint holds on blur or overlay open', () => {
  const input = createMovementInput();
  input.press('keyboard:Shift', 'Shift');
  input.press('pointer:8', 'ArrowUp');
  input.clear();
  assert.equal(input.pressed.size, 0);
  input.release('pointer:8');
  assert.equal(input.pressed.size, 0);
  input.press('pointer:9', 'ArrowDown');
  assert.deepEqual([...input.pressed], ['ArrowDown']);
});
