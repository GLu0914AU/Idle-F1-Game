import { describe, expect, it } from 'vitest';
import { developmentCost, developmentOdds, DEV_PACKAGES, teamQuality } from './development';
import { sponsorMultiplier } from './economy';
import { MAX_FACILITY_LEVEL, buyFacility, facilityCost, facilityEffects, newFacilities } from './facilities';
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

  it('never goes past the level cap', () => {
    const s = newGame();
    s.gems = 1e12;
    expect(buyFacility(s, 'simulator', 500)).toBe(MAX_FACILITY_LEVEL);
    expect(buyFacility(s, 'simulator', 1)).toBe(0);
  });

  it('has no effect at level 0 and full effect at the cap', () => {
    expect(facilityEffects(newFacilities())).toEqual({ moneyBonus: 0, windQuality: 0, flopCut: 0, devCostCut: 0 });
    const max = facilityEffects({ factory: 100, windTunnel: 100, simulator: 100 });
    expect(max.moneyBonus).toBeCloseTo(0.5);
    expect(max.flopCut).toBeCloseTo(0.5);
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
