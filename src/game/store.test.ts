import { describe, expect, it } from 'vitest';
import { newGame } from './save';
import { AD_COOLDOWN_MS, PRICES, adAmount, adWait, baseAmount, grantAd, grantPack, isFirstBuy, packAmount, priceLabel } from './store';

describe('rewarded ads', () => {
  it('pays each currency and money from income', () => {
    const s = newGame();
    const [m, g, r, c] = [s.money, s.gems, s.researchPoints, s.clout];
    expect(grantAd(s, 'money', 10, 0)).toBe(adAmount('money', 10));
    expect(s.money).toBe(m + 9000);
    grantAd(s, 'gems', 10, 0);
    grantAd(s, 'rp', 10, 0);
    grantAd(s, 'clout', 10, 0);
    expect([s.gems, s.researchPoints, s.clout]).toEqual([g + 5, r + 1, c + 1]);
  });

  it('puts each ad on its own cooldown', () => {
    const s = newGame();
    grantAd(s, 'gems', 1, 1000);
    expect(grantAd(s, 'gems', 1, 1000 + AD_COOLDOWN_MS - 1)).toBe(0);
    expect(adWait(s, 'gems', 1000)).toBe(AD_COOLDOWN_MS);
    expect(adWait(s, 'rp', 1000)).toBe(0);
    expect(grantAd(s, 'gems', 1, 1000 + AD_COOLDOWN_MS)).toBe(5);
  });

  it('pays nothing for money while income is zero', () => {
    expect(grantAd(newGame(), 'money', 0, 0)).toBe(0);
  });
});

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
