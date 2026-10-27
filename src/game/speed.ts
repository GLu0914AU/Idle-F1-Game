import type { GameState } from './save';

// Speed-ups from the Fast Races purchase.
export const FINISH_SPEED = 5;
export const CATCH_UP_SPEED = 2;
export const BOOST_SPEED = 2;

// After a prestige, races run faster until the team gets back to the season it had reached before.
export const catchingUp = (s: Pick<GameState, 'prestiges' | 'season' | 'bestSeason'>) => s.prestiges > 0 && s.season < s.bestSeason;

// The game-speed multiplier right now. The ad/gem boost always works; Fast Races adds 5x once both of the player's cars are done,
// and 2x while catching up after a prestige. The best of them applies; they don't stack.
export function speedScale(
  s: Pick<GameState, 'boostSeconds' | 'fastRaces' | 'prestiges' | 'season' | 'bestSeason'>,
  playerCarsDone: boolean,
): number {
  let scale = s.boostSeconds > 0 ? BOOST_SPEED : 1;
  if (s.fastRaces) {
    if (playerCarsDone) scale = Math.max(scale, FINISH_SPEED);
    if (catchingUp(s)) scale = Math.max(scale, CATCH_UP_SPEED);
  }
  return scale;
}
