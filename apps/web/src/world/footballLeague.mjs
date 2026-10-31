/**
 * Five-a-side season: Maple Street Blue (you) and five made-up local clubs play
 * each other once. Each of your matches is one round; the other fixtures of the
 * round are simulated when you finish yours, so the table always moves together.
 * Pure data, saved per character in localStorage.
 */

export const YOU = 'maple';
export const CLUBS = Object.freeze([
  { id: 'maple', name: 'Maple Street Blue', short: 'Blue', strength: 0.5 },
  { id: 'creek', name: 'Boulder Creek Reds', short: 'Creek', strength: 0.55 },
  { id: 'flatirons', name: 'Flatirons FC', short: 'Flatirons', strength: 0.62 },
  { id: 'chautauqua', name: 'Chautauqua Rovers', short: 'Rovers', strength: 0.45 },
  { id: 'pearl', name: 'Pearl Street Wanderers', short: 'Wanderers', strength: 0.5 },
  { id: 'mesa', name: 'Table Mesa United', short: 'Mesa', strength: 0.4 },
]);
const IDS = CLUBS.map(c => c.id);
export const ROUNDS = CLUBS.length - 1;
export const POINTS = Object.freeze({ win: 3, draw: 1, loss: 0 });

export const clubName = id => CLUBS.find(c => c.id === id)?.name ?? id;
export const clubShort = id => CLUBS.find(c => c.id === id)?.short ?? id;

/** Round-robin by the circle method: `ROUNDS` rounds, every club meets every other once. */
export function seasonFixtures() {
  const ring = IDS.slice(1);
  const rounds = [];
  for (let r = 0; r < ROUNDS; r++) {
    const order = [IDS[0], ...ring.slice(r), ...ring.slice(0, r)];
    const games = [];
    for (let i = 0; i < order.length / 2; i++) {
      const a = order[i]; const b = order[order.length - 1 - i];
      games.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(games);
  }
  return rounds;
}

export function newLeague(season = 1, seed = 20261031) {
  return { season, round: 0, results: [], seed: seed >>> 0 || 1, champions: [] };
}

/** Your opponent this round (or null between seasons, which can't happen: a finished season rolls over). */
export function nextOpponent(league) {
  const games = seasonFixtures()[league.round] ?? [];
  const mine = games.find(g => g.includes(YOU));
  return mine ? mine.find(id => id !== YOU) : null;
}

/** The match you play next: a finished season rolls over to round 1 of the next. */
export function upcomingFixture(league) {
  const state = normalizeLeague(league);
  const fresh = state.round >= ROUNDS;
  const view = fresh ? newLeague(state.season + 1) : state;
  return { season: view.season, round: view.round + 1, rounds: ROUNDS, opponent: nextOpponent(view) };
}

const nextRandom = seed => { const next = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return { seed: next, value: next / 4294967296 }; };
/** A plausible five-a-side score from relative strength: 0–5 goals each. */
function simulateGoals(seed, attack, defence) {
  let goals = 0; let s = seed;
  for (let chance = 0; chance < 6; chance++) {
    const roll = nextRandom(s); s = roll.seed;
    if (roll.value < 0.28 + (attack - defence) * 0.5) goals++;
  }
  return { goals, seed: s };
}

/**
 * Record your full-time score against this round's opponent, simulate the
 * round's other games, and move on. After the last round the champion is
 * remembered and the next record starts a new season.
 */
export function recordResult(league, yourGoals, theirGoals) {
  let state = normalizeLeague(league);
  if (state.round >= ROUNDS) state = { ...newLeague(state.season + 1, state.seed), champions: state.champions };
  const goalsFor = clampGoals(yourGoals); const goalsAgainst = clampGoals(theirGoals);
  const games = seasonFixtures()[state.round];
  let seed = state.seed;
  const results = [...state.results];
  for (const [home, away] of games) {
    if (home === YOU) results.push({ round: state.round, home, away, homeGoals: goalsFor, awayGoals: goalsAgainst });
    else if (away === YOU) results.push({ round: state.round, home, away, homeGoals: goalsAgainst, awayGoals: goalsFor });
    else {
      const h = CLUBS.find(c => c.id === home).strength; const a = CLUBS.find(c => c.id === away).strength;
      const hg = simulateGoals(seed, h + 0.04, a); seed = hg.seed; // a small home advantage
      const ag = simulateGoals(seed, a, h); seed = ag.seed;
      results.push({ round: state.round, home, away, homeGoals: hg.goals, awayGoals: ag.goals });
    }
  }
  const next = { ...state, round: state.round + 1, results, seed };
  if (next.round >= ROUNDS) {
    const champion = standings(next)[0].club;
    return { ...next, champions: [...state.champions, { season: state.season, club: champion }].slice(-10) };
  }
  return next;
}
const clampGoals = g => Math.max(0, Math.min(99, Math.floor(Number(g) || 0)));

/** League table: points, then goal difference, then goals scored, then name. */
export function standings(league) {
  const rows = new Map(CLUBS.map(c => [c.id, { club: c.id, name: c.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }]));
  for (const r of league?.results ?? []) {
    const home = rows.get(r.home); const away = rows.get(r.away);
    if (!home || !away) continue;
    for (const [row, f, a] of [[home, r.homeGoals, r.awayGoals], [away, r.awayGoals, r.homeGoals]]) {
      row.played++; row.goalsFor += f; row.goalsAgainst += a; row.goalDifference = row.goalsFor - row.goalsAgainst;
      if (f > a) { row.won++; row.points += POINTS.win; } else if (f === a) { row.drawn++; row.points += POINTS.draw; } else row.lost++;
    }
  }
  return [...rows.values()].sort((x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor || x.name.localeCompare(y.name));
}

/** Where you sit, as "1st", "2nd"… */
export function yourPosition(league) {
  const n = standings(league).findIndex(r => r.club === YOU) + 1;
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

export function normalizeLeague(raw) {
  if (!raw || typeof raw !== 'object') return newLeague();
  const season = Number.isInteger(raw.season) && raw.season > 0 ? raw.season : 1;
  const round = Number.isInteger(raw.round) ? Math.max(0, Math.min(ROUNDS, raw.round)) : 0;
  const results = Array.isArray(raw.results) ? raw.results.filter(r => r && IDS.includes(r.home) && IDS.includes(r.away) && r.home !== r.away
    && Number.isInteger(r.homeGoals) && Number.isInteger(r.awayGoals) && r.homeGoals >= 0 && r.awayGoals >= 0)
    .map(r => ({ round: Number.isInteger(r.round) ? r.round : 0, home: r.home, away: r.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals })) : [];
  const champions = Array.isArray(raw.champions) ? raw.champions.filter(c => c && IDS.includes(c.club) && Number.isInteger(c.season)).slice(-10) : [];
  const seed = Number.isInteger(raw.seed) && raw.seed > 0 ? raw.seed >>> 0 : 20261031;
  return { season, round, results, seed, champions };
}

const KEY = 'tld-league-v1:';
export function readLeague(characterId, storage = globalThis.localStorage) {
  try { return normalizeLeague(JSON.parse(storage?.getItem(KEY + characterId) ?? 'null')); } catch { return newLeague(); }
}
export function writeLeague(characterId, league, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY + characterId, JSON.stringify(normalizeLeague(league))); return true; } catch { return false; }
}
