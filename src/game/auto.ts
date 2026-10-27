import { UPGRADE_DEFS, UpgradeDef, upgradeCost } from './economy';
import { Compound, Strategy, isPitting } from './strategy';
import { idealClass, tyreClass } from './weather';

// Picks the affordable car upgrade with the best rating per dollar.
export function pickAutoBuy(money: number, upgrades: Record<string, number>): UpgradeDef | null {
  let best: UpgradeDef | null = null;
  let bestScore = -1;
  for (const def of UPGRADE_DEFS) {
    const cost = upgradeCost(def, upgrades[def.key] ?? 0);
    if (cost > money) continue;
    const score = def.ratingPerLevel / cost;
    if (score > bestScore) {
      best = def;
      bestScore = score;
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
