import type { Side, Cell, WorldPos } from '../types';

/**
 * 56-cell cross-shaped shared loop on a 15x15 logical grid (row, col).
 * Every consecutive cell -- including the wrap from the last entry back to
 * the first -- is a true single-step grid neighbour (row or col differs by
 * exactly 1). This is verified in tests/board.test.ts so pieces never
 * visually jump diagonally across a board corner.
 */
export const LOOP: Cell[] = [
  { row: 6, col: 0 }, { row: 6, col: 1 }, { row: 6, col: 2 }, { row: 6, col: 3 }, { row: 6, col: 4 }, { row: 6, col: 5 },
  { row: 6, col: 6 }, { row: 5, col: 6 }, { row: 4, col: 6 }, { row: 3, col: 6 }, { row: 2, col: 6 }, { row: 1, col: 6 },
  { row: 0, col: 6 }, { row: 0, col: 7 }, { row: 0, col: 8 }, { row: 1, col: 8 }, { row: 2, col: 8 }, { row: 3, col: 8 },
  { row: 4, col: 8 }, { row: 5, col: 8 }, { row: 6, col: 8 }, { row: 6, col: 9 }, { row: 6, col: 10 }, { row: 6, col: 11 },
  { row: 6, col: 12 }, { row: 6, col: 13 }, { row: 6, col: 14 }, { row: 7, col: 14 }, { row: 8, col: 14 }, { row: 8, col: 13 },
  { row: 8, col: 12 }, { row: 8, col: 11 }, { row: 8, col: 10 }, { row: 8, col: 9 }, { row: 8, col: 8 }, { row: 9, col: 8 },
  { row: 10, col: 8 }, { row: 11, col: 8 }, { row: 12, col: 8 }, { row: 13, col: 8 }, { row: 14, col: 8 }, { row: 14, col: 7 },
  { row: 14, col: 6 }, { row: 13, col: 6 }, { row: 12, col: 6 }, { row: 11, col: 6 }, { row: 10, col: 6 }, { row: 9, col: 6 },
  { row: 8, col: 6 }, { row: 8, col: 5 }, { row: 8, col: 4 }, { row: 8, col: 3 }, { row: 8, col: 2 }, { row: 8, col: 1 },
  { row: 8, col: 0 }, { row: 7, col: 0 }
]; // 56 entries, index 0..55

export const LOOP_LEN = LOOP.length; // 56

/** Cells (by loop index) protected from capture. */
export const SAFE_CELLS: ReadonlySet<number> = new Set([0, 8, 14, 22, 28, 36, 42, 50]);

export interface SideLayout {
  key: Side;
  label: string;
  color: number;
  colorHex: string;
  startIndex: number;
  homeStretch: Cell[];
  base: Cell[];
  homeCell: Cell;
}

export const SIDES: Record<Side, SideLayout> = {
  player: {
    key: 'player',
    label: 'You',
    color: 0xa5432b,
    colorHex: '#a5432b',
    startIndex: 0,
    homeStretch: [{ row: 7, col: 1 }, { row: 7, col: 2 }, { row: 7, col: 3 }, { row: 7, col: 4 }, { row: 7, col: 5 }, { row: 7, col: 6 }],
    base: [{ row: 10, col: 2 }, { row: 10, col: 3 }, { row: 11, col: 2 }, { row: 11, col: 3 }],
    homeCell: { row: 7, col: 7 }
  },
  ai: {
    key: 'ai',
    label: 'AI',
    color: 0x2e3e63,
    colorHex: '#2e3e63',
    startIndex: 14,
    homeStretch: [{ row: 1, col: 7 }, { row: 2, col: 7 }, { row: 3, col: 7 }, { row: 4, col: 7 }, { row: 5, col: 7 }, { row: 6, col: 7 }],
    base: [{ row: 2, col: 10 }, { row: 2, col: 11 }, { row: 3, col: 10 }, { row: 3, col: 11 }],
    homeCell: { row: 7, col: 7 }
  }
};

/** Decorative-only unused arms (south + east), rendered for visual completeness only. */
export const DECOR_BASES: Cell[][] = [
  [{ row: 10, col: 10 }, { row: 10, col: 11 }, { row: 11, col: 10 }, { row: 11, col: 11 }],
  [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 3, col: 2 }, { row: 3, col: 3 }]
];

export function cellWorld(row: number, col: number): WorldPos {
  return { x: (col - 7) * 1.0, z: (row - 7) * 1.0 };
}

/** Global loop cell index for a piece's relative progress along the shared track. */
export function loopCellIndex(side: Side, progress: number): number {
  return (SIDES[side].startIndex + progress) % LOOP_LEN;
}
