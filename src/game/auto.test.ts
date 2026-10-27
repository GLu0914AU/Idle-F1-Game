import { describe, expect, it } from 'vitest';
import { autoCompound, autoSelectCompound, pickAutoBuy, shouldAutoPit } from './auto';
import { upgradeCost, UPGRADE_DEFS, buyUpgrade } from './economy';
import { payDrivers, rookie } from './drivers';
import { payEngineer } from './engineers';
import { newGame } from './save';
import { payStaff, totalPayroll } from './staff';
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

  it('leaves the reserve untouched', () => {
    const cost = upgradeCost(UPGRADE_DEFS[0], 0);
    expect(pickAutoBuy(cost, {}, 1)?.key).not.toBe('engine');
    expect(pickAutoBuy(cost + 1000, {}, 1000)?.key).toBe('engine');
    expect(pickAutoBuy(500, {}, 500)).toBeNull();
  });

  it('never spends the payroll, so every wage can still be paid after a run of auto buys', () => {
    const s = newGame();
    s.drivers[0] = { ...rookie(), skill: 10, salary: 800 };
    s.drivers[1] = { ...rookie(), skill: 10, salary: 600 };
    s.engineer = { name: 'E', pit: 50, tyre: 50, mode: 50, salary: 400 };
    s.staff.tyre = { name: 'T', stats: { care: 50 }, salary: 300 };
    s.staff.pit = { name: 'P', stats: { speed: 50, precision: 50 }, salary: 200 };
    expect(totalPayroll(s)).toBe(2300);
    s.money = 1e7;
    for (let i = 0; i < 500; i++) {
      const def = pickAutoBuy(s.money, s.upgrades, totalPayroll(s));
      if (!def || !buyUpgrade(s, def)) break;
    }
    expect(s.money).toBeGreaterThanOrEqual(2300);
    const drivers = payDrivers(s);
    const engineer = payEngineer(s);
    const staff = payStaff(s);
    expect([...drivers.quit, ...engineer.quit, ...staff.quit]).toEqual([]);
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
