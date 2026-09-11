import type { GameState, Move, MoveOutcome, Side } from '../types';
import { LOOP_LEN, SAFE_CELLS, loopCellIndex } from './board';

/**
 * Piece progress encoding:
 *   -1                       piece is at base, not yet entered
 *   0 .. SHARED_MAX           on the shared loop, relative to this side's start
 *   SHARED_STEPS .. FINISH-1  in this side's private home stretch
 *   FINISH                    home / finished
 */
export const SHARED_STEPS = LOOP_LEN - 1; // number of distinct shared-track positions (55)
export const SHARED_MAX = SHARED_STEPS - 1; // highest shared-track progress value (54)
export const HOME_LEN = 6;
export const FINISH = SHARED_STEPS + HOME_LEN; // 61

export function otherSide(side: Side): Side {
  return side === 'player' ? 'ai' : 'player';
}

function freshPieces(): number[] {
  return [-1, -1, -1, -1];
}

export function newGameState(): GameState {
  return {
    pieces: { player: freshPieces(), ai: freshPieces() },
    turn: 'player',
    stats: {
      player: { captures: 0, turns: 0, special: 0, distance: 0, longestSafeStreak: 0, curSafeStreak: 0 },
      ai: { captures: 0, turns: 0, special: 0, distance: 0, longestSafeStreak: 0, curSafeStreak: 0 }
    },
    startTime: Date.now(),
    over: false,
    winner: null
  };
}

/**
 * All legal moves for `side` given a rolled `score`. A piece at base can
 * only enter on a special throw (4 or 6), landing exactly on the start
 * cell. A piece on the board must land exactly on FINISH or a shared/home
 * cell -- overshooting is not a legal move. Landing exactly on an
 * opponent's piece on an unprotected shared cell captures it.
 */
export function legalMoves(state: Pick<GameState, 'pieces'>, side: Side, score: number): Move[] {
  const moves: Move[] = [];
  const mine = state.pieces[side];
  const theirs = state.pieces[otherSide(side)];

  for (let i = 0; i < 4; i++) {
    const p = mine[i];

    if (p === -1) {
      if (score === 4 || score === 6) {
        // Entering occupies the side's own start cell (progress 0) -
        // blocked if a piece of the same side is already sitting there.
        if (mine.some(q => q === 0)) continue;
        moves.push({ pieceIndex: i, kind: 'enter', newProgress: 0, capture: null, willFinish: false });
      }
      continue;
    }

    if (p === FINISH) continue;

    const np = p + score;
    if (np > FINISH) continue; // must land exactly, no overshoot

    // Blocked by own piece at the destination. The home/finish cell is
    // exempt -- all four pieces are allowed to stack there, that's how
    // you win.
    if (np !== FINISH && mine.some((q, qi) => qi !== i && q === np)) continue;

    let capture: number | null = null;
    if (np <= SHARED_MAX) {
      const destGlobal = loopCellIndex(side, np);
      if (!SAFE_CELLS.has(destGlobal)) {
        for (let j = 0; j < 4; j++) {
          const tp = theirs[j];
          if (tp >= 0 && tp <= SHARED_MAX && loopCellIndex(otherSide(side), tp) === destGlobal) {
            capture = j;
            break;
          }
        }
      }
    }

    moves.push({ pieceIndex: i, kind: 'advance', newProgress: np, capture, willFinish: np === FINISH });
  }

  return moves;
}

/** Applies a move to `state` in place and returns what happened. */
export function applyMove(state: GameState, side: Side, move: Move): MoveOutcome {
  const mine = state.pieces[side];
  const before = mine[move.pieceIndex];
  mine[move.pieceIndex] = move.newProgress;

  let capturedSide: Side | null = null;
  let capturedIndex: number | null = null;

  if (move.capture !== null) {
    capturedSide = otherSide(side);
    capturedIndex = move.capture;
    state.pieces[capturedSide][move.capture] = -1;
    state.stats[side].captures++;
  }

  if (move.kind === 'advance') {
    state.stats[side].distance += move.newProgress - before;
  }
  const onSafe = move.newProgress <= SHARED_MAX && SAFE_CELLS.has(loopCellIndex(side, move.newProgress));
  if (onSafe || move.willFinish) {
    state.stats[side].curSafeStreak++;
  } else {
    state.stats[side].curSafeStreak = 0;
  }
  state.stats[side].longestSafeStreak = Math.max(state.stats[side].longestSafeStreak, state.stats[side].curSafeStreak);

  if (mine.every(v => v === FINISH)) {
    state.over = true;
    state.winner = side;
  }

  return { capturedSide, capturedIndex, finished: move.willFinish };
}

export function piecesHome(state: Pick<GameState, 'pieces'>, side: Side): number {
  return state.pieces[side].filter(v => v === FINISH).length;
}

export function piecesOnBoard(state: Pick<GameState, 'pieces'>, side: Side): number {
  return state.pieces[side].filter(v => v >= 0 && v < FINISH).length;
}
