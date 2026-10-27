import { CareerStats } from './career';
import { Development, newDevelopment } from './development';
import { FacilityKey, newFacilities } from './facilities';
import { AudioSettings, mergeAudioSettings, newAudioSettings } from './audio';
import { GoalsState, mergeGoals, newGoals } from './goals';
import { Candidate, Driver, rookie } from './drivers';
import type { Engineer, EngineerCandidate } from './engineers';
import { newStaff, newStaffMeetings } from './staff';
import type { StaffCandidate, StaffMember, StaffRole } from './staff';
import { PLAYER_COLOR, PLAYER_DRIVERS } from './teams';
import { TUTORIAL_DONE } from './tutorial';

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
  // Which car upgrades Auto Buy may buy; a missing key counts as ticked.
  autoItems: Record<string, boolean>;
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
  // Clout opens driver negotiations. Drivers, their stats and the open negotiation all survive prestige.
  clout: number;
  drivers: [Driver, Driver];
  driverMeeting: Candidate | null;
  // The race engineer runs strategy for both cars, and survives prestige like drivers do.
  engineer: Engineer | null;
  engineerMeeting: EngineerCandidate | null;
  // Specialist staff by role and the open negotiation for each; like the engineer they survive prestige.
  staff: Record<StaffRole, StaffMember | null>;
  staffMeetings: Record<StaffRole, StaffCandidate | null>;
  // Mid-season car development; it resets every season.
  development: Development;
  // Achievements, daily goals and the streak; they survive prestige.
  goals: GoalsState;
  // Gem-bought buildings by level; they survive prestige.
  facilities: Record<FacilityKey, number>;
  // Sound, music and haptics preferences.
  settings: AudioSettings;
  // First-run guide progress; see tutorial.ts.
  tutorial: number;
  tutorialRewarded: boolean;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'idle-f1-save';
// New teams earn their first clout from the tutorial reward and goals.
export const STARTING_CLOUT = 0;

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
    autoItems: {},
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
    clout: STARTING_CLOUT,
    drivers: [rookie(), rookie()],
    driverMeeting: null,
    engineer: null,
    engineerMeeting: null,
    staff: newStaff(),
    staffMeetings: newStaffMeetings(),
    development: newDevelopment(),
    goals: newGoals(),
    facilities: newFacilities(),
    settings: newAudioSettings(),
    tutorial: 0,
    tutorialRewarded: false,
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadGame(store: Store = localStorage, now = Date.now()): GameState {
  const fresh = newGame(now);
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return fresh;
    const data = JSON.parse(raw) as Partial<GameState> & { autoStrategy?: boolean };
    if (typeof data !== 'object' || data === null) return fresh;
    // Auto Strategy was replaced by the race engineer.
    delete data.autoStrategy;
    // Merge over defaults so saves from older versions gain new fields.
    return {
      ...fresh,
      ...data,
      upgrades: { ...fresh.upgrades, ...(data.upgrades ?? {}) },
      points: { ...(data.points ?? {}) },
      autoItems: { ...(data.autoItems ?? {}) },
      driverPoints: { ...(data.driverPoints ?? {}) },
      research: { ...(data.research ?? {}) },
      sponsorList: [...(data.sponsorList ?? [])],
      driverNames: [data.driverNames?.[0] || fresh.driverNames[0], data.driverNames?.[1] || fresh.driverNames[1]],
      stats: { ...fresh.stats, ...(data.stats ?? {}) },
      drivers: [{ ...rookie(), ...(data.drivers?.[0] ?? {}) }, { ...rookie(), ...(data.drivers?.[1] ?? {}) }],
      development: { ...fresh.development, ...(data.development ?? {}), rivalDrift: { ...(data.development?.rivalDrift ?? {}) } },
      staff: { ...fresh.staff, ...(data.staff ?? {}) },
      staffMeetings: { ...fresh.staffMeetings, ...(data.staffMeetings ?? {}) },
      goals: mergeGoals(data.goals),
      facilities: { ...fresh.facilities, ...(data.facilities ?? {}) },
      settings: mergeAudioSettings(data.settings),
      // Saves from before the tutorial existed are experienced players.
      tutorial: data.tutorial ?? TUTORIAL_DONE,
      tutorialRewarded: data.tutorialRewarded ?? true,
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
