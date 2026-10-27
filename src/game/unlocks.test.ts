import { describe, expect, it } from 'vitest';
import { UNLOCK_SEASONS, isUnlocked, lockLabel } from './unlocks';
import { pickAutoDevelopment } from './auto';
import { newGame } from './save';

describe('feature unlocks', () => {
  it('a new team has everything locked except the basics', () => {
    const s = newGame();
    for (const f of Object.keys(UNLOCK_SEASONS) as (keyof typeof UNLOCK_SEASONS)[]) expect(isUnlocked(s, f)).toBe(false);
  });

  it('unlocks at the chosen seasons', () => {
    const at = (season: number) => ({ season, bestSeason: 1 });
    expect(isUnlocked(at(2), 'sponsors')).toBe(true);
    expect(isUnlocked(at(2), 'fanEvent')).toBe(true);
    expect(isUnlocked(at(3), 'engineer')).toBe(true);
    expect(isUnlocked(at(4), 'driver')).toBe(false);
    expect(isUnlocked(at(5), 'driver')).toBe(true);
    expect(isUnlocked(at(10), 'development')).toBe(true);
    expect(isUnlocked(at(14), 'staff')).toBe(false);
    expect(isUnlocked(at(15), 'staff')).toBe(true);
    expect(isUnlocked(at(19), 'facilities')).toBe(false);
    expect(isUnlocked(at(20), 'facilities')).toBe(true);
  });

  it('stays unlocked after a prestige drops the season back to 1', () => {
    expect(isUnlocked({ season: 1, bestSeason: 20 }, 'facilities')).toBe(true);
  });

  it('labels the season it unlocks in', () => {
    expect(lockLabel('staff')).toBe('UNLOCKS IN SEASON 15');
  });

  it('Auto Buy does not start development before it unlocks', () => {
    const s = { ...newGame(), money: 1e12, race: 1, season: 9, bestSeason: 1 };
    expect(pickAutoDevelopment(s, 10)).toBeNull();
    expect(pickAutoDevelopment({ ...s, season: 10 }, 10)).not.toBeNull();
  });
});
