import type { GameState } from './save';

// Permanent buildings bought with gems. They survive prestige and each level adds a small, linear bonus.
export type FacilityKey = 'factory' | 'windTunnel' | 'simulator';
export const FACILITY_KEYS: FacilityKey[] = ['factory', 'windTunnel', 'simulator'];
export const FACILITY_COST_GROWTH = 1.07;

// Factory and Wind Tunnel grow linearly forever. The Simulator's cuts are percentages, so they follow 1 - 1/(1 + level/k):
// they keep improving with every level and never reach 100%. At level 100 they give 50% fewer flops and 25% cheaper packages.
export const FACTORY_MONEY_PER_LEVEL = 0.005;
export const WIND_TUNNEL_QUALITY_PER_LEVEL = 0.003;
export const SIMULATOR_FLOP_K = 100;
export const SIMULATOR_DEV_COST_K = 300;

export interface FacilityDef {
  key: FacilityKey;
  name: string;
  blurb: string;
  baseCost: number;
  effect: (level: number) => string;
}

const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;
const lv = (level: number) => Math.max(level, 0);
const saturating = (level: number, k: number) => 1 - 1 / (1 + lv(level) / k);

export const FACILITY_DEFS: Record<FacilityKey, FacilityDef> = {
  factory: {
    key: 'factory',
    name: 'Factory',
    blurb: 'More income per second and more prize money.',
    baseCost: 1,
    effect: (l) => `+${pct(FACTORY_MONEY_PER_LEVEL * lv(l))} income and prize money`,
  },
  windTunnel: {
    key: 'windTunnel',
    name: 'Wind Tunnel',
    blurb: 'Makes car development packages likelier to be breakthroughs.',
    baseCost: 1,
    effect: (l) => `+${pct(WIND_TUNNEL_QUALITY_PER_LEVEL * lv(l))} development team quality`,
  },
  simulator: {
    key: 'simulator',
    name: 'Simulator',
    blurb: 'Tests packages virtually: fewer flops and cheaper development.',
    baseCost: 1,
    effect: (l) => `${pct(saturating(l, SIMULATOR_FLOP_K))} fewer flops, ${pct(saturating(l, SIMULATOR_DEV_COST_K))} cheaper packages`,
  },
};

export const newFacilities = (): Record<FacilityKey, number> => ({ factory: 0, windTunnel: 0, simulator: 0 });

export const facilityLevel = (state: Pick<GameState, 'facilities'>, key: FacilityKey): number => state.facilities?.[key] ?? 0;

// Gems to buy the next level.
export function facilityCost(key: FacilityKey, level: number): number {
  return Math.ceil(FACILITY_DEFS[key].baseCost * FACILITY_COST_GROWTH ** level);
}

// Buys up to `count` levels, stopping when the gems run out. Returns how many were bought.
export function buyFacility(state: Pick<GameState, 'gems' | 'facilities'>, key: FacilityKey, count = 1): number {
  let bought = 0;
  while (bought < count) {
    const level = facilityLevel(state, key);
    const cost = facilityCost(key, level);
    if (state.gems < cost) break;
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
    moneyBonus: FACTORY_MONEY_PER_LEVEL * lv(facilities?.factory ?? 0),
    windQuality: WIND_TUNNEL_QUALITY_PER_LEVEL * lv(facilities?.windTunnel ?? 0),
    flopCut: saturating(facilities?.simulator ?? 0, SIMULATOR_FLOP_K),
    devCostCut: saturating(facilities?.simulator ?? 0, SIMULATOR_DEV_COST_K),
  };
}
