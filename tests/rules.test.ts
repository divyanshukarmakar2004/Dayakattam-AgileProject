import { describe, it, expect } from 'vitest';
import { newGameState, legalMoves, applyMove, otherSide, FINISH, SHARED_MAX } from '../src/game/rules';
import { loopCellIndex, SAFE_CELLS } from '../src/game/board';
import { rollDayam } from '../src/game/dice';

describe('entering from base', () => {
  it('cannot enter on a roll of 1', () => {
    const s = newGameState();
    expect(legalMoves(s, 'player', 1)).toHaveLength(0);
  });

  it('can enter on a roll of 4 or 6', () => {
    const s = newGameState();
    expect(legalMoves(s, 'player', 4)).toHaveLength(4);
    expect(legalMoves(s, 'player', 6)).toHaveLength(4);
  });

  it('is blocked once a piece already occupies the start cell', () => {
    const s = newGameState();
    s.pieces.player[0] = 0;
    const moves = legalMoves(s, 'player', 4);
    // only the on-board piece (advancing) is legal; the other 3 base pieces can't enter
    expect(moves).toHaveLength(1);
    expect(moves[0].pieceIndex).toBe(0);
    expect(moves[0].kind).toBe('advance');
  });
});

describe('movement', () => {
  it('never allows overshooting past FINISH', () => {
    const s = newGameState();
    s.pieces.player = [FINISH - 2, -1, -1, -1];
    const advanceMoves = legalMoves(s, 'player', 6).filter(m => m.pieceIndex === 0);
    expect(advanceMoves).toHaveLength(0);
  });

  it('allows landing exactly on FINISH', () => {
    const s = newGameState();
    s.pieces.player = [FINISH - 4, -1, -1, -1];
    const moves = legalMoves(s, 'player', 4).filter(m => m.pieceIndex === 0);
    expect(moves).toHaveLength(1);
    expect(moves[0].willFinish).toBe(true);
  });

  it('blocks landing on your own piece (except at FINISH, where pieces stack)', () => {
    const s = newGameState();
    s.pieces.player = [10, 14, -1, -1]; // piece1 sits exactly where piece0+4 would land
    const moves = legalMoves(s, 'player', 4);
    expect(moves.find(m => m.pieceIndex === 0)).toBeUndefined();
  });
});

describe('capturing', () => {
  it('captures an opponent piece landing exactly on an unsafe shared cell', () => {
    const s = newGameState();
    let unsafeProg = -1;
    for (let p = 0; p <= SHARED_MAX; p++) {
      if (!SAFE_CELLS.has(loopCellIndex('player', p))) { unsafeProg = p; break; }
    }
    s.pieces.player = [unsafeProg, -1, -1, -1];
    const targetGlobal = loopCellIndex('player', unsafeProg);

    let setup: { p2: number; score: number } | null = null;
    outer: for (let p2 = 0; p2 <= SHARED_MAX; p2++) {
      for (const score of [1, 4, 6]) {
        if (p2 + score <= SHARED_MAX && loopCellIndex('ai', p2 + score) === targetGlobal) {
          setup = { p2, score };
          break outer;
        }
      }
    }
    expect(setup).not.toBeNull();
    s.pieces.ai = [setup!.p2, -1, -1, -1];

    const mv = legalMoves(s, 'ai', setup!.score).find(m => m.pieceIndex === 0)!;
    expect(mv.capture).toBe(0);
    const outcome = applyMove(s, 'ai', mv);
    expect(outcome.capturedSide).toBe('player');
    expect(s.pieces.player[0]).toBe(-1);
  });

  it('never captures on a safe cell', () => {
    const s = newGameState();
    let safeProg = -1;
    for (let p = 0; p <= SHARED_MAX; p++) {
      if (SAFE_CELLS.has(loopCellIndex('player', p))) { safeProg = p; break; }
    }
    s.pieces.player = [safeProg, -1, -1, -1];
    const targetGlobal = loopCellIndex('player', safeProg);

    let setup: { p2: number; score: number } | null = null;
    outer: for (let p2 = 0; p2 <= SHARED_MAX; p2++) {
      for (const score of [1, 4, 6]) {
        if (p2 + score <= SHARED_MAX && loopCellIndex('ai', p2 + score) === targetGlobal) {
          setup = { p2, score };
          break outer;
        }
      }
    }
    if (setup) {
      s.pieces.ai = [setup.p2, -1, -1, -1];
      const mv = legalMoves(s, 'ai', setup.score).find(m => m.pieceIndex === 0);
      expect(mv?.capture ?? null).toBeNull();
    }
  });
});

describe('winning', () => {
  it('declares a winner once all four pieces reach FINISH', () => {
    const s = newGameState();
    s.pieces.player = [FINISH, FINISH, FINISH, FINISH - 6];
    const mv = { pieceIndex: 3, kind: 'advance' as const, newProgress: FINISH, capture: null, willFinish: true };
    applyMove(s, 'player', mv);
    expect(s.over).toBe(true);
    expect(s.winner).toBe('player');
  });
});

describe('full random-legal-move playouts', () => {
  it('every game terminates within a generous turn cap', () => {
    for (let i = 0; i < 60; i++) {
      const s = newGameState();
      let turns = 0;
      while (!s.over && turns < 20000) {
        turns++;
        const roll = rollDayam();
        const moves = legalMoves(s, s.turn, roll.score);
        let extra = roll.extra;
        if (moves.length === 0) {
          extra = false;
        } else {
          applyMove(s, s.turn, moves[Math.floor(Math.random() * moves.length)]);
        }
        if (s.over) break;
        if (!extra) s.turn = otherSide(s.turn);
      }
      expect(s.over).toBe(true);
    }
  });
});
