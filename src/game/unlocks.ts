import type { GameState } from './save';

// Features that stay locked until the team first reaches a season, so a new player isn't shown everything at once.
export const UNLOCK_SEASONS = {
  sponsors: 2,
  fanEvent: 2,
  engineer: 3,
  driver: 5,
  development: 10,
  staff: 15,
  facilities: 20,
} as const;

export type Feature = keyof typeof UNLOCK_SEASONS;

// Based on the best season ever reached, so a prestige never locks anything again.
export const isUnlocked = (state: Pick<GameState, 'season' | 'bestSeason'>, feature: Feature): boolean =>
  Math.max(state.season, state.bestSeason) >= UNLOCK_SEASONS[feature];

export const lockLabel = (feature: Feature): string => `UNLOCKS IN SEASON ${UNLOCK_SEASONS[feature]}`;
