import { carRating, incomePerSecond, sponsorMultiplier } from './economy';
import { MAX_SKILL } from './drivers';
import { engineerRating } from './engineers';
import { staffEffects } from './staff';
import { facilityEffects } from './facilities';
import { effectiveUpgrades } from './prestige';
import { RIVAL_TEAMS } from './teams';
import type { GameState } from './save';

export interface DevPackage {
  key: string;
  name: string;
  blurb: string;
  // Cost in seconds of the team's current income, and races until the package pays off.
  costSeconds: number;
  races: number;
  // Rating gain, as a share of the car, for each result.
  flop: number;
  solid: number;
  big: number;
  // Scales how likely a flop is.
  risk: number;
}

export const DEV_PACKAGES: DevPackage[] = [
  { key: 'chassis', name: 'Chassis Revamp', blurb: 'Safe, small gains', costSeconds: 20, races: 2, flop: 0, solid: 0.02, big: 0.045, risk: 0.5 },
  { key: 'aero', name: 'Aero Update', blurb: 'Balanced', costSeconds: 30, races: 2, flop: 0, solid: 0.03, big: 0.07, risk: 1 },
  { key: 'power', name: 'Power Unit Overhaul', blurb: 'Risky, big upside', costSeconds: 45, races: 3, flop: -0.02, solid: 0.04, big: 0.12, risk: 1.4 },
];

export type DevOutcome = 'flop' | 'solid' | 'big';

export interface DevResult {
  key: string;
  outcome: DevOutcome;
  gain: number;
}

export interface Development {
  // The package being built and how many races until it is finished.
  active: { key: string; racesLeft: number } | null;
  // Sum of finished packages this season, as a share of the car's rating.
  bonus: number;
  // How much each rival has improved this season, as a share of its rating.
  rivalDrift: Record<string, number>;
  // The last finished package, so the screen can report it.
  last: DevResult | null;
}

export const newDevelopment = (): Development => ({ active: null, bonus: 0, rivalDrift: {}, last: null });

// Each race a rival's car improves by a random amount in this range (as a share of its rating), so doing nothing falls behind slowly.
export const RIVAL_DRIFT_MIN = -0.01;
export const RIVAL_DRIFT_MAX = 0.015;

const BASE_BIG = 0.1;
const BASE_FLOP = 0.3;

type DevState = Pick<GameState, 'money' | 'season' | 'race' | 'upgrades' | 'research' | 'sponsors' | 'drivers' | 'engineer' | 'staff' | 'development' | 'facilities'>;

export const packageDef = (key: string) => DEV_PACKAGES.find((p) => p.key === key);

export function developmentCost(state: DevState, def: DevPackage): number {
  const income = incomePerSecond(carRating(effectiveUpgrades(state)), sponsorMultiplier(state));
  return Math.ceil(income * def.costSeconds * (1 - facilityEffects(state.facilities).devCostCut));
}

// Team quality has no upper bound (extra facility levels keep helping), but the odds only ever see a version that
// matches it up to 1 and then flattens towards 2, so the probabilities stay valid.
export const effectiveQuality = (q: number) => (q <= 1 ? Math.max(0, q) : 2 - 1 / q);

// How good the drivers (technical feedback), the engineer and the wind tunnel engineer and facility are. Usually 0..1, but can exceed 1.
export function teamQuality(state: Pick<GameState, 'drivers' | 'engineer'> & Partial<Pick<GameState, 'staff' | 'facilities'>>): number {
  const driverPart = (state.drivers[0].skill + state.drivers[1].skill) / 2 / MAX_SKILL;
  const engineerPart = state.engineer ? engineerRating(state.engineer) / 100 : 0;
  const extra = staffEffects(state.staff).windQuality + facilityEffects(state.facilities).windQuality;
  return 0.5 * driverPart + 0.5 * engineerPart + extra;
}

export function developmentOdds(quality: number, def: DevPackage, flopCut = 0): { big: number; solid: number; flop: number } {
  const q = effectiveQuality(quality);
  const big = BASE_BIG + 0.3 * q;
  const flop = Math.max(0.02, (BASE_FLOP - 0.2 * q) * def.risk * (1 - flopCut));
  return { big, flop, solid: Math.max(0, 1 - big - flop) };
}

// Whether a package started now would finish before the season ends.
export const fitsSeason = (state: Pick<GameState, 'race'>, def: DevPackage, racesPerSeason: number) => state.race + def.races <= racesPerSeason;

export function startDevelopment(state: DevState, key: string, racesPerSeason: number): boolean {
  const def = packageDef(key);
  if (!def || state.development.active || !fitsSeason(state, def, racesPerSeason)) return false;
  const cost = developmentCost(state, def);
  if (state.money < cost) return false;
  state.money -= cost;
  state.development.active = { key, racesLeft: def.races };
  return true;
}

// Called after every race: rivals improve a little, and the package in progress moves on and may finish.
export function tickDevelopment(state: DevState, rng: () => number = Math.random): DevResult | null {
  const dev = state.development;
  for (const team of RIVAL_TEAMS) {
    dev.rivalDrift[team.id] = (dev.rivalDrift[team.id] ?? 0) + RIVAL_DRIFT_MIN + rng() * (RIVAL_DRIFT_MAX - RIVAL_DRIFT_MIN);
  }
  dev.last = null;
  if (!dev.active) return null;
  dev.active.racesLeft -= 1;
  if (dev.active.racesLeft > 0) return null;
  const def = packageDef(dev.active.key)!;
  dev.active = null;
  const odds = developmentOdds(teamQuality(state), def, facilityEffects(state.facilities).flopCut);
  const roll = rng();
  const outcome: DevOutcome = roll < odds.big ? 'big' : roll < odds.big + odds.solid ? 'solid' : 'flop';
  const gain = outcome === 'big' ? def.big : outcome === 'solid' ? def.solid : def.flop;
  dev.bonus += gain;
  dev.last = { key: def.key, outcome, gain };
  return dev.last;
}

// A new season starts from scratch: the car's development and the rivals' improvement are both lost.
export function resetDevelopment(state: Pick<GameState, 'development'>): void {
  state.development = newDevelopment();
}
