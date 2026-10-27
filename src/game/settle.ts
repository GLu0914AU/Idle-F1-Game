import { Car } from './race';
import { recordRace, recordSeason } from './career';
import { payDrivers } from './drivers';
import { racePayout, sponsorMultiplier } from './economy';
import { GameState } from './save';
import { SeasonOutcome, advanceSeason, awardPoints } from './season';
import { sponsorIncome } from './sponsors';

export const TITLE_GEMS = 5;

export interface Settlement {
  // The player's finishing positions, best first.
  positions: number[];
  payout: number;
  wagesPaid: number;
  quit: string[];
  outcome: SeasonOutcome;
  sponsorCash: number;
}

// Everything that happens when a race ends: prize, wages, points, and the season moving on. `order` is the finishing order.
export function settleRace(state: GameState, order: Car[]): Settlement {
  const positions = order.flatMap((c, i) => (c.isPlayer ? [i + 1] : []));
  const payout = racePayout(positions, state.season, sponsorMultiplier(state));
  state.money += payout;
  const wages = payDrivers(state);
  awardPoints(state, order);
  recordRace(state, order[0].isPlayer);
  const outcome = advanceSeason(state);
  recordSeason(state, outcome);
  let sponsorCash = 0;
  if (outcome.type === 'season-won') {
    state.gems += TITLE_GEMS;
    sponsorCash = sponsorIncome(state);
    state.money += sponsorCash;
  }
  return { positions, payout, wagesPaid: wages.paid, quit: wages.quit, outcome, sponsorCash };
}
