import { GameState } from './save';
import { SeasonOutcome } from './season';

export interface CareerStats {
  racesWon: number;
  // Drivers' and constructors' championships.
  wdc: number;
  wcc: number;
}

export const FANS_PER_WIN = 25;

// Fans needed before the fan event opens.
export const FAN_EVENT_MIN_FANS = 500;

// Fans come only from race wins, and are never lost on prestige.
export const fansFor = (stats: Pick<CareerStats, 'racesWon'>) => stats.racesWon * FANS_PER_WIN;

// A race counts as won when one of the player's cars finishes first.
export function recordRace(state: Pick<GameState, 'stats'>, winnerIsPlayer: boolean): void {
  if (winnerIsPlayer) state.stats.racesWon += 1;
}

export function recordSeason(state: Pick<GameState, 'stats'>, outcome: SeasonOutcome): void {
  if (outcome.type === 'next-race') return;
  if (outcome.type === 'season-won') state.stats.wdc += 1;
  if (outcome.constructors) state.stats.wcc += 1;
}

export type FanCurrency = 'money' | 'gems' | 'researchPoints' | 'clout';

// Fans/(fans+scale): rises quickly at first, never certain. Rarer currencies have a bigger scale.
const CHANCE_SCALE: Record<FanCurrency, number> = { money: 300, gems: 1000, researchPoints: 2000, clout: 1500 };
export const MAX_FAN_CHANCE = 0.95;

export function fanChance(fans: number, currency: FanCurrency): number {
  if (fans <= 0) return 0;
  return Math.min(MAX_FAN_CHANCE, fans / (fans + CHANCE_SCALE[currency]));
}

export interface FanDrops {
  money: number;
  gems: number;
  researchPoints: number;
  clout: number;
}

export const canRunFanEvent = (state: Pick<GameState, 'stats' | 'fanEventUsed'>) =>
  !state.fanEventUsed && fansFor(state.stats) >= FAN_EVENT_MIN_FANS;

// Once per prestige. Each currency rolls separately; bigger crowds also mean bigger drops.
export function runFanEvent(
  state: Pick<GameState, 'stats' | 'fanEventUsed' | 'money' | 'gems' | 'researchPoints' | 'clout'>,
  incomePerSecond: number,
  rng: () => number = Math.random,
): FanDrops | null {
  if (!canRunFanEvent(state)) return null;
  const fans = fansFor(state.stats);
  state.fanEventUsed = true;
  const drops: FanDrops = { money: 0, gems: 0, researchPoints: 0, clout: 0 };
  if (rng() < fanChance(fans, 'money')) drops.money = Math.floor(Math.max(100, incomePerSecond * 300) * (1 + fans / 1000));
  if (rng() < fanChance(fans, 'gems')) drops.gems = 1 + Math.floor(fans / 400);
  if (rng() < fanChance(fans, 'researchPoints')) drops.researchPoints = 1 + Math.floor(fans / 800);
  if (rng() < fanChance(fans, 'clout')) drops.clout = 1 + Math.floor(fans / 1000);
  state.money += drops.money;
  state.gems += drops.gems;
  state.researchPoints += drops.researchPoints;
  state.clout += drops.clout;
  return drops;
}
