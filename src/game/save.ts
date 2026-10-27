import { CareerStats } from './career';
import { PLAYER_COLOR, PLAYER_DRIVERS } from './teams';

export interface GameState {
  version: number;
  teamName: string;
  money: number;
  gems: number;
  season: number;
  race: number;
  // Constructors' points this season, by team id.
  points: Record<string, number>;
  // Drivers' points this season, by car id.
  driverPoints: Record<string, number>;
  upgrades: Record<string, number>;
  autoUnlocked: boolean;
  teamNamed: boolean;
  autoBuy: boolean;
  autoStrategy: boolean;
  autoTap: boolean;
  // Auto Buy for R&D (research points); part of the Auto unlock.
  autoResearch: boolean;
  // Real seconds of 2x speed remaining.
  boostSeconds: number;
  // Multiplies all income and prizes.
  sponsors: number;
  lastSavedAt: number;
  // Prestige currency, and the permanent research levels bought with it.
  researchPoints: number;
  research: Record<string, number>;
  prestiges: number;
  bestSeason: number;
  // Signed sponsors and the open negotiation, if any.
  sponsorList: { name: string; amount: number }[];
  meeting: { name: string; secret: number; lo: number; hi: number } | null;
  // Player-chosen identity.
  driverNames: [string, string];
  teamColor: number;
  // Lifetime stats; they survive prestige.
  stats: CareerStats;
  // The Fan Event can be run once per prestige.
  fanEventUsed: boolean;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'idle-f1-save';

export function newGame(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    teamName: 'My Team',
    money: 0,
    gems: 0,
    season: 1,
    race: 1,
    points: {},
    driverPoints: {},
    upgrades: {
      engine: 0,
      aero: 0,
      tyres: 0,
      brakes: 0,
      reliability: 0,
      pitCrew: 0,
    },
    autoUnlocked: false,
    teamNamed: false,
    autoBuy: false,
    autoStrategy: false,
    autoTap: false,
    autoResearch: false,
    boostSeconds: 0,
    sponsors: 1,
    lastSavedAt: now,
    researchPoints: 0,
    research: {},
    prestiges: 0,
    bestSeason: 1,
    sponsorList: [],
    meeting: null,
    driverNames: [...PLAYER_DRIVERS],
    teamColor: PLAYER_COLOR,
    stats: { racesWon: 0, wdc: 0, wcc: 0 },
    fanEventUsed: false,
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadGame(store: Store = localStorage, now = Date.now()): GameState {
  const fresh = newGame(now);
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return fresh;
    const data = JSON.parse(raw) as Partial<GameState>;
    if (typeof data !== 'object' || data === null) return fresh;
    // Merge over defaults so saves from older versions gain new fields.
    return {
      ...fresh,
      ...data,
      upgrades: { ...fresh.upgrades, ...(data.upgrades ?? {}) },
      points: { ...(data.points ?? {}) },
      driverPoints: { ...(data.driverPoints ?? {}) },
      research: { ...(data.research ?? {}) },
      sponsorList: [...(data.sponsorList ?? [])],
      driverNames: [data.driverNames?.[0] || fresh.driverNames[0], data.driverNames?.[1] || fresh.driverNames[1]],
      stats: { ...fresh.stats, ...(data.stats ?? {}) },
      version: SAVE_VERSION,
    };
  } catch {
    return fresh;
  }
}

export function saveGame(state: GameState, store: Store = localStorage, now = Date.now()): void {
  state.lastSavedAt = now;
  store.setItem(SAVE_KEY, JSON.stringify(state));
}

export function resetGame(store: Store = localStorage): GameState {
  store.removeItem(SAVE_KEY);
  return newGame();
}
