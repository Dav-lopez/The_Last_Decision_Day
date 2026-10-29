import assert from 'node:assert/strict';
import test from 'node:test';
import { createSchoolActionGate } from '../src/schoolActionGate.mjs';

test('only the newest preview can update the UI', () => {
  const gate = createSchoolActionGate();
  const first = gate.beginPreview();
  const second = gate.beginPreview();
  assert.equal(gate.isCurrentPreview(first), false);
  assert.equal(gate.isCurrentPreview(second), true);
});

test('execution rejects double taps and invalidates outstanding previews', () => {
  const gate = createSchoolActionGate();
  const preview = gate.beginPreview();
  const ticket = gate.beginExecution();
  assert.equal(gate.beginExecution(), null);
  assert.equal(gate.beginPreview(), null);
  assert.equal(gate.isCurrentPreview(preview), false);
  gate.endExecution(ticket);
  assert.notEqual(gate.beginExecution(), null);
});

test('logout or account switch invalidates pending requests', () => {
  const gate = createSchoolActionGate();
  const preview = gate.beginPreview();
  const oldExecution = gate.beginExecution();
  gate.resetSession();
  assert.equal(gate.isCurrentSession(oldExecution), false);
  assert.equal(gate.isCurrentPreview(preview), false);
  const newExecution = gate.beginExecution();
  gate.endExecution(oldExecution);
  assert.equal(gate.beginExecution(), null);
  gate.endExecution(newExecution);
  assert.notEqual(gate.beginExecution(), null);
});
