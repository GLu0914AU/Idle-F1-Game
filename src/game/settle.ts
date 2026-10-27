import { Car } from './race';
import { recordRace, recordSeason } from './career';
import { DevResult, resetDevelopment, tickDevelopment } from './development';
import { payDrivers } from './drivers';
import { payEngineer } from './engineers';
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
  // A development package that finished with this race.
  development: DevResult | null;
}

// Everything that happens when a race ends: prize, wages, points, and the season moving on. `order` is the finishing order.
export function settleRace(state: GameState, order: Car[], rng: () => number = Math.random): Settlement {
  const positions = order.flatMap((c, i) => (c.isPlayer ? [i + 1] : []));
  const payout = racePayout(positions, state.season, sponsorMultiplier(state));
  state.money += payout;
  const wages = payDrivers(state);
  const engineerWage = payEngineer(state);
  awardPoints(state, order);
  recordRace(state, order[0].isPlayer);
  const development = tickDevelopment(state, rng);
  const outcome = advanceSeason(state);
  if (outcome.type !== 'next-race') resetDevelopment(state);
  recordSeason(state, outcome);
  let sponsorCash = 0;
  if (outcome.type === 'season-won') {
    state.gems += TITLE_GEMS;
    sponsorCash = sponsorIncome(state);
    state.money += sponsorCash;
  }
  return { positions, payout, wagesPaid: wages.paid + engineerWage.paid, quit: [...wages.quit, ...engineerWage.quit], outcome, sponsorCash, development };
}
