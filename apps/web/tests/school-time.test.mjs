import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/schoolTime.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { millisecondsUntilReset, canStartSchoolActivity } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const reset = '2026-10-24T00:00:00.000Z';
const balance = { dailyLimit: 8, spent: 6, remaining: 2, resetsAt: reset };
const before = Date.parse('2026-10-23T23:59:59.000Z');
const after = Date.parse(reset);

test('permits affordable activities before UTC midnight and rejects unaffordable ones', () => {
  assert.equal(canStartSchoolActivity(balance, 1, before), true);
  assert.equal(canStartSchoolActivity(balance, 2, before), true);
  assert.equal(canStartSchoolActivity(balance, 3, before), false);
  assert.equal(canStartSchoolActivity(balance, 0, before), false);
  assert.equal(canStartSchoolActivity(balance, Number.NaN, before), false);
});

test('rejects stale balance exactly at UTC reset and afterwards', () => {
  assert.equal(millisecondsUntilReset(balance, before), 1000);
  assert.equal(millisecondsUntilReset(balance, after), 0);
  assert.equal(canStartSchoolActivity(balance, 1, after), false);
  assert.equal(canStartSchoolActivity(balance, 1, after + 5000), false);
});

test('rejects missing or malformed server time rather than permitting stale actions', () => {
  assert.equal(canStartSchoolActivity(null, 1, before), false);
  assert.equal(millisecondsUntilReset(null, before), null);
  const malformed = { ...balance, resetsAt: 'invalid-date' };
  assert.equal(millisecondsUntilReset(malformed, before), null);
  assert.equal(canStartSchoolActivity(malformed, 1, before), false);
  assert.equal(canStartSchoolActivity({ ...balance, remaining: -1 }, 1, before), false);
});
