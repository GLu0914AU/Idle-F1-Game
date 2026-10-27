export interface GameState {
  version: number;
  teamName: string;
  money: number;
  gems: number;
  season: number;
  race: number;
  // Constructors' points this season, by team id.
  points: Record<string, number>;
  upgrades: Record<string, number>;
  autoUnlocked: boolean;
  teamNamed: boolean;
  autoBuy: boolean;
  autoStrategy: boolean;
  autoTap: boolean;
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
    upgrades: {
      engine: 0,
      aero: 0,
      tyres: 0,
      brakes: 0,
      reliability: 0,
      pitCrew: 0,
      tapPower: 0,
      sponsorDeals: 0,
    },
    autoUnlocked: false,
    teamNamed: false,
    autoBuy: false,
    autoStrategy: false,
    autoTap: false,
    boostSeconds: 0,
    sponsors: 1,
    lastSavedAt: now,
    researchPoints: 0,
    research: {},
    prestiges: 0,
    bestSeason: 1,
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
      research: { ...(data.research ?? {}) },
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
