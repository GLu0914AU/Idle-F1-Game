import { describe, expect, it } from 'vitest';
import { carRating, sponsorMultiplier } from './economy';
import {
  FREE_LEVELS_PER_RESEARCH,
  MIN_PRESTIGE_SEASON,
  RESEARCH_DEFS,
  buyResearch,
  canPrestige,
  effectiveUpgrades,
  pickAutoResearch,
  prestige,
  researchCost,
  researchPointsFor,
} from './prestige';
import { newGame } from './save';
import { rivalRating } from './teams';

describe('prestige', () => {
  it('rivals compound each season', () => {
    const r = (s: number) => rivalRating(60, s);
    expect(r(2) / r(1)).toBeCloseTo(r(6) / r(5), 5);
    expect(r(12)).toBeGreaterThan(r(1) * 5);
  });

  it('is locked before the minimum season and pays more the further you get', () => {
    expect(researchPointsFor(MIN_PRESTIGE_SEASON - 1)).toBe(0);
    expect(canPrestige({ season: 2 })).toBe(false);
    const pts = [3, 5, 8, 12].map(researchPointsFor);
    expect(pts[0]).toBeGreaterThan(0);
    for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeGreaterThan(pts[i - 1]);
  });

  it('resets progress but keeps research, gems and Auto, and pays research points', () => {
    const s = newGame();
    s.season = 6;
    s.race = 4;
    s.money = 5e6;
    s.gems = 12;
    s.autoUnlocked = true;
    s.points = { player: 10 };
    s.upgrades.engine = 30;
    s.research.engine = 1;
    const earned = prestige(s);
    expect(earned).toBe(researchPointsFor(6));
    expect(s.researchPoints).toBe(earned);
    expect(s.prestiges).toBe(1);
    expect(s.bestSeason).toBe(6);
    expect([s.season, s.race, s.money, s.upgrades.engine]).toEqual([1, 1, 0, 0]);
    expect(s.points).toEqual({});
    expect([s.gems, s.autoUnlocked, s.research.engine]).toEqual([12, true, 1]);
  });

  it('does nothing below the minimum season', () => {
    const s = newGame();
    s.season = 2;
    s.money = 100;
    expect(prestige(s)).toBe(0);
    expect(s.money).toBe(100);
  });

  it('research costs points and gives free levels that raise the rating', () => {
    const s = newGame();
    const engine = RESEARCH_DEFS.find((d) => d.key === 'engine')!;
    expect(buyResearch(s, engine)).toBe(false);
    s.researchPoints = 10;
    const base = carRating(effectiveUpgrades(s));
    expect(buyResearch(s, engine)).toBe(true);
    expect(s.researchPoints).toBeLessThan(10);
    expect(effectiveUpgrades(s).engine).toBe(FREE_LEVELS_PER_RESEARCH);
    expect(carRating(effectiveUpgrades(s))).toBeGreaterThan(base);
    expect(s.upgrades.engine).toBe(0);
  });

  it('auto research picks the cheapest affordable upgrade', () => {
    const s = newGame();
    expect(pickAutoResearch(s)).toBeNull();
    s.researchPoints = 1000;
    const def = pickAutoResearch(s)!;
    const cheapest = Math.min(...RESEARCH_DEFS.map((d) => researchCost(d, 0)));
    expect(researchCost(def, 0)).toBe(cheapest);
    s.researchPoints = cheapest - 1;
    expect(pickAutoResearch(s)).toBeNull();
  });

  it('R&D stats come only from research points, never from money-bought levels', () => {
    const s = newGame();
    s.upgrades.topSpeed = 50; // stale level from an old save
    expect(effectiveUpgrades(s).topSpeed).toBe(0);
    const def = RESEARCH_DEFS.find((d) => d.key === 'topSpeed')!;
    s.researchPoints = 10;
    expect(buyResearch(s, def)).toBe(true);
    expect(effectiveUpgrades(s).topSpeed).toBe(FREE_LEVELS_PER_RESEARCH);
    for (const key of ['topSpeed', 'cornering', 'tapPower', 'tyreScience', 'energyRecovery', 'funding', 'seed']) {
      expect(RESEARCH_DEFS.some((d) => d.key === key), key).toBe(true);
    }
    s.season = 5;
    prestige(s);
    expect(s.research.topSpeed).toBe(1);
    expect(effectiveUpgrades(s).topSpeed).toBe(FREE_LEVELS_PER_RESEARCH);
  });

  it('funding research boosts income and seed money survives a prestige', () => {
    const s = newGame();
    const before = sponsorMultiplier(s);
    s.research.funding = 2;
    expect(sponsorMultiplier(s)).toBeGreaterThan(before);
    s.research.seed = 3;
    s.season = 4;
    prestige(s);
    expect(s.money).toBe(6000);
  });
});
