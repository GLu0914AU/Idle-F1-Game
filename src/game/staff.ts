import { openingOffer, rollAsk } from './drivers';
import type { GameState } from './save';

// Specialist staff beyond the race engineer. Each role is hired with clout and the same hidden-minimum-wage haggling, is paid after every
// race, quits if unpaid, and survives a prestige. Their effects are deliberately modest next to upgrades and drivers.
export type StaffRole = 'tyre' | 'pit' | 'wind';
export const STAFF_ROLES: StaffRole[] = ['tyre', 'pit', 'wind'];

export interface StaffMember {
  name: string;
  stats: Record<string, number>;
  salary: number;
}

export interface StaffCandidate {
  name: string;
  stats: Record<string, number>;
  secret: number;
  lo: number;
  hi: number;
}

export type StaffState = Pick<GameState, 'clout' | 'season' | 'staff' | 'staffMeetings' | 'money'>;

export const STAFF_MEETING_CLOUT = 2;
export const MIN_STAFF_STAT = 30;
export const MAX_STAFF_STAT = 99;

// The most each stat can do at 99.
export const TYRE_WEAR_CUT_MAX = 0.15;
export const PIT_TIME_CUT_MAX = 0.15;
export const PIT_ISSUE_CUT_MAX = 0.35;
export const WIND_QUALITY_MAX = 0.4;

export interface StaffDef {
  role: StaffRole;
  title: string;
  short: string;
  blurb: string;
  stats: string[];
  names: string[];
  lines: (stats: Record<string, number>) => string[];
  summary: (stats: Record<string, number>) => string;
}

const share = (v: number | undefined) => (v ?? 0) / MAX_STAFF_STAT;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export const STAFF_DEFS: Record<StaffRole, StaffDef> = {
  tyre: {
    role: 'tyre',
    title: 'Tyre specialist',
    short: 'Tyre specialist',
    blurb: 'Cuts tyre wear on both cars, on top of driver tyre management and Tyre Science.',
    stats: ['care'],
    names: ['Mario Pirelli-Pie', 'Hiroshi Bridgestone-Brick', 'Anders Michelin-Man', 'Pietro Compound-Cola', 'Kasper Rubberstein', 'Lena Treadwell', 'Giorgio Grippa', 'Simone Slick-Sloan', 'Marcus Camber-Cam', 'Yuna Carcassa', 'Dieter Graining', 'Isabel Blistero'],
    lines: (s) => [`Tyre care: ${s.care}/${MAX_STAFF_STAT} (${pct(TYRE_WEAR_CUT_MAX * share(s.care))} less tyre wear)`],
    summary: (s) => `Care ${s.care}`,
  },
  pit: {
    role: 'pit',
    title: 'Pit crew chief',
    short: 'Pit crew chief',
    blurb: 'Speeds up pit stops and makes problems in the pits rarer, on top of the Pit Crew upgrade.',
    stats: ['speed', 'precision'],
    names: ['Hannah Wrenchley', 'Jack Jackson', 'Dmitri Lugnut', 'Carla Quickstop', 'Rui Airgun', 'Tomas Torque', 'Bianca Gantry', 'Olaf Nutbrown', 'Priya Pitwall', 'Ricky Rapido', 'Greta Tyrewall', 'Sven Stopwatch'],
    lines: (s) => [
      `Pit speed: ${s.speed}/${MAX_STAFF_STAT} (stops ${pct(PIT_TIME_CUT_MAX * share(s.speed))} shorter)`,
      `Precision: ${s.precision}/${MAX_STAFF_STAT} (${pct(PIT_ISSUE_CUT_MAX * share(s.precision))} fewer pit problems)`,
    ],
    summary: (s) => `Speed ${s.speed} · Precision ${s.precision}`,
  },
  wind: {
    role: 'wind',
    title: 'Wind tunnel engineer',
    short: 'Wind tunnel engineer',
    blurb: 'Makes car development packages more likely to be breakthroughs and less likely to flop.',
    stats: ['insight'],
    names: ['Adrian Newey-Knew', 'Willem Airflow', 'Beatrix Downforce', 'Sanjay Vortex', 'Elena Laminar', 'Frederik Drag-Coefficient', 'Mika Diffuser', 'Camila Slipstream', 'Gustav Turbulenz', 'Aiko Ground-Effect', 'Rolf Bernoulli-Burger', 'Noor Yawangle'],
    lines: (s) => [`Wind tunnel insight: ${s.insight}/${MAX_STAFF_STAT} (better development odds)`],
    summary: (s) => `Insight ${s.insight}`,
  },
};

export const newStaff = (): Record<StaffRole, StaffMember | null> => ({ tyre: null, pit: null, wind: null });
export const newStaffMeetings = (): Record<StaffRole, StaffCandidate | null> => ({ tyre: null, pit: null, wind: null });

export function requestStaffMeeting(state: StaffState, role: StaffRole, rng: () => number = Math.random): StaffCandidate | null {
  if (state.staffMeetings[role] || state.clout < STAFF_MEETING_CLOUT) return null;
  state.clout -= STAFF_MEETING_CLOUT;
  const def = STAFF_DEFS[role];
  const free = def.names.filter((n) => n !== state.staff[role]?.name);
  const name = free[Math.floor(rng() * free.length) % free.length];
  // Quality in 0..1 drives the stats and the asking price together.
  const q = rng();
  const stat = () => Math.max(MIN_STAFF_STAT, Math.min(MAX_STAFF_STAT, Math.round(MIN_STAFF_STAT + 70 * q * (0.6 + rng() * 0.8))));
  const stats = Object.fromEntries(def.stats.map((k) => [k, stat()]));
  const meeting: StaffCandidate = { name, stats, ...rollAsk(state.season, q, rng) };
  state.staffMeetings[role] = meeting;
  return meeting;
}

export { openingOffer };

export type StaffOfferResult = { outcome: 'signed'; name: string; replaced: string | null } | { outcome: 'failed'; name: string } | { outcome: 'none' };

// An offer at or above the minimum signs them (replacing the current holder); below it, talks collapse. Either way the meeting ends.
export function offerStaffContract(state: StaffState, role: StaffRole, amount: number): StaffOfferResult {
  const c = state.staffMeetings[role];
  if (!c || !Number.isFinite(amount) || amount <= 0) return { outcome: 'none' };
  state.staffMeetings[role] = null;
  if (amount < c.secret) return { outcome: 'failed', name: c.name };
  const replaced = state.staff[role]?.name ?? null;
  state.staff[role] = { name: c.name, stats: { ...c.stats }, salary: Math.floor(amount) };
  return { outcome: 'signed', name: c.name, replaced };
}

export function endStaffMeeting(state: Pick<StaffState, 'staffMeetings'>, role: StaffRole): void {
  state.staffMeetings[role] = null;
}

// Takes every salary after a race. Staff the team can't pay walk out.
export function payStaff(state: StaffState): { paid: number; quit: string[] } {
  let paid = 0;
  const quit: string[] = [];
  for (const role of STAFF_ROLES) {
    const m = state.staff[role];
    if (!m || m.salary <= 0) continue;
    if (state.money >= m.salary) {
      state.money -= m.salary;
      paid += m.salary;
    } else {
      state.staff[role] = null;
      quit.push(m.name);
    }
  }
  return { paid, quit };
}

export interface StaffEffects {
  // Share of tyre wear removed.
  tyreWearCut: number;
  // Share of a pit stop's time removed, and share of pit problems avoided.
  pitTimeCut: number;
  pitIssueCut: number;
  // Added to the team quality that drives development odds.
  windQuality: number;
}

export function staffEffects(staff: Pick<GameState, 'staff'>['staff'] | undefined): StaffEffects {
  return {
    tyreWearCut: TYRE_WEAR_CUT_MAX * share(staff?.tyre?.stats.care),
    pitTimeCut: PIT_TIME_CUT_MAX * share(staff?.pit?.stats.speed),
    pitIssueCut: PIT_ISSUE_CUT_MAX * share(staff?.pit?.stats.precision),
    windQuality: WIND_QUALITY_MAX * share(staff?.wind?.stats.insight),
  };
}
