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
}

const statBlurb = (name: string) => `+${FREE_LEVELS_PER_RESEARCH} free ${name} levels every run`;

export const RESEARCH_DEFS: ResearchDef[] = [
  ...UPGRADE_DEFS.map((d) => ({ key: d.key, name: d.name, baseCost: 2, blurb: statBlurb(d.name) })),
  { key: 'tapPower', name: 'Tap Power', baseCost: 2, blurb: statBlurb('Tap Power') },
  { key: 'funding', name: 'Funding', baseCost: 3, blurb: `+${FUNDING_BONUS * 100}% income and prize money` },
  { key: 'seed', name: 'Seed Money', baseCost: 2, blurb: `Start each run with $${SEED_MONEY} per level` },
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

// Purchased upgrade levels plus the free levels from research. Use this for everything the levels affect.
export function effectiveUpgrades(state: Pick<GameState, 'upgrades' | 'research'>): Record<string, number> {
  const out = { ...state.upgrades };
  for (const d of RESEARCH_DEFS) {
    if (d.key in state.upgrades || d.key === 'tapPower') {
      out[d.key] = (out[d.key] ?? 0) + (state.research[d.key] ?? 0) * FREE_LEVELS_PER_RESEARCH;
    }
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
  state.upgrades = Object.fromEntries(Object.keys(state.upgrades).map((k) => [k, 0]));
  state.money = startingMoney(state);
  return earned;
}
