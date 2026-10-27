import { describe, expect, it } from 'vitest';
import { newGame } from './save';
import { speedScale } from './speed';

describe('speedScale', () => {
  it('is normal speed without the purchase', () => {
    const s = { ...newGame(), prestiges: 1, season: 1, bestSeason: 5 };
    expect(speedScale(s, true)).toBe(1);
  });

  it('runs the rest of the race at 5x once both cars are done', () => {
    const s = { ...newGame(), fastRaces: true };
    expect(speedScale(s, false)).toBe(1);
    expect(speedScale(s, true)).toBe(5);
  });

  it('runs at 2x after a prestige until the old season is reached', () => {
    const s = { ...newGame(), fastRaces: true, prestiges: 1, season: 3, bestSeason: 6 };
    expect(speedScale(s, false)).toBe(2);
    expect(speedScale({ ...s, season: 6 }, false)).toBe(1);
    expect(speedScale({ ...s, prestiges: 0 }, false)).toBe(1);
  });

  it('does not stack with the boost', () => {
    const s = { ...newGame(), fastRaces: true, prestiges: 1, season: 3, bestSeason: 6, boostSeconds: 30 };
    expect(speedScale(s, false)).toBe(2);
    expect(speedScale(s, true)).toBe(5);
    expect(speedScale({ ...newGame(), boostSeconds: 30 }, false)).toBe(2);
  });
});
