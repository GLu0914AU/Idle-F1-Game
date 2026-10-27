import { UPGRADE_DEFS, UpgradeDef, upgradeCost } from './economy';
import { Compound, Strategy, isPitting } from './strategy';

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

// Call the car in once tyres are worn, unless the race is nearly over.
export function shouldAutoPit(s: Strategy, progressLaps: number, totalLaps: number): boolean {
  return !isPitting(s) && !s.pitRequested && s.wear >= 0.7 && totalLaps - progressLaps > 0.8;
}

// Auto picks tyres for the next stop only when the player hasn't chosen any.
export function autoSelectCompound(s: Strategy, progressLaps: number, totalLaps: number): void {
  if (!s.compoundChosen) s.nextCompound = autoCompound(progressLaps, totalLaps);
}

// Fresh tyres should last to the flag: grippy softs for a short run, durable hards for a long one.
export function autoCompound(progressLaps: number, totalLaps: number): Compound {
  const left = totalLaps - progressLaps;
  if (left <= 1.8) return 'soft';
  if (left >= 3.2) return 'hard';
  return 'medium';
}
