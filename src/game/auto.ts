import { UPGRADE_DEFS, UpgradeDef, upgradeCost } from './economy';
import { Strategy, isPitting } from './strategy';

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

// Pit once tyres are worn, unless the race is nearly over.
export function shouldAutoPit(s: Strategy, progressLaps: number, totalLaps: number): boolean {
  return !isPitting(s) && s.wear >= 0.7 && totalLaps - progressLaps > 0.8;
}
