import { GameState } from './save';
import { fansFor } from './career';

export interface Sponsor {
  name: string;
  // Paid to the team at the start of every season.
  amount: number;
}

// An open negotiation. `secret` is the most the sponsor will pay; lo..hi is a rough market estimate the player sees.
export interface Meeting {
  name: string;
  secret: number;
  lo: number;
  hi: number;
}

export type SponsorState = Pick<GameState, 'gems' | 'season' | 'sponsorList' | 'meeting'>;

export const MEETING_BASE_GEMS = 5;
export const MEETING_GEM_STEP = 3;
const MARKET_BASE = 1500;
const MARKET_GROWTH = 1.3;
// The secret budget lands between these multiples of the market value.
const SECRET_MIN = 0.4;
const SECRET_MAX = 1.6;
// How wide the displayed estimate is around the secret.
const HINT_SPREAD = 0.5;

const NAMES = [
  'Apex Lubricants',
  'Nova Telecom',
  'Voltline Energy',
  'Brightwave Bank',
  'Orbit Airways',
  'Ironclad Watches',
  'Helix Cloud',
  'Summit Beverages',
  'Quantum Motors',
  'Zephyr Apparel',
  'Crestline Insurance',
  'Pulse Mobile',
  'Atlas Logistics',
  'Solstice Hotels',
  'Kestrel Software',
  'Meridian Foods',
];

// What a typical sponsor is worth at the start of a season; it grows with the season like prize money does.
export const marketValue = (season: number) => Math.round(MARKET_BASE * MARKET_GROWTH ** (season - 1));

export const MAX_SPONSORS = 15;

// Each sponsor you have signed makes the next meeting cost more gems.
export const meetingCost = (signed: number) => MEETING_BASE_GEMS + MEETING_GEM_STEP * signed;

// Sponsors pay more as the fanbase grows: x1 with no fans, x2 at 10K fans, x4 at 90K.
export const fanMultiplier = (state: Pick<GameState, 'stats'>) => 1 + Math.sqrt(fansFor(state.stats)) / 100;

export const sponsorIncome = (state: Pick<GameState, 'sponsorList' | 'stats'>) =>
  Math.round(state.sponsorList.reduce((sum, s) => sum + s.amount, 0) * fanMultiplier(state));

// Starting point for the pitch: the middle of the estimate.
export const openingPitch = (m: Meeting) => Math.round(Math.sqrt(m.lo * m.hi));

// Pays for a meeting with gems and rolls a sponsor with a hidden budget. Returns null if one is already open or gems are short.
export function requestMeeting(state: SponsorState, rng: () => number = Math.random): Meeting | null {
  const cost = meetingCost(state.sponsorList.length);
  if (state.meeting || state.gems < cost) return null;
  state.gems -= cost;
  const taken = new Set(state.sponsorList.map((s) => s.name));
  const free = NAMES.filter((n) => !taken.has(n));
  const pool = free.length > 0 ? free : NAMES;
  const name = pool[Math.floor(rng() * pool.length) % pool.length];
  const secret = Math.max(1, Math.round(marketValue(state.season) * (SECRET_MIN + rng() * (SECRET_MAX - SECRET_MIN))));
  const u = rng();
  const meeting: Meeting = {
    name,
    secret,
    lo: Math.max(1, Math.round(secret / (1 + HINT_SPREAD * u))),
    hi: Math.round(secret * (1 + HINT_SPREAD * (1 - u))),
  };
  state.meeting = meeting;
  return meeting;
}

export type PitchResult = { outcome: 'signed'; sponsor: Sponsor; replaced?: Sponsor } | { outcome: 'failed'; name: string } | { outcome: 'none' };

// The sponsor that makes room when the slots are full: the lowest payer.
export function lowestSponsor(state: Pick<GameState, 'sponsorList'>): Sponsor | null {
  return state.sponsorList.reduce<Sponsor | null>((low, s) => (!low || s.amount < low.amount ? s : low), null);
}

// A pitch at or under the secret budget signs the sponsor at the pitched amount; over it, talks collapse. Either way the meeting ends.
// With every slot taken, a signing drops the lowest-paying sponsor.
export function pitch(state: SponsorState, amount: number): PitchResult {
  const m = state.meeting;
  if (!m || !Number.isFinite(amount) || amount <= 0) return { outcome: 'none' };
  state.meeting = null;
  if (amount > m.secret) return { outcome: 'failed', name: m.name };
  const sponsor = { name: m.name, amount: Math.floor(amount) };
  let replaced: Sponsor | undefined;
  if (state.sponsorList.length >= MAX_SPONSORS) {
    replaced = lowestSponsor(state)!;
    state.sponsorList.splice(state.sponsorList.indexOf(replaced), 1);
  }
  state.sponsorList.push(sponsor);
  return { outcome: 'signed', sponsor, replaced };
}

// Ends the meeting without a deal. The gems are not refunded.
export function walkAway(state: Pick<GameState, 'meeting'>): void {
  state.meeting = null;
}
