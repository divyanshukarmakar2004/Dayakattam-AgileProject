import { describe, it, expect } from 'vitest';
import { LOOP, LOOP_LEN } from '../src/game/board';

describe('board topology', () => {
  it('has 56 cells', () => {
    expect(LOOP_LEN).toBe(56);
    expect(LOOP.length).toBe(56);
  });

  it('every consecutive cell (including the wrap) is a true grid neighbour', () => {
    let badAdjacencies = 0;
    for (let i = 0; i < LOOP.length; i++) {
      const a = LOOP[i];
      const b = LOOP[(i + 1) % LOOP.length];
      const dr = Math.abs(a.row - b.row);
      const dc = Math.abs(a.col - b.col);
      const isNeighbour = (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
      if (!isNeighbour) badAdjacencies++;
    }
    expect(badAdjacencies).toBe(0);
  });

  it('has no duplicate cells in the loop', () => {
    const seen = new Set(LOOP.map(c => `${c.row},${c.col}`));
    expect(seen.size).toBe(LOOP.length);
  });
});
