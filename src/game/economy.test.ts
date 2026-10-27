import { describe, expect, it } from 'vitest';
import {
  BASE_RATING,
  UPGRADE_DEFS,
  buyUpgrade,
  carRating,
  formatNumber,
  incomePerSecond,
  prize,
  racePayout,
  upgradeCost,
} from './economy';

const engine = UPGRADE_DEFS[0];

describe('economy', () => {
  it('cost grows by 1.15 per level', () => {
    expect(upgradeCost(engine, 0)).toBe(100);
    expect(upgradeCost(engine, 10)).toBe(Math.ceil(100 * 1.15 ** 10));
    expect(upgradeCost(engine, 11)).toBeGreaterThan(upgradeCost(engine, 10));
  });

  it('rating rises with upgrades', () => {
    expect(carRating({})).toBe(BASE_RATING);
    expect(carRating({ engine: 2 })).toBe(BASE_RATING + 6);
  });

  it('income scales with rating and sponsors', () => {
    expect(incomePerSecond(20, 2)).toBeGreaterThan(incomePerSecond(20, 1));
    expect(incomePerSecond(30, 1)).toBeGreaterThan(incomePerSecond(10, 1));
  });

  it('prizes fall with position and grow with season', () => {
    expect(prize(1, 1)).toBeGreaterThan(prize(2, 1));
    expect(prize(1, 3)).toBeGreaterThan(prize(1, 1));
    expect(racePayout([1, 2], 1, 2)).toBe(Math.round((prize(1, 1) + prize(2, 1)) * 2));
  });

  it('buys only when affordable', () => {
    const s = { money: 5, upgrades: {} as Record<string, number> };
    expect(buyUpgrade(s, engine)).toBe(false);
    expect(s.money).toBe(5);
    s.money = 250;
    expect(buyUpgrade(s, engine)).toBe(true);
    expect(s.money).toBe(50);
    expect(s.upgrades.engine).toBe(1);
  });

  it('formats large numbers', () => {
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1500)).toBe('1.50K');
    expect(formatNumber(2.5e6)).toBe('2.50M');
    expect(formatNumber(1.2e12)).toBe('1.20T');
  });
});
