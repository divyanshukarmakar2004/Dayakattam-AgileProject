import type { Difficulty, Move, Side } from '../types';
import { SAFE_CELLS, loopCellIndex } from '../game/board';
import { legalMoves, otherSide, SHARED_MAX, FINISH } from '../game/rules';
import { RNG, ROLL_PROB } from '../game/dice';

type Pieces = { player: number[]; ai: number[] };

function stateKey(pieces: Pieces, side: Side): string {
  return side[0] + '|' + pieces.player.join(',') + '|' + pieces.ai.join(',');
}

/** Count of `side`'s pieces on the open loop, unsafe, and reachable next turn by the opponent. */
export function vulnerability(pieces: Pieces, side: Side): number {
  const opp = otherSide(side);
  let exposed = 0;
  for (const p of pieces[side]) {
    if (p < 0 || p > SHARED_MAX) continue;
    const g = loopCellIndex(side, p);
    if (SAFE_CELLS.has(g)) continue;
    let reachable = false;
    for (const s of [1, 4, 6]) {
      for (const op of pieces[opp]) {
        if (op < 0 || op > SHARED_MAX) continue;
        const npOpp = op + s;
        if (npOpp <= SHARED_MAX && loopCellIndex(opp, npOpp) === g) {
          reachable = true;
          break;
        }
      }
      if (reachable) break;
    }
    if (reachable) exposed++;
  }
  return exposed;
}

/**
 * Evaluation function: pieces home are worth the most, progress along the
 * track counts, pieces in the home stretch or on a safe cell get a small
 * bonus, and exposed pieces are penalised. Symmetric across both sides so
 * it can score from either side's perspective.
 */
export function heuristic(pieces: Pieces, perspective: Side): number {
  const opp = otherSide(perspective);
  function sideScore(side: Side): number {
    let s = 0;
    for (const p of pieces[side]) {
      if (p === FINISH) {
        s += 120;
      } else if (p >= 0) {
        s += p * 1.6;
        if (p > SHARED_MAX) s += 20; // in home stretch, safe from capture
        else if (SAFE_CELLS.has(loopCellIndex(side, p))) s += 6;
      }
    }
    s -= vulnerability(pieces, side) * 14;
    return s;
  }
  return sideScore(perspective) - sideScore(opp);
}

/**
 * Expectimax search with chance nodes for the dice distribution. Every
 * dice throw costs one ply of search depth, regardless of who rolls next
 * -- extra turns do NOT get a free depth, which is what bounds the
 * recursion (a chain of special throws can't blow the call stack or the
 * transposition table).
 */
function search(pieces: Pieces, sideToRoll: Side, perspective: Side, depth: number, cache: Map<string, number>): number {
  if (depth <= 0) return heuristic(pieces, perspective);

  const key = depth + '|' + stateKey(pieces, sideToRoll);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let expected = 0;
  for (const scoreVal of [1, 4, 6] as const) {
    const p = ROLL_PROB[scoreVal];
    const moves = legalMoves({ pieces }, sideToRoll, scoreVal);
    let branchVal: number;

    if (moves.length === 0) {
      // Pass turn -- no extra even on a special throw since nothing happened.
      branchVal = search(pieces, otherSide(sideToRoll), perspective, depth - 1, cache);
    } else {
      const isMaximizer = sideToRoll === perspective;
      let best = isMaximizer ? -Infinity : Infinity;
      for (const mv of moves) {
        const np: Pieces = { player: pieces.player.slice(), ai: pieces.ai.slice() };
        np[sideToRoll][mv.pieceIndex] = mv.newProgress;
        if (mv.capture !== null) np[otherSide(sideToRoll)][mv.capture] = -1;

        const extraTurn = scoreVal === 4 || scoreVal === 6;
        const nextSide = extraTurn ? sideToRoll : otherSide(sideToRoll);
        const v = search(np, nextSide, perspective, depth - 1, cache);
        if (isMaximizer) { if (v > best) best = v; } else { if (v < best) best = v; }
      }
      branchVal = best;
    }
    expected += p * branchVal;
  }

  cache.set(key, expected);
  return expected;
}

interface DifficultyConfig {
  depth: number;
  noise: number;
}

const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: { depth: 1, noise: 26 },
  medium: { depth: 2, noise: 10 },
  hard: { depth: 3, noise: 3 },
  expert: { depth: 4, noise: 0 }
};

/**
 * Chooses a move for `side` given the current state, the rolled score, and
 * a difficulty level. The AI sees only the same public state and rolls
 * from the same dice mechanism as a human player -- it never previews
 * future rolls or bends the rules in its own favour.
 */
export function chooseMove(
  state: { pieces: Pieces },
  score: number,
  difficulty: Difficulty,
  side: Side = 'ai'
): Move | null {
  const opp = otherSide(side);
  const moves = legalMoves(state, side, score);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.medium;
  const cache = new Map<string, number>();
  const start = Date.now();
  const budgetMs = 900;

  let best: Move | null = null;
  let bestVal = -Infinity;

  for (const mv of moves) {
    const np: Pieces = { player: state.pieces.player.slice(), ai: state.pieces.ai.slice() };
    np[side][mv.pieceIndex] = mv.newProgress;
    if (mv.capture !== null) np[opp][mv.capture] = -1;

    const extraTurn = score === 4 || score === 6;
    const nextSide = extraTurn ? side : opp;

    let d = cfg.depth;
    if (Date.now() - start > budgetMs) d = Math.max(1, d - 1); // simple time-budget backoff

    let val = search(np, nextSide, side, d, cache);
    if (cfg.noise > 0) val += ((RNG.int(2001) - 1000) / 1000) * cfg.noise;

    if (val > bestVal) { bestVal = val; best = mv; }
  }

  return best;
}
