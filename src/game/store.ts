import type { GameState } from './save';

export type Currency = 'gems' | 'rp' | 'clout';
export const CURRENCIES: Currency[] = ['gems', 'rp', 'clout'];
export const CURRENCY_NAMES: Record<Currency, string> = { gems: 'Gems', rp: 'Research Points', clout: 'Clout' };

// Real-money price points in dollars. Each pack pays double the first time that exact pack is bought.
export const PRICES = [1, 2.5, 5, 10, 50, 100];
export const priceLabel = (price: number) => `$${Number.isInteger(price) ? price : price.toFixed(2)}`;

// Bigger packs give a better rate.
const AMOUNTS: Record<Currency, number[]> = {
  gems: [100, 275, 600, 1300, 7500, 16000],
  rp: [5, 14, 30, 65, 375, 800],
  clout: [5, 14, 30, 65, 375, 800],
};

export const packKey = (currency: Currency, price: number) => `${currency}:${price}`;
export const isFirstBuy = (state: Pick<GameState, 'packsBought'>, currency: Currency, price: number) => !state.packsBought[packKey(currency, price)];

export function baseAmount(currency: Currency, price: number): number {
  const i = PRICES.indexOf(price);
  return i < 0 ? 0 : AMOUNTS[currency][i];
}

export function packAmount(state: Pick<GameState, 'packsBought'>, currency: Currency, price: number): number {
  return baseAmount(currency, price) * (isFirstBuy(state, currency, price) ? 2 : 1);
}

// Credits a pack the player has paid for. Returns the amount granted, or 0 for an unknown pack.
export function grantPack(state: Pick<GameState, 'packsBought' | 'gems' | 'researchPoints' | 'clout'>, currency: Currency, price: number): number {
  const amount = packAmount(state, currency, price);
  if (amount <= 0) return 0;
  state.packsBought[packKey(currency, price)] = true;
  if (currency === 'gems') state.gems += amount;
  else if (currency === 'rp') state.researchPoints += amount;
  else state.clout += amount;
  return amount;
}
