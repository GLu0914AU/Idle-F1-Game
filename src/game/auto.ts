import { UPGRADE_DEFS, UpgradeDef, upgradeCost } from './economy';
import { DEV_PACKAGES, DevPackage, developmentCost, fitsSeason } from './development';
import { isUnlocked } from './unlocks';
import type { GameState } from './save';
import { Compound, Strategy, isPitting } from './strategy';
import { idealClass, tyreClass } from './weather';

// Picks the cheapest upgrade the player has ticked, and only buys it once it is affordable, so Auto Buy never skips ahead of it. `reserve` is money Auto Buy must leave untouched (the owed wages),
// so it can never spend what keeps drivers and staff from quitting.
export function pickAutoBuy(money: number, upgrades: Record<string, number>, reserve = 0, enabled: Record<string, boolean> = {}): UpgradeDef | null {
  const spendable = money - reserve;
  let best: UpgradeDef | null = null;
  let bestCost = Infinity;
  for (const def of UPGRADE_DEFS) {
    if (enabled[def.key] === false) continue;
    const cost = upgradeCost(def, upgrades[def.key] ?? 0);
    if (cost < bestCost) {
      best = def;
      bestCost = cost;
    }
  }
  return best && bestCost <= spendable ? best : null;
}

// Starts the best package that is ticked, fits before the season ends and is affordable once the owed wages are set aside.
// "Best" is the most expensive one, since pricier packages carry bigger gains.
export function pickAutoDevelopment(
  state: Parameters<typeof developmentCost>[0] & Pick<GameState, 'bestSeason'>,
  racesPerSeason: number,
  reserve = 0,
  enabled: Record<string, boolean> = {},
): DevPackage | null {
  if (enabled.development === false || state.development.active || !isUnlocked(state, 'development')) return null;
  let best: DevPackage | null = null;
  let bestCost = -1;
  for (const def of DEV_PACKAGES) {
    if (!fitsSeason(state, def, racesPerSeason)) continue;
    const cost = developmentCost(state, def);
    if (cost <= state.money - reserve && cost > bestCost) {
      best = def;
      bestCost = cost;
    }
  }
  return best;
}

// Call the car in once tyres are worn, or when the rain has made them wrong, unless the race is nearly over.
export function shouldAutoPit(s: Strategy, progressLaps: number, totalLaps: number, wetness = 0): boolean {
  if (isPitting(s) || s.pitRequested || totalLaps - progressLaps <= 0.8) return false;
  if (s.wear >= 0.7) return true;
  const want = idealClass(wetness);
  if (tyreClass(s.compound) === want) return false;
  // A tyre the player chose for the next stop is respected; don't box just to refit the same wrong class.
  return !s.compoundChosen || tyreClass(s.nextCompound) === want;
}

// Auto picks tyres for the next stop only when the player hasn't chosen any.
export function autoSelectCompound(s: Strategy, progressLaps: number, totalLaps: number, wetness = 0): void {
  if (!s.compoundChosen) s.nextCompound = autoCompound(progressLaps, totalLaps, wetness);
}

// Fresh tyres should last to the flag: grippy softs for a short run, durable hards for a long one. In the rain, whichever tyre suits the wetness.
export function autoCompound(progressLaps: number, totalLaps: number, wetness = 0): Compound {
  const want = idealClass(wetness);
  if (want === 'inter') return 'intermediate';
  if (want === 'wet') return 'wet';
  const left = totalLaps - progressLaps;
  if (left <= 1.8) return 'soft';
  if (left >= 3.2) return 'hard';
  return 'medium';
}
