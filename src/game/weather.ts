import type { Compound } from './strategy';

// A race's forecast. Times are in laps covered by the race leader, so the forecast reads the same however fast the cars are.
export interface Weather {
  rainStart: number;
  // Lap the rain stops, or null if it keeps raining to the flag.
  rainEnd: number | null;
  // Track wetness at the heaviest point, 0 (dry) to 1 (soaked); under ~0.7 it is a drizzle that suits intermediates.
  peak: number;
}

export const DRY: Weather = { rainStart: 0, rainEnd: null, peak: 0 };
export const RAIN_CHANCE = 0.3;
// Laps the track takes to get wet or to dry out.
export const RAMP_LAPS = 0.3;
export const WET_CRAFT_RELIEF = 0.1;
// Wetness where each tyre class becomes the quickest (see gripPenalty).
export const INTER_FROM = 0.3;
export const WET_FROM = 0.7;
// Rival drivers' Race Craft in the wet.
export const RIVAL_WET_CRAFT = 3;

export type TyreClass = 'dry' | 'inter' | 'wet';

export const tyreClass = (c: Compound): TyreClass => (c === 'intermediate' ? 'inter' : c === 'wet' ? 'wet' : 'dry');

// The fastest class of tyre for the conditions.
export const idealClass = (wetness: number): TyreClass => (wetness >= WET_FROM ? 'wet' : wetness >= INTER_FROM ? 'inter' : 'dry');

export const isDry = (w: Weather) => w.peak <= 0;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function wetnessAt(w: Weather, lap: number): number {
  if (isDry(w)) return 0;
  const rising = clamp01((lap - w.rainStart) / RAMP_LAPS);
  const falling = w.rainEnd === null ? 1 : clamp01((w.rainEnd - lap) / RAMP_LAPS);
  return w.peak * Math.min(rising, falling);
}

// Rain never starts on the first lap: a car can't pit before the end of it, so the forecast always leaves time to react.
export function rollWeather(rng: () => number, laps: number): Weather {
  if (rng() >= RAIN_CHANCE) return DRY;
  const rainStart = 0.5 + rng() * Math.max(0, laps - 1.5);
  const peak = 0.35 + rng() * 0.65;
  const rainEnd = rng() < 0.4 ? rainStart + 1.5 + rng() * 1.5 : null;
  return { rainStart, rainEnd, peak };
}

// Fraction of pace lost to the wrong tyres: dry tyres aquaplane, wets overheat when dry, intermediates sit between.
export function gripPenalty(compound: Compound, wetness: number): number {
  const w = clamp01(wetness);
  switch (tyreClass(compound)) {
    case 'dry':
      return 0.3 * w;
    case 'inter':
      return 0.4 * Math.abs(w - 0.5);
    case 'wet':
      return 0.3 * (1 - w);
  }
}

// Pace multiplier from the conditions; Race Craft keeps cutting the loss (half at 10, never quite all of it).
export function weatherFactor(compound: Compound, wetness: number, craft: number): number {
  const relief = 1 / (1 + Math.max(0, craft) * WET_CRAFT_RELIEF);
  return 1 - gripPenalty(compound, wetness) * relief;
}

// Wets and intermediates wear out quickly on a dry track.
export const dryWearFactor = (compound: Compound, wetness: number) => (tyreClass(compound) !== 'dry' && wetness < INTER_FROM ? 2 : 1);

export function describeWeather(w: Weather, lap: number): string {
  if (isDry(w)) return 'DRY';
  const kind = w.peak >= WET_FROM ? 'HEAVY RAIN' : 'LIGHT RAIN';
  const fmt = (laps: number) => `LAP ${Math.max(1, Math.floor(laps) + 1)}`;
  if (lap < w.rainStart) return `${kind} FROM ${fmt(w.rainStart)}`;
  if (w.rainEnd !== null && lap < w.rainEnd) return `${kind}: CLEARS ${fmt(w.rainEnd)}`;
  if (w.rainEnd !== null) return 'DRYING';
  return kind;
}
