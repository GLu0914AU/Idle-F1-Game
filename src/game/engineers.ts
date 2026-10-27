import { remainingSalary, rollAsk } from './drivers';
import type { GameState } from './save';
import { Strategy, COMPOUNDS, Compound, isPitting, setMode, togglePitRequest } from './strategy';
import { autoCompound, shouldAutoPit } from './auto';

// Each stat is the percentage of the time the engineer makes the right call.
export interface EngineerStats {
  // Boxes the car when it needs it (worn tyres, or the wrong tyres for the weather), and doesn't box it when it doesn't.
  pit: number;
  // Picks the right tyre for the next stop.
  tyre: number;
  // Pushes on fresh tyres and eases off on worn ones.
  mode: number;
}

export interface Engineer extends EngineerStats {
  name: string;
  // Paid after every race for as long as the engineer stays.
  salary: number;
}

// An engineer the player is negotiating with, using the same hidden-minimum-wage haggling as drivers.
export interface EngineerCandidate {
  name: string;
  stats: EngineerStats;
  secret: number;
  lo: number;
  hi: number;
}

export type EngineerState = Pick<GameState, 'clout' | 'season' | 'engineer' | 'engineerMeeting' | 'money'>;

export const ENGINEER_MEETING_CLOUT = 2;
export const MIN_ENGINEER_STAT = 30;
export const MAX_ENGINEER_STAT = 99;

export const ENGINEER_NAMES = [
  'Gianpiero Lambada',
  'Peter Bono-Vox',
  'Riccardo Adami-Adams',
  'Ruth Buscombe-Bus',
  'Hannah Schmitz-Pretzel',
  'Ron Meadows-Meadow',
  'Ross Brawn-Brawny',
  'Rob Smedley-Smudge',
  'Tom Stallard-Stall',
  'Andrew Shovlin-Shovel',
  'Jonathan Wheatley-Wheat',
  'Pat Fry-Fried',
  'Xevi Pujolar-Pillar',
  'Dave Greenwood-Wood',
  'Karel Loos-Loose',
  'Mark Slade-Slide',
  'Bryn Griffiths-Griffin',
  'Marcus Dudley-Duddly',
  'Laura Mueller-Muesli',
  'Julien Simon-Simple',
  'Tim Newton-Fig',
  'Stefano Domenicali-Pizza',
  'Paddy Lowe-Low',
  'Nikolas Tombazis-Tomato',
];

// Quality in 0..1 drives the three stats and the asking price together, so better engineers cost more.
export function requestEngineerMeeting(state: EngineerState, rng: () => number = Math.random): EngineerCandidate | null {
  if (state.engineerMeeting || state.clout < ENGINEER_MEETING_CLOUT) return null;
  state.clout -= ENGINEER_MEETING_CLOUT;
  const free = ENGINEER_NAMES.filter((n) => n !== state.engineer?.name);
  const name = free[Math.floor(rng() * free.length) % free.length];
  const q = rng();
  const stat = () => Math.max(MIN_ENGINEER_STAT, Math.min(MAX_ENGINEER_STAT, Math.round(MIN_ENGINEER_STAT + 70 * q * (0.6 + rng() * 0.8))));
  const stats: EngineerStats = { pit: stat(), tyre: stat(), mode: stat() };
  const meeting: EngineerCandidate = { name, stats, ...rollAsk(state.season, q, rng) };
  state.engineerMeeting = meeting;
  return meeting;
}

export type EngineerOfferResult = { outcome: 'signed'; name: string; replaced: string | null } | { outcome: 'failed'; name: string } | { outcome: 'none' };

// An offer at or above the engineer's minimum signs them (replacing the current one); below it, talks collapse. Either way the meeting ends.
export function offerEngineerContract(state: EngineerState, amount: number): EngineerOfferResult {
  const c = state.engineerMeeting;
  if (!c || !Number.isFinite(amount) || amount <= 0) return { outcome: 'none' };
  state.engineerMeeting = null;
  if (amount < c.secret) return { outcome: 'failed', name: c.name };
  const replaced = state.engineer?.name ?? null;
  state.engineer = { ...c.stats, name: c.name, salary: Math.floor(amount) };
  return { outcome: 'signed', name: c.name, replaced };
}

export function endEngineerMeeting(state: Pick<EngineerState, 'engineerMeeting'>): void {
  state.engineerMeeting = null;
}

// Settles what is left of the salary at season's end. An engineer the team can't pay walks out and the team goes back to calling strategy by hand.
export function payEngineer(state: EngineerState, instalments = 0): { paid: number; quit: string[] } {
  const e = state.engineer;
  if (!e || e.salary <= 0) return { paid: 0, quit: [] };
  const due = remainingSalary(e.salary, instalments);
  if (state.money >= due) {
    state.money -= due;
    return { paid: due, quit: [] };
  }
  state.engineer = null;
  return { paid: 0, quit: [e.name] };
}

// Real seconds between the engineer's looks at each car (a race lap takes about 12 s).
export const ENGINEER_REVIEW_SECONDS = 4;
// How often a Pit stat below 100 sends a car in for a stop it doesn't need, per review.
export const BLUNDER_CHANCE = 0.04;
// Game-laps from the flag inside which no stop is called.
const NO_STOP_LAPS = 0.8;
// Tyre wear from which the engineer takes a free stop under the safety car.
export const SAFETY_CAR_STOP_WEAR = 0.3;

// What the engineer does for one car. Called every few seconds of real time; each decision is right with the matching stat's probability,
// and otherwise goes wrong: a pit call is missed (or made for no reason), a tyre is the wrong one, a mode change goes the wrong way.
export function reviewStrategy(
  e: EngineerStats,
  st: Strategy,
  progressLaps: number,
  totalLaps: number,
  wetness: number,
  rng: () => number,
  safetyCar = false,
): void {
  const right = (pct: number) => rng() * 100 < pct;
  const left = totalLaps - progressLaps;
  // A safety car makes a stop cheap, so a worn set is worth changing even before it is due.
  const cheapStop = safetyCar && st.wear >= SAFETY_CAR_STOP_WEAR && left > NO_STOP_LAPS * 2 && !st.pitRequested && !isPitting(st);

  if (shouldAutoPit(st, progressLaps, totalLaps, wetness) || cheapStop) {
    if (right(e.pit)) {
      // The player's own tyre choice always wins over the engineer's.
      if (!st.compoundChosen) {
        const best = autoCompound(progressLaps, totalLaps, wetness);
        st.nextCompound = right(e.tyre) ? best : wrongCompound(best, rng);
      }
      togglePitRequest(st);
    }
  } else if (!isPitting(st) && !st.pitRequested && st.wear < 0.5 && left > NO_STOP_LAPS * 2 && !right(e.pit) && rng() < BLUNDER_CHANCE) {
    if (!st.compoundChosen) st.nextCompound = autoCompound(progressLaps, totalLaps, wetness);
    togglePitRequest(st);
  }

  const wrongWay = !right(e.mode);
  if (st.wear < 0.35) setMode(st, wrongWay ? 'conserve' : 'push');
  else if (st.wear > 0.6) setMode(st, wrongWay ? 'push' : st.mode === 'push' ? 'normal' : st.mode);
}

export function wrongCompound(best: Compound, rng: () => number): Compound {
  const others = COMPOUNDS.filter((c) => c !== best);
  return others[Math.floor(rng() * others.length) % others.length];
}

// Share of calls the engineer gets right, averaged over the three stats.
export const engineerRating = (e: EngineerStats) => (e.pit + e.tyre + e.mode) / 3;
