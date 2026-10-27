import { describe, expect, it } from 'vitest';
import { newGame } from './save';
import { PRICES, baseAmount, grantPack, isFirstBuy, packAmount, priceLabel } from './store';

describe('currency packs', () => {
  it('has six price points per currency, with better rates for bigger packs', () => {
    expect(PRICES).toEqual([1, 2.5, 5, 10, 50, 100]);
    for (const c of ['gems', 'rp', 'clout'] as const) {
      const rates = PRICES.map((p) => baseAmount(c, p) / p);
      expect(rates[5]).toBeGreaterThan(rates[0]);
    }
  });

  it('doubles the first purchase of each pack only', () => {
    const s = newGame();
    expect(isFirstBuy(s, 'gems', 5)).toBe(true);
    const first = grantPack(s, 'gems', 5);
    expect(first).toBe(baseAmount('gems', 5) * 2);
    expect(s.gems).toBe(first);
    expect(grantPack(s, 'gems', 5)).toBe(baseAmount('gems', 5));
    expect(packAmount(s, 'gems', 10)).toBe(baseAmount('gems', 10) * 2);
    expect(packAmount(s, 'rp', 5)).toBe(baseAmount('rp', 5) * 2);
  });

  it('credits the right currency', () => {
    const s = newGame();
    const rp = s.researchPoints;
    const clout = s.clout;
    grantPack(s, 'rp', 1);
    grantPack(s, 'clout', 1);
    expect(s.researchPoints).toBe(rp + baseAmount('rp', 1) * 2);
    expect(s.clout).toBe(clout + baseAmount('clout', 1) * 2);
  });

  it('rejects unknown prices and formats labels', () => {
    expect(grantPack(newGame(), 'gems', 3)).toBe(0);
    expect(priceLabel(2.5)).toBe('$2.50');
    expect(priceLabel(100)).toBe('$100');
  });
});
