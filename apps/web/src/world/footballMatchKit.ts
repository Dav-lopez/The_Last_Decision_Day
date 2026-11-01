/**
 * Five-a-side match rules and the ten match players: loaded when you start a league match, not at start-up.
 * (The kick-about ball and the league table stay in WorldScene; they're needed as soon as you reach the pitch.)
 */
export { createMatch, formatClock as formatMatchClock, saveMessage, stepMatch } from './footballMatch.mjs';
export { loadFootballPlayers } from './footballPlayers';
