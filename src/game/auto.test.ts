import { describe, expect, it } from 'vitest';
import { autoCompound, autoSelectCompound, pickAutoBuy, pickAutoDevelopment, shouldAutoPit } from './auto';
import { startDevelopment } from './development';
import { upgradeCost, UPGRADE_DEFS, buyUpgrade } from './economy';
import { payDrivers, rookie } from './drivers';
import { payEngineer } from './engineers';
import { newGame } from './save';
import { payStaff, payrollReserve, totalPayroll } from './staff';
import { newStrategy, selectCompound } from './strategy';

describe('auto development', () => {
  const rich = () => ({ ...newGame(), money: 1e12, race: 1, season: 10 });

  it('picks an affordable package that fits, and nothing when ticked off, busy or unaffordable', () => {
    const s = rich();
    expect(pickAutoDevelopment(s, 10)).not.toBeNull();
    expect(pickAutoDevelopment(s, 10, 0, { development: false })).toBeNull();
    expect(pickAutoDevelopment({ ...s, money: 0 }, 10)).toBeNull();
    expect(pickAutoDevelopment(s, 10, 1e12)).toBeNull();
    expect(startDevelopment(s, pickAutoDevelopment(s, 10)!.key, 10)).toBe(true);
    expect(pickAutoDevelopment(s, 10)).toBeNull();
  });

  it('skips packages that would not finish before the season ends', () => {
    const s = { ...rich(), race: 9 };
    expect(pickAutoDevelopment(s, 10)).toBeNull();
    expect(pickAutoDevelopment({ ...s, race: 8 }, 10)?.races).toBe(2);
  });
});

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

  it('always buys the cheapest ticked upgrade first', () => {
    const engine = UPGRADE_DEFS[0];
    expect(pickAutoBuy(upgradeCost(engine, 0), {})?.key).toBe('engine');
    // Engine at a high level costs more than a fresh Aero, so Aero is next.
    expect(pickAutoBuy(1e9, { engine: 20 })?.key).toBe('aero');
    // Unticked upgrades are skipped.
    expect(pickAutoBuy(1e9, {}, 0, { engine: false })?.key).toBe('aero');
  });

  it('waits for the cheapest ticked upgrade instead of buying something dearer', () => {
    expect(pickAutoBuy(upgradeCost(UPGRADE_DEFS[0], 0) - 1, {})).toBeNull();
  });

  it('leaves the reserve untouched', () => {
    const cost = upgradeCost(UPGRADE_DEFS[0], 0);
    expect(pickAutoBuy(cost, {}, 1)).toBeNull();
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
    s.race = 10;
    for (let i = 0; i < 500; i++) {
      const def = pickAutoBuy(s.money, s.upgrades, payrollReserve(s));
      if (!def || !buyUpgrade(s, def)) break;
    }
    expect(s.money).toBeGreaterThanOrEqual(230);
    const drivers = payDrivers(s);
    const engineer = payEngineer(s);
    const staff = payStaff(s);
    expect([...drivers.quit, ...engineer.quit, ...staff.quit]).toEqual([]);
  });

  it('skips upgrades the player has unticked', () => {
    const all = pickAutoBuy(1e9, {});
    expect(all?.key).toBeDefined();
    const without = pickAutoBuy(1e9, {}, 0, { [all!.key]: false });
    expect(without?.key).not.toBe(all!.key);
    const none = Object.fromEntries(UPGRADE_DEFS.map((d) => [d.key, false]));
    expect(pickAutoBuy(1e9, {}, 0, none)).toBeNull();
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
