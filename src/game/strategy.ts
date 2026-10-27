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
export const PIT_LANE_SPEED = 0.1;

export interface Strategy {
  mode: Mode;
  compound: Compound;
  nextCompound: Compound;
  // 0 fresh, 1 fully worn.
  wear: number;
  // 0..1 energy from tapping.
  boost: number;
  // Game seconds left in the pit stop; 0 when on track.
  pitRemaining: number;
  // The player has called the car in; the stop starts when it reaches the pit lane (the start/finish line).
  pitRequested: boolean;
  modeCooldown: number;
}

export interface StrategyLevels {
  tapPower: number;
  pitCrew: number;
  tyres: number;
}

export function newStrategy(prev?: Pick<Strategy, 'mode' | 'nextCompound'>): Strategy {
  const compound = prev?.nextCompound ?? 'medium';
  return {
    mode: prev?.mode ?? 'normal',
    compound,
    nextCompound: compound,
    wear: 0,
    boost: 0,
    pitRemaining: 0,
    pitRequested: false,
    modeCooldown: 0,
  };
}

export const isPitting = (s: Strategy) => s.pitRemaining > 0;

export function pitDuration(pitCrew: number): number {
  return 12 / (1 + 0.1 * pitCrew);
}

// A tap charges boost on track, and speeds up the crew while in the pits.
export function tap(s: Strategy, tapPower: number): void {
  const power = 1 + 0.1 * tapPower;
  if (isPitting(s)) s.pitRemaining = Math.max(0, s.pitRemaining - 1.5 * power);
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
}

// Call the car in (or cancel the call). The stop itself happens at the pit lane entrance.
export function togglePitRequest(s: Strategy): boolean {
  if (isPitting(s)) return false;
  s.pitRequested = !s.pitRequested;
  return true;
}

// Called when the car crosses the pit entrance: starts the stop if one was requested.
export function enterPitLane(s: Strategy, pitCrew: number): boolean {
  if (!s.pitRequested) return false;
  s.pitRequested = false;
  return startPit(s, pitCrew);
}

export function startPit(s: Strategy, pitCrew: number): boolean {
  if (isPitting(s)) return false;
  s.pitRemaining = pitDuration(pitCrew);
  return true;
}

export function stepStrategy(s: Strategy, dt: number, levels: StrategyLevels): void {
  s.boost = Math.max(0, s.boost - BOOST_DECAY_PER_SEC * dt);
  s.modeCooldown = Math.max(0, s.modeCooldown - dt);
  if (isPitting(s)) {
    s.pitRemaining = Math.max(0, s.pitRemaining - dt);
    if (s.pitRemaining === 0) {
      s.wear = 0;
      s.compound = s.nextCompound;
    }
    return;
  }
  const rate = (BASE_WEAR_PER_SEC * MODE_FX[s.mode].wear * COMPOUND_FX[s.compound].wear) / (1 + 0.05 * levels.tyres);
  s.wear = Math.min(1, s.wear + rate * dt);
}

// Multiplier applied to the player cars' pace.
export function paceFactor(s: Strategy): number {
  if (isPitting(s)) return PIT_LANE_SPEED;
  return (
    MODE_FX[s.mode].pace *
    COMPOUND_FX[s.compound].pace *
    (1 - TYRE_PENALTY * s.wear * s.wear) *
    (1 + TAP_MAX_BOOST * s.boost)
  );
}
