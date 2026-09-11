export type Side = 'player' | 'ai';

export interface RollResult {
  marked: 0 | 1 | 2;
  score: 1 | 4 | 6;
  extra: boolean;
  label: string;
}

export interface Move {
  pieceIndex: number;
  kind: 'enter' | 'advance';
  newProgress: number;
  capture: number | null; // index of captured opponent piece, or null
  willFinish: boolean;
}

export interface SideStats {
  captures: number;
  turns: number;
  special: number;
  distance: number;
  longestSafeStreak: number;
  curSafeStreak: number;
}

export interface GameState {
  pieces: { player: number[]; ai: number[] };
  turn: Side;
  stats: { player: SideStats; ai: SideStats };
  startTime: number;
  over: boolean;
  winner: Side | null;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface MoveOutcome {
  capturedSide: Side | null;
  capturedIndex: number | null;
  finished: boolean;
}

export interface Cell {
  row: number;
  col: number;
}

export interface WorldPos {
  x: number;
  z: number;
}
