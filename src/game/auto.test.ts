import { describe, expect, it } from 'vitest';
import { pickAutoBuy, shouldAutoPit } from './auto';
import { upgradeCost, UPGRADE_DEFS } from './economy';
import { newStrategy, startPit } from './strategy';

describe('auto', () => {
  it('buys nothing when broke', () => {
    expect(pickAutoBuy(0, {})).toBeNull();
  });

  it('picks the best rating per dollar among affordable upgrades', () => {
    const engine = UPGRADE_DEFS[0];
    const pick = pickAutoBuy(upgradeCost(engine, 0), {});
    expect(pick?.key).toBe('engine');
  });

  it('skips upgrades it cannot afford', () => {
    const pick = pickAutoBuy(upgradeCost(UPGRADE_DEFS[0], 0) - 1, {});
    expect(pick?.key).not.toBe('engine');
  });

  it('pits only when worn, not already pitting, and not near the end', () => {
    const s = newStrategy();
    expect(shouldAutoPit(s, 1, 5)).toBe(false);
    s.wear = 0.8;
    expect(shouldAutoPit(s, 1, 5)).toBe(true);
    expect(shouldAutoPit(s, 4.5, 5)).toBe(false);
    startPit(s, 0);
    expect(shouldAutoPit(s, 1, 5)).toBe(false);
  });
});
