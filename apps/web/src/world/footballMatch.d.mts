import type { Ball, Pitch } from './football.mjs';
export type MatchPlayer = { id: string; team: 'home' | 'away'; role: 'keeper' | 'defender' | 'forward'; slot: number; human: boolean; x: number; z: number; vx: number; vz: number; heading: number; cooldown: number };
export type MatchEvent = { type: 'goal' | 'shot' | 'pass' | 'save' | 'fulltime'; team?: 'home' | 'away'; by?: string; score?: { home: number; away: number } };
export type MatchState = {
  players: MatchPlayer[]; ball: Ball; score: { home: number; away: number }; clock: number;
  phase: 'kickoff' | 'play' | 'goal' | 'fulltime'; pause: number; kickoffTeam: 'home' | 'away'; events: MatchEvent[]; seed?: number;
};
export declare const MATCH: Readonly<Record<string, number>>;
export declare const BALL_RADIUS: number;
export declare function formationSpot(player: MatchPlayer, ball: Ball, pitch?: Pitch): { x: number; z: number };
export declare function createMatch(pitch?: Pitch): MatchState;
export declare function kickoff(state: MatchState, team: 'home' | 'away', pitch?: Pitch): MatchState;
export declare function passSpeed(distance: number): number;
export declare function passBall(ball: Ball, from: { x: number; z: number }, to: { x: number; z: number }): Ball;
export declare function bestPassTarget(state: { players: MatchPlayer[] }, passer: MatchPlayer): MatchPlayer | null;
export declare function stepMatch(state: MatchState, seconds: number,
  you?: { x: number; z: number; vx: number; vz: number; heading: number } | null,
  actions?: { shoot?: boolean; chip?: boolean; pass?: boolean }, pitch?: Pitch): MatchState;
export declare function formatClock(seconds: number): string;
export declare const KEEPER: Readonly<{ reach: number; height: number; saveChance: number }>;
