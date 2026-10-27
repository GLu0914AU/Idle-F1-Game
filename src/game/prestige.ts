import { UPGRADE_DEFS } from './economy';
import { GameState } from './save';

// Prestige is offered once the player has reached this season; earlier runs yield no research points.
export const MIN_PRESTIGE_SEASON = 3;
export const COST_GROWTH_RP = 1.6;
// Each research level in a stat grants this many free levels of it, every run.
export const FREE_LEVELS_PER_RESEARCH = 5;
export const FUNDING_BONUS = 0.25;
export const SEED_MONEY = 2000;

export interface ResearchDef {
  key: string;
  name: string;
  baseCost: number;
  blurb: string;
  // Stats give free levels each run; the rest are special effects.
  stat: boolean;
}

const levels = FREE_LEVELS_PER_RESEARCH;
const stat = (key: string, name: string, baseCost: number, blurb: string): ResearchDef => ({ key, name, baseCost, blurb, stat: true });

export const RESEARCH_DEFS: ResearchDef[] = [
  // R&D: bought only with research points, never money.
  stat('topSpeed', 'Top Speed', 3, `+${levels} levels: faster on straights`),
  stat('cornering', 'Cornering', 3, `+${levels} levels: faster in corners`),
  stat('tapPower', 'Tap Power', 2, `+${levels} levels: bigger taps, faster pits`),
  stat('tyreScience', 'Tyre Science', 3, `+${levels} levels: ~${Math.round((1 - 1 / (1 + 0.04 * levels)) * 100)}% less tyre wear`),
  stat('energyRecovery', 'Energy Recovery', 3, `+${levels} levels: boost lasts longer`),
  { key: 'funding', name: 'Funding', baseCost: 3, blurb: `+${FUNDING_BONUS * 100}% income and prize money`, stat: false },
  { key: 'seed', name: 'Seed Money', baseCost: 2, blurb: `Start each run with $${SEED_MONEY} per level`, stat: false },
  // Car stats: free levels on top of what you buy with money.
  ...UPGRADE_DEFS.map((d) => stat(d.key, d.name, 2, `+${levels} free levels every run`)),
];

// Research points earned by prestiging from a given season.
export function researchPointsFor(season: number): number {
  if (season < MIN_PRESTIGE_SEASON) return 0;
  return Math.floor(2 * (season - MIN_PRESTIGE_SEASON + 1) ** 1.5);
}

export const canPrestige = (state: Pick<GameState, 'season'>) => researchPointsFor(state.season) > 0;

export function researchCost(def: ResearchDef, level: number): number {
  return Math.ceil(def.baseCost * COST_GROWTH_RP ** level);
}

export function buyResearch(state: Pick<GameState, 'researchPoints' | 'research'>, def: ResearchDef): boolean {
  const level = state.research[def.key] ?? 0;
  const cost = researchCost(def, level);
  if (state.researchPoints < cost) return false;
  state.researchPoints -= cost;
  state.research[def.key] = level + 1;
  return true;
}

// The cheapest R&D upgrade the player can currently afford, if any.
export function pickAutoResearch(state: Pick<GameState, 'researchPoints' | 'research'>): ResearchDef | null {
  let best: ResearchDef | null = null;
  let bestCost = Infinity;
  for (const def of RESEARCH_DEFS) {
    const cost = researchCost(def, state.research[def.key] ?? 0);
    if (cost <= state.researchPoints && cost < bestCost) {
      best = def;
      bestCost = cost;
    }
  }
  return best;
}

const CAR_KEYS = new Set(UPGRADE_DEFS.map((d) => d.key));

// Money-bought car levels plus levels from research. Use this for everything the levels affect.
export function effectiveUpgrades(state: Pick<GameState, 'upgrades' | 'research'>): Record<string, number> {
  const out = { ...state.upgrades };
  for (const d of RESEARCH_DEFS) {
    if (!d.stat) continue;
    // R&D stats come from research alone, even if an old save holds money-bought levels.
    const bought = CAR_KEYS.has(d.key) ? (state.upgrades[d.key] ?? 0) : 0;
    out[d.key] = bought + (state.research[d.key] ?? 0) * FREE_LEVELS_PER_RESEARCH;
  }
  return out;
}

export const startingMoney = (state: Pick<GameState, 'research'>) => (state.research.seed ?? 0) * SEED_MONEY;

// Returns to Season 1, Race 1. Money and bought upgrades reset; research, gems and Auto stay.
export function prestige(state: GameState): number {
  const earned = researchPointsFor(state.season);
  if (earned <= 0) return 0;
  state.researchPoints += earned;
  state.prestiges += 1;
  state.bestSeason = Math.max(state.bestSeason, state.season);
  state.season = 1;
  state.race = 1;
  state.points = {};
  state.driverPoints = {};
  state.upgrades = Object.fromEntries(UPGRADE_DEFS.map((d) => [d.key, 0]));
  state.sponsorList = [];
  state.money = startingMoney(state);
  state.fanEventUsed = false;
  return earned;
}
