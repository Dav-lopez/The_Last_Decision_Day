import type { Ball, Pitch } from './football.mjs';
export type MatchPlayer = { id: string; team: 'home' | 'away'; role: 'keeper' | 'defender' | 'forward'; slot: number; human: boolean; x: number; z: number; vx: number; vz: number; heading: number; cooldown: number;
  /** Set while a keeper is diving (dir = world z side) or getting back up. */
  dive?: { dir: number; t: number } | null };
export type MatchEvent = { type: 'goal' | 'shot' | 'pass' | 'save' | 'fulltime'; team?: 'home' | 'away'; by?: string; score?: { home: number; away: number };
  /** Saves: caught, pushed wide, or taken off an attacker's feet; `dive` when he went full stretch. */
  kind?: 'catch' | 'parry' | 'smother'; dive?: boolean };
export type MatchState = {
  players: MatchPlayer[]; ball: Ball; score: { home: number; away: number }; clock: number;
  phase: 'kickoff' | 'play' | 'goal' | 'fulltime'; pause: number; kickoffTeam: 'home' | 'away'; events: MatchEvent[]; seed?: number;
  /** The side that touched the ball last (for loose balls). */
  lastTouch?: 'home' | 'away' | null;
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
export declare const KEEPER: Readonly<{ reach: number; height: number; saveChance: number; diveReach: number; diveSpeed: number; diveTime: number; downTime: number; reactTime: number }>;
export declare function keeperSpot(team: 'home' | 'away', ball: { x: number; z: number }, pitch?: Pitch): { x: number; z: number };
export declare function keeperDivePose(dive: { dir: number; t: number } | null | undefined): { lean: number; lift: number };
export declare function teamInPossession(players: ReadonlyArray<MatchPlayer>, ball: { x: number; z: number }, lastTouch?: 'home' | 'away' | null): 'home' | 'away' | null;
export declare function supportRunSpot(player: MatchPlayer, ball: { x: number; z: number }, players: ReadonlyArray<MatchPlayer>, pitch?: Pitch): { x: number; z: number };
export declare function markSpot(defenderTeam: 'home' | 'away', attacker: { x: number; z: number }, ball: { x: number; z: number }, pitch?: Pitch): { x: number; z: number };
export declare function shotAim(players: ReadonlyArray<MatchPlayer>, team: 'home' | 'away', ball: { x: number; z: number }, shooterIndex?: number, pitch?: Pitch): number;
export declare function saveMessage(event: MatchEvent, opponentName?: string): string;
