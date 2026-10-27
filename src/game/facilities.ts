import type { GameState } from './save';

// Permanent buildings bought with gems. They survive prestige and each level adds a small, linear bonus.
export type FacilityKey = 'factory' | 'windTunnel' | 'simulator';
export const FACILITY_KEYS: FacilityKey[] = ['factory', 'windTunnel', 'simulator'];
export const MAX_FACILITY_LEVEL = 100;
export const FACILITY_COST_GROWTH = 1.07;

// What each building does at the maximum level; every level adds 1/MAX_FACILITY_LEVEL of this.
export const FACTORY_MONEY_MAX = 0.5;
export const WIND_TUNNEL_QUALITY_MAX = 0.3;
export const SIMULATOR_FLOP_CUT_MAX = 0.5;
export const SIMULATOR_DEV_COST_CUT_MAX = 0.25;

export interface FacilityDef {
  key: FacilityKey;
  name: string;
  blurb: string;
  baseCost: number;
  effect: (level: number) => string;
}

const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;
const share = (level: number) => Math.min(Math.max(level, 0), MAX_FACILITY_LEVEL) / MAX_FACILITY_LEVEL;

export const FACILITY_DEFS: Record<FacilityKey, FacilityDef> = {
  factory: {
    key: 'factory',
    name: 'Factory',
    blurb: 'More income per second and more prize money.',
    baseCost: 1,
    effect: (l) => `+${pct(FACTORY_MONEY_MAX * share(l))} income and prize money`,
  },
  windTunnel: {
    key: 'windTunnel',
    name: 'Wind Tunnel',
    blurb: 'Makes car development packages likelier to be breakthroughs.',
    baseCost: 1,
    effect: (l) => `+${pct(WIND_TUNNEL_QUALITY_MAX * share(l))} development team quality`,
  },
  simulator: {
    key: 'simulator',
    name: 'Simulator',
    blurb: 'Tests packages virtually: fewer flops and cheaper development.',
    baseCost: 1,
    effect: (l) => `${pct(SIMULATOR_FLOP_CUT_MAX * share(l))} fewer flops, ${pct(SIMULATOR_DEV_COST_CUT_MAX * share(l))} cheaper packages`,
  },
};

export const newFacilities = (): Record<FacilityKey, number> => ({ factory: 0, windTunnel: 0, simulator: 0 });

export const facilityLevel = (state: Pick<GameState, 'facilities'>, key: FacilityKey): number => state.facilities?.[key] ?? 0;

// Gems to buy the next level.
export function facilityCost(key: FacilityKey, level: number): number {
  return Math.ceil(FACILITY_DEFS[key].baseCost * FACILITY_COST_GROWTH ** level);
}

// Buys up to `count` levels, stopping at the cap or when the gems run out. Returns how many were bought.
export function buyFacility(state: Pick<GameState, 'gems' | 'facilities'>, key: FacilityKey, count = 1): number {
  let bought = 0;
  while (bought < count) {
    const level = facilityLevel(state, key);
    const cost = facilityCost(key, level);
    if (level >= MAX_FACILITY_LEVEL || state.gems < cost) break;
    state.gems -= cost;
    state.facilities[key] = level + 1;
    bought += 1;
  }
  return bought;
}

export interface FacilityEffects {
  // Added to the money multiplier (0.1 = +10%).
  moneyBonus: number;
  // Added to the team quality that drives development odds.
  windQuality: number;
  // Share of flops avoided and share of the package price saved.
  flopCut: number;
  devCostCut: number;
}

export function facilityEffects(facilities: Partial<Record<FacilityKey, number>> | undefined): FacilityEffects {
  return {
    moneyBonus: FACTORY_MONEY_MAX * share(facilities?.factory ?? 0),
    windQuality: WIND_TUNNEL_QUALITY_MAX * share(facilities?.windTunnel ?? 0),
    flopCut: SIMULATOR_FLOP_CUT_MAX * share(facilities?.simulator ?? 0),
    devCostCut: SIMULATOR_DEV_COST_CUT_MAX * share(facilities?.simulator ?? 0),
  };
}
