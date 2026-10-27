import { describe, expect, it } from 'vitest';
import { developmentCost, developmentOdds, DEV_PACKAGES, teamQuality } from './development';
import { sponsorMultiplier } from './economy';
import { buyFacility, facilityCost, facilityEffects, newFacilities } from './facilities';
import { loadGame, newGame } from './save';
import { prestige } from './prestige';

describe('facilities', () => {
  it('costs grow with each level and start at one gem', () => {
    expect(facilityCost('factory', 0)).toBe(1);
    expect(facilityCost('factory', 30)).toBeGreaterThan(facilityCost('factory', 10));
  });

  it('buys levels with gems and stops when broke', () => {
    const s = newGame();
    s.gems = 5;
    const bought = buyFacility(s, 'factory', 10);
    expect(bought).toBeGreaterThan(0);
    expect(bought).toBeLessThan(10);
    expect(s.facilities.factory).toBe(bought);
    expect(s.gems).toBeGreaterThanOrEqual(0);
  });

  it('has no level cap', () => {
    const s = newGame();
    s.gems = 1e12;
    expect(buyFacility(s, 'simulator', 500)).toBeGreaterThan(100);
  });

  it('has no effect at level 0, the old level-100 values at 100, and keeps growing', () => {
    expect(facilityEffects(newFacilities())).toEqual({ moneyBonus: 0, windQuality: 0, flopCut: 0, devCostCut: 0 });
    const at100 = facilityEffects({ factory: 100, windTunnel: 100, simulator: 100 });
    expect(at100.moneyBonus).toBeCloseTo(0.5);
    expect(at100.windQuality).toBeCloseTo(0.3);
    expect(at100.flopCut).toBeCloseTo(0.5);
    expect(at100.devCostCut).toBeCloseTo(0.25);
    const at300 = facilityEffects({ factory: 300, windTunnel: 300, simulator: 300 });
    expect(at300.moneyBonus).toBeCloseTo(1.5);
    expect(at300.flopCut).toBeCloseTo(0.75);
    expect(at300.flopCut).toBeLessThan(1);
  });

  it('team quality above 1 keeps helping but the odds stay valid', () => {
    const def = DEV_PACKAGES[2];
    const a = developmentOdds(1, def);
    const b = developmentOdds(3, def);
    const c = developmentOdds(1000, def);
    expect(b.big).toBeGreaterThan(a.big);
    expect(c.big).toBeGreaterThan(b.big);
    for (const o of [a, b, c]) {
      expect(o.big + o.solid + o.flop).toBeCloseTo(1);
      expect(o.solid).toBeGreaterThanOrEqual(0);
    }
  });

  it('the Factory boosts the money multiplier', () => {
    const s = newGame();
    const before = sponsorMultiplier(s);
    s.facilities.factory = 20;
    expect(sponsorMultiplier(s)).toBeCloseTo(before * 1.1);
  });

  it('the Wind Tunnel raises quality and the Simulator cuts flops and cost', () => {
    const s = newGame();
    const q0 = teamQuality(s);
    const cost0 = developmentCost(s, DEV_PACKAGES[1]);
    s.facilities.windTunnel = 50;
    expect(teamQuality(s)).toBeGreaterThan(q0);
    s.facilities.simulator = 100;
    const def = DEV_PACKAGES[2];
    expect(developmentOdds(0.5, def, facilityEffects(s.facilities).flopCut).flop).toBeLessThan(developmentOdds(0.5, def).flop);
    expect(developmentCost(s, DEV_PACKAGES[1])).toBeLessThan(cost0);
  });

  it('survives prestige and old saves load with level 0', () => {
    const s = newGame();
    s.facilities.factory = 7;
    s.season = 5;
    prestige(s);
    expect(s.facilities.factory).toBe(7);
    const store = { getItem: () => JSON.stringify({ gems: 3 }), setItem: () => {}, removeItem: () => {} };
    expect(loadGame(store).facilities).toEqual(newFacilities());
  });
});
