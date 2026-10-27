import { describe, expect, it } from 'vitest';
import { autoCompound, autoSelectCompound, pickAutoBuy, shouldAutoPit } from './auto';
import { upgradeCost, UPGRADE_DEFS } from './economy';
import { newStrategy, selectCompound } from './strategy';

describe('auto', () => {
  it("never overrides the player's chosen compound, at any later stop", () => {
    const s = newStrategy();
    selectCompound(s, 'soft');
    autoSelectCompound(s, 1, 5); // Auto alone would choose hard here
    expect(s.nextCompound).toBe('soft');
    s.compound = 'soft'; // the stop was made
    autoSelectCompound(s, 1, 5);
    expect(s.nextCompound).toBe('soft');
    selectCompound(s, 'medium');
    autoSelectCompound(s, 1, 5);
    expect(s.nextCompound).toBe('medium');
    expect(newStrategy(s).nextCompound).toBe('medium');
    expect(newStrategy(s).compoundChosen).toBe(true);
  });

  it('chooses the compound itself when the player has not', () => {
    const s = newStrategy();
    autoSelectCompound(s, 1, 5);
    expect(s.nextCompound).toBe('hard');
  });

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
    s.pitRemaining = 5;
    expect(shouldAutoPit(s, 1, 5)).toBe(false);
  });

  it('does not call the car in twice', () => {
    const s = newStrategy();
    s.wear = 0.8;
    s.pitRequested = true;
    expect(shouldAutoPit(s, 1, 5)).toBe(false);
  });

  it('picks tyres to match the laps left', () => {
    expect(autoCompound(1, 5)).toBe('hard');
    expect(autoCompound(2, 5)).toBe('medium');
    expect(autoCompound(3.5, 5)).toBe('soft');
  });
});
