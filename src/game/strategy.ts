export type Mode = 'push' | 'normal' | 'conserve';
export type Compound = 'soft' | 'medium' | 'hard';

export const MODES: Mode[] = ['push', 'normal', 'conserve'];
export const COMPOUNDS: Compound[] = ['soft', 'medium', 'hard'];

// pace multiplies speed, wear multiplies tyre wear rate.
export const MODE_FX: Record<Mode, { pace: number; wear: number }> = {
  push: { pace: 1.03, wear: 1.6 },
  normal: { pace: 1, wear: 1 },
  conserve: { pace: 0.98, wear: 0.6 },
};

export const COMPOUND_FX: Record<Compound, { pace: number; wear: number }> = {
  soft: { pace: 1.015, wear: 1.5 },
  medium: { pace: 1, wear: 1 },
  hard: { pace: 0.99, wear: 0.6 },
};

export const BASE_WEAR_PER_SEC = 0.004;
// Worst-case pace lost to fully worn tyres.
export const TYRE_PENALTY = 0.06;
// Pace gained at full tap boost.
export const TAP_MAX_BOOST = 0.03;
export const BOOST_DECAY_PER_SEC = 0.3;
export const MODE_COOLDOWN = 30;
// The pit lane runs from the entrance to the exit, each this far (in laps) from the start/finish line.
export const PIT_HALF_LENGTH = 0.06;

export interface Strategy {
  mode: Mode;
  compound: Compound;
  nextCompound: Compound;
  // True once the player has picked a compound; Auto leaves it alone for every stop until the player changes it.
  compoundChosen: boolean;
  // 0 fresh, 1 fully worn.
  wear: number;
  // 0..1 energy from tapping.
  boost: number;
  // Longest game-seconds-left among this team's cars currently in the pit lane; 0 when none are. Set by the race.
  pitRemaining: number;
  // A stop has been called; each car peels off at the next pit entrance it reaches.
  pitRequested: boolean;
  // Increments with each new call, so every car makes exactly one stop per call.
  pitRequestId: number;
  // Fresh tyres are fitted when the first car completes the stop.
  pendingFit: boolean;
  // Seconds of pit time that taps have earned, consumed by the race.
  pitTapCredit: number;
  modeCooldown: number;
}

export interface StrategyLevels {
  tapPower: number;
  pitCrew: number;
  tyres: number;
  tyreScience?: number;
  energyRecovery?: number;
}

export function newStrategy(prev?: Pick<Strategy, 'mode' | 'compound' | 'nextCompound' | 'compoundChosen'>): Strategy {
  // A new race starts on the tyres last fitted; a compound chosen for the next stop stays chosen.
  const compound = prev?.compound ?? 'medium';
  return {
    mode: prev?.mode ?? 'normal',
    compound,
    nextCompound: prev?.nextCompound ?? compound,
    compoundChosen: prev?.compoundChosen ?? false,
    wear: 0,
    boost: 0,
    pitRemaining: 0,
    pitRequested: false,
    pitRequestId: 0,
    pendingFit: false,
    pitTapCredit: 0,
    modeCooldown: 0,
  };
}

export const isPitting = (s: Strategy) => s.pitRemaining > 0;

export function pitDuration(pitCrew: number): number {
  return 18 / (1 + 0.1 * pitCrew);
}

// A tap charges boost on track, and speeds up the crew while in the pits.
export function tap(s: Strategy, tapPower: number): void {
  const power = 1 + 0.1 * tapPower;
  if (isPitting(s)) s.pitTapCredit += 1.5 * power;
  else s.boost = Math.min(1, s.boost + 0.12 * power);
}

export function setMode(s: Strategy, mode: Mode): boolean {
  if (mode === s.mode || s.modeCooldown > 0) return false;
  s.mode = mode;
  s.modeCooldown = MODE_COOLDOWN;
  return true;
}

export function cycleMode(s: Strategy): boolean {
  return setMode(s, MODES[(MODES.indexOf(s.mode) + 1) % MODES.length]);
}

// Tyres are only ever changed in the pit lane, so this just picks the set to fit at the next stop.
export function selectCompound(s: Strategy, compound: Compound): void {
  s.nextCompound = compound;
  s.compoundChosen = true;
}

// Call the car in (or cancel the call). Each car then peels off at the next pit entrance it reaches.
export function togglePitRequest(s: Strategy): boolean {
  if (isPitting(s)) return false;
  s.pitRequested = !s.pitRequested;
  if (s.pitRequested) s.pitRequestId += 1;
  return true;
}

export function stepStrategy(s: Strategy, dt: number, levels: StrategyLevels): void {
  s.boost = Math.max(0, s.boost - (BOOST_DECAY_PER_SEC * dt) / (1 + 0.1 * (levels.energyRecovery ?? 0)));
  s.modeCooldown = Math.max(0, s.modeCooldown - dt);
  // Tyres don't wear while the car is crawling through the pit lane.
  if (isPitting(s)) return;
  const rate =
    (BASE_WEAR_PER_SEC * MODE_FX[s.mode].wear * COMPOUND_FX[s.compound].wear) /
    ((1 + 0.05 * levels.tyres) * (1 + 0.04 * (levels.tyreScience ?? 0)));
  s.wear = Math.min(1, s.wear + rate * dt);
}

// Multiplier applied to a car's pace on track.
export function paceFactor(s: Strategy): number {
  return (
    MODE_FX[s.mode].pace *
    COMPOUND_FX[s.compound].pace *
    (1 - TYRE_PENALTY * s.wear * s.wear) *
    (1 + TAP_MAX_BOOST * s.boost)
  );
}
