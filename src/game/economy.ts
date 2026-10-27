export interface UpgradeDef {
  key: string;
  name: string;
  baseCost: number;
  // Car rating added per level.
  ratingPerLevel: number;
}

export const UPGRADE_DEFS: UpgradeDef[] = [
  { key: 'engine', name: 'Engine', baseCost: 200, ratingPerLevel: 3 },
  { key: 'aero', name: 'Aero', baseCost: 300, ratingPerLevel: 2.5 },
  { key: 'tyres', name: 'Tyres', baseCost: 400, ratingPerLevel: 2 },
  { key: 'brakes', name: 'Brakes', baseCost: 600, ratingPerLevel: 1.5 },
  { key: 'reliability', name: 'Reliability', baseCost: 800, ratingPerLevel: 1 },
  { key: 'pitCrew', name: 'Pit Crew', baseCost: 1200, ratingPerLevel: 1 },
];

export const COST_GROWTH = 1.15;
export const BASE_RATING = 25;
const PRIZE_BASE = 100;

// Max pace bonus (at infinite levels) from Top Speed on straights and Cornering in corners.
const HANDLING_MAX = 0.3;
const HANDLING_HALF = 25;

export interface Handling {
  topSpeed: number;
  cornering: number;
}

// Pace bonus (0..HANDLING_MAX) from one handling stat level, with diminishing returns.
export const handlingBonus = (level: number) => HANDLING_MAX * (level / (level + HANDLING_HALF));
export const HANDLING_CAP = HANDLING_MAX;

// Pace multiplier at a point of cornerness c (0 straight .. 1 tight corner). Diminishing returns per stat.
export function handlingFactor(h: Handling, c: number): number {
  return 1 + handlingBonus(h.topSpeed) * (1 - c) + handlingBonus(h.cornering) * c;
}

// Permanent sponsors multiplier, plus 25% per Funding research level.
export function sponsorMultiplier(state: { sponsors: number; research?: Record<string, number> }): number {
  return state.sponsors * (1 + 0.25 * (state.research?.funding ?? 0));
}

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * COST_GROWTH ** level);
}

export function carRating(upgrades: Record<string, number>): number {
  const base = UPGRADE_DEFS.reduce((sum, d) => sum + (upgrades[d.key] ?? 0) * d.ratingPerLevel, BASE_RATING);
  return base * (1 + (upgrades.devBonus ?? 0));
}

// Money per second, flowing continuously (the per-lap trickle).
export function incomePerSecond(rating: number, sponsors: number): number {
  return (1 + rating * 0.3) * sponsors;
}

// Prize for one car finishing in a 1-based position.
export function prize(position: number, season: number): number {
  return Math.round(PRIZE_BASE * 0.82 ** (position - 1) * 1.3 ** (season - 1));
}

export function racePayout(positions: number[], season: number, sponsors: number): number {
  return Math.round(positions.reduce((sum, p) => sum + prize(p, season), 0) * sponsors);
}

// Buys one level if affordable. Returns whether it succeeded.
export function buyUpgrade(
  state: { money: number; upgrades: Record<string, number> },
  def: UpgradeDef,
): boolean {
  const cost = upgradeCost(def, state.upgrades[def.key] ?? 0);
  if (state.money < cost) return false;
  state.money -= cost;
  state.upgrades[def.key] = (state.upgrades[def.key] ?? 0) + 1;
  return true;
}

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

export function formatNumber(n: number): string {
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
  const scaled = n / 1000 ** tier;
  return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
}
