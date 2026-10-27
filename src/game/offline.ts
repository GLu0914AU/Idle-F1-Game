import { incomePerSecond, sponsorMultiplier, carRating } from './economy';
import { effectiveUpgrades } from './prestige';
import { GameState } from './save';

export const FREE_OFFLINE_CAP_S = 2 * 3600;
export const AUTO_OFFLINE_CAP_S = 8 * 3600;
export const FREE_OFFLINE_RATE = 0.5;
// Ignore short gaps like a quick app switch.
export const MIN_OFFLINE_S = 60;

export interface OfflineResult {
  seconds: number;
  earned: number;
}

// Offline income is capped and reduced unless the Auto unlock has been bought.
export function offlineEarnings(state: GameState, now: number): OfflineResult {
  const elapsed = Math.max(0, (now - state.lastSavedAt) / 1000);
  if (elapsed < MIN_OFFLINE_S) return { seconds: 0, earned: 0 };
  const cap = state.autoUnlocked ? AUTO_OFFLINE_CAP_S : FREE_OFFLINE_CAP_S;
  const rate = state.autoUnlocked ? 1 : FREE_OFFLINE_RATE;
  const seconds = Math.min(elapsed, cap);
  const perSecond = incomePerSecond(carRating(effectiveUpgrades(state)), sponsorMultiplier(state));
  return { seconds, earned: Math.floor(perSecond * seconds * rate) };
}
