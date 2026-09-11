import type { RollResult } from '../types';

/**
 * Randomness source for the Dayam throw. Uses the Web Crypto API so every
 * throw is generated independently before any animation runs -- the visual
 * tumble never determines the outcome, it only resolves to it.
 */
export const RNG = {
  bit(): 0 | 1 {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return (a[0] & 1) as 0 | 1;
  },
  int(maxExclusive: number): number {
    const a = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    let v: number;
    do {
      crypto.getRandomValues(a);
      v = a[0];
    } while (v >= limit);
    return v % maxExclusive;
  }
};

/**
 * Two brass Dayam pieces are thrown together. Each lands showing its marked
 * or plain face (50/50). The count of marked faces (0, 1 or 2) decides the
 * move. Both "all marked" and "none marked" are special throws that grant
 * another roll.
 */
export const ROLL_TABLE: RollResult[] = [
  { marked: 0, score: 6, extra: true, label: '6 — Special throw' },
  { marked: 1, score: 1, extra: false, label: '1' },
  { marked: 2, score: 4, extra: true, label: '4 — Special throw' }
];

export const ROLL_PROB: Record<number, number> = { 1: 0.5, 4: 0.25, 6: 0.25 };

export function rollDayam(): RollResult {
  const marked = RNG.bit() + RNG.bit();
  const result = ROLL_TABLE.find(r => r.marked === marked);
  if (!result) throw new Error('unreachable: marked count out of range');
  return result;
}
