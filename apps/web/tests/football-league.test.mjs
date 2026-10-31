import test from 'node:test';
import assert from 'node:assert/strict';
import { upcomingFixture, CLUBS, ROUNDS, YOU, newLeague, nextOpponent, normalizeLeague, readLeague, recordResult, seasonFixtures, standings, writeLeague, yourPosition } from '../src/world/footballLeague.mjs';

test('every club meets every other club exactly once, one game each per round', () => {
  const rounds = seasonFixtures();
  assert.equal(rounds.length, ROUNDS);
  const seen = new Set();
  for (const games of rounds) {
    assert.equal(games.length, CLUBS.length / 2);
    assert.equal(new Set(games.flat()).size, CLUBS.length, 'nobody plays twice in a round');
    for (const [a, b] of games) {
      const key = [a, b].sort().join('-');
      assert.ok(!seen.has(key), `${key} only once`);
      seen.add(key);
    }
  }
  assert.equal(seen.size, CLUBS.length * (CLUBS.length - 1) / 2);
});

test('you face a different opponent every round', () => {
  let league = newLeague();
  const opponents = [];
  for (let r = 0; r < ROUNDS; r++) { opponents.push(nextOpponent(league)); league = recordResult(league, 1, 1); }
  assert.equal(new Set(opponents).size, ROUNDS);
  assert.ok(!opponents.includes(YOU));
});

test('a recorded win gives you three points and the whole round is played', () => {
  const league = recordResult(newLeague(), 3, 1);
  assert.equal(league.round, 1);
  assert.equal(league.results.length, CLUBS.length / 2);
  const table = standings(league);
  const you = table.find(r => r.club === YOU);
  assert.deepEqual([you.played, you.won, you.points, you.goalsFor, you.goalsAgainst, you.goalDifference], [1, 1, 3, 3, 1, 2]);
  for (const row of table) assert.equal(row.played, 1);
  const opp = table.find(r => r.club === nextOpponent(newLeague()));
  assert.equal(opp.lost, 1);
  assert.equal(opp.points, 0);
});

test('table sorts by points, then goal difference, then goals scored', () => {
  const league = { ...newLeague(), results: [
    { round: 0, home: 'maple', away: 'creek', homeGoals: 1, awayGoals: 0 },
    { round: 0, home: 'flatirons', away: 'mesa', homeGoals: 4, awayGoals: 0 },
    { round: 0, home: 'pearl', away: 'chautauqua', homeGoals: 2, awayGoals: 2 },
  ] };
  const order = standings(league).map(r => r.club);
  assert.deepEqual(order.slice(0, 2), ['flatirons', 'maple']);
  assert.equal(order.at(-1), 'mesa');
  assert.equal(yourPosition(league), '2nd');
});

test('the season ends with a champion and the next match starts season two', () => {
  let league = newLeague();
  for (let r = 0; r < ROUNDS; r++) league = recordResult(league, 5, 0);
  assert.equal(league.round, ROUNDS);
  assert.deepEqual(league.champions, [{ season: 1, club: YOU }]);
  assert.equal(standings(league)[0].points, ROUNDS * 3);
  league = recordResult(league, 0, 2);
  assert.equal(league.season, 2);
  assert.equal(league.round, 1);
  assert.equal(league.results.length, CLUBS.length / 2);
  assert.equal(league.champions.length, 1, 'past champions kept');
});

test('simulated scores are deterministic and sensible', () => {
  const a = recordResult(newLeague(), 0, 0);
  const b = recordResult(newLeague(), 0, 0);
  assert.deepEqual(a.results, b.results);
  for (const r of a.results) assert.ok(r.homeGoals >= 0 && r.homeGoals <= 6 && r.awayGoals >= 0 && r.awayGoals <= 6);
});

test('saves round-trip and junk is cleaned up', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const league = recordResult(newLeague(), 2, 2);
  assert.ok(writeLeague('c1', league, storage));
  assert.deepEqual(readLeague('c1', storage), league);
  assert.deepEqual(readLeague('missing', storage), newLeague());
  store.set('tld-league-v1:bad', '{not json');
  assert.deepEqual(readLeague('bad', storage), newLeague());
  const cleaned = normalizeLeague({ season: 2, round: 99, results: [{ home: 'maple', away: 'nobody', homeGoals: 1, awayGoals: 0 }, { home: 'maple', away: 'mesa', homeGoals: -1, awayGoals: 0 }] });
  assert.equal(cleaned.round, ROUNDS);
  assert.equal(cleaned.results.length, 0);
  assert.equal(recordResult(newLeague(), -3, 2.7).results.find(r => r.home === YOU || r.away === YOU).homeGoals >= 0, true);
});

test('the next fixture names your opponent and rolls into a new season', () => {
  let league = newLeague();
  assert.deepEqual(upcomingFixture(league), { season: 1, round: 1, rounds: ROUNDS, opponent: nextOpponent(league) });
  for (let r = 0; r < ROUNDS; r++) league = recordResult(league, 1, 0);
  const next = upcomingFixture(league);
  assert.equal(next.season, 2);
  assert.equal(next.round, 1);
  assert.equal(next.opponent, nextOpponent(newLeague()));
});
