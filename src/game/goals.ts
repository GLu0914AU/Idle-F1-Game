import type { GameState } from './save';

// Achievements are one-time milestones; daily goals are three small tasks that reset at local midnight.
// Everything is collected by tapping, and it all survives prestige.
export interface Reward {
  gems?: number;
  clout?: number;
  rp?: number;
}

export type GoalEvent = 'race' | 'win' | 'podium' | 'pit' | 'tap' | 'devStart' | 'breakthrough' | 'flop' | 'wetWin';
const EVENTS: GoalEvent[] = ['race', 'win', 'podium', 'pit', 'tap', 'devStart', 'breakthrough', 'flop', 'wetWin'];

export interface DailyGoal {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface GoalsState {
  // Lifetime counts for every event.
  counters: Record<GoalEvent, number>;
  // Ids of achievements already collected.
  claimed: string[];
  daily: { date: string; goals: DailyGoal[]; bonusClaimed: boolean };
  // Consecutive days on which the daily bonus was collected, and the last such date.
  streak: { count: number; last: string };
}

export const newGoals = (): GoalsState => ({
  counters: Object.fromEntries(EVENTS.map((e) => [e, 0])) as Record<GoalEvent, number>,
  claimed: [],
  daily: { date: '', goals: [], bonusClaimed: false },
  streak: { count: 0, last: '' },
});

// Fills gaps so saves from older versions (or with partial data) load cleanly.
export function mergeGoals(saved: Partial<GoalsState> | undefined): GoalsState {
  const fresh = newGoals();
  if (!saved || typeof saved !== 'object') return fresh;
  return {
    counters: { ...fresh.counters, ...(saved.counters ?? {}) },
    claimed: [...(saved.claimed ?? [])],
    daily: {
      date: saved.daily?.date ?? '',
      goals: (saved.daily?.goals ?? []).map((g) => ({ ...g })),
      bonusClaimed: saved.daily?.bonusClaimed ?? false,
    },
    streak: { ...fresh.streak, ...(saved.streak ?? {}) },
  };
}

type GoalsHolder = Pick<GameState, 'goals' | 'gems' | 'clout' | 'researchPoints'>;

export function applyReward(state: GoalsHolder, r: Reward): void {
  state.gems += r.gems ?? 0;
  state.clout += r.clout ?? 0;
  state.researchPoints += r.rp ?? 0;
}

export function rewardLabel(r: Reward): string {
  const parts: string[] = [];
  if (r.gems) parts.push(`${r.gems} gem${r.gems === 1 ? '' : 's'}`);
  if (r.clout) parts.push(`${r.clout} clout`);
  if (r.rp) parts.push(`${r.rp} RP`);
  return `+${parts.join(' +')}`;
}

// ---- Achievements ----

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  target: number;
  value: (s: GameState) => number;
  reward: Reward;
}

const hired = (s: GameState) => s.drivers.filter((d) => d.salary > 0).length;
const staffHired = (s: GameState) => Object.values(s.staff ?? {}).filter(Boolean).length;
const count = (e: GoalEvent) => (s: GameState) => s.goals.counters[e];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'win-1', name: 'First Victory', desc: 'Win a race', target: 1, value: (s) => s.stats.racesWon, reward: { gems: 2 } },
  { id: 'win-10', name: 'Regular Winner', desc: 'Win 10 races', target: 10, value: (s) => s.stats.racesWon, reward: { gems: 5 } },
  { id: 'win-50', name: 'Race Winner', desc: 'Win 50 races', target: 50, value: (s) => s.stats.racesWon, reward: { rp: 2 } },
  { id: 'win-200', name: 'Living Legend', desc: 'Win 200 races', target: 200, value: (s) => s.stats.racesWon, reward: { rp: 5 } },
  { id: 'podium-10', name: 'Podium Regular', desc: 'Finish on the podium 10 times', target: 10, value: count('podium'), reward: { gems: 3 } },
  { id: 'podium-50', name: 'Champagne Habit', desc: 'Finish on the podium 50 times', target: 50, value: count('podium'), reward: { gems: 6 } },
  { id: 'wdc-1', name: "Drivers' Champion", desc: "Win a Drivers' title", target: 1, value: (s) => s.stats.wdc, reward: { gems: 5 } },
  { id: 'wdc-3', name: 'Triple Crown', desc: "Win 3 Drivers' titles", target: 3, value: (s) => s.stats.wdc, reward: { clout: 2 } },
  { id: 'wdc-10', name: 'Dynasty', desc: "Win 10 Drivers' titles", target: 10, value: (s) => s.stats.wdc, reward: { rp: 3 } },
  { id: 'wcc-1', name: "Constructors' Champion", desc: "Win a Constructors' title", target: 1, value: (s) => s.stats.wcc, reward: { gems: 5 } },
  { id: 'wcc-3', name: 'Team of the Decade', desc: "Win 3 Constructors' titles", target: 3, value: (s) => s.stats.wcc, reward: { clout: 2 } },
  { id: 'season-5', name: 'Rising Team', desc: 'Reach Season 5', target: 5, value: (s) => Math.max(s.season, s.bestSeason), reward: { gems: 3 } },
  { id: 'season-10', name: 'Established', desc: 'Reach Season 10', target: 10, value: (s) => Math.max(s.season, s.bestSeason), reward: { clout: 2 } },
  { id: 'season-20', name: 'Powerhouse', desc: 'Reach Season 20', target: 20, value: (s) => Math.max(s.season, s.bestSeason), reward: { rp: 5 } },
  { id: 'prestige-1', name: 'Fresh Start', desc: 'Prestige for the first time', target: 1, value: (s) => s.prestiges, reward: { gems: 5 } },
  { id: 'prestige-5', name: 'Veteran', desc: 'Prestige 5 times', target: 5, value: (s) => s.prestiges, reward: { rp: 3 } },
  { id: 'hire-driver', name: 'Talent Scout', desc: 'Sign a driver', target: 1, value: hired, reward: { clout: 1 } },
  { id: 'hire-both', name: 'Dream Line-up', desc: 'Have both seats filled by signed drivers', target: 2, value: hired, reward: { gems: 3 } },
  { id: 'hire-engineer', name: 'Pit Wall Brain', desc: 'Sign a race engineer', target: 1, value: (s) => (s.engineer ? 1 : 0), reward: { clout: 1 } },
  { id: 'hire-staff', name: 'Full Factory', desc: 'Fill all 3 specialist roles', target: 3, value: staffHired, reward: { gems: 5 } },
  { id: 'dev-big', name: 'Eureka!', desc: 'Land a development breakthrough', target: 1, value: count('breakthrough'), reward: { gems: 3 } },
  { id: 'dev-big-5', name: 'Innovators', desc: 'Land 5 development breakthroughs', target: 5, value: count('breakthrough'), reward: { clout: 2 } },
  { id: 'dev-flop', name: 'Back to the Drawing Board', desc: 'Suffer a development flop', target: 1, value: count('flop'), reward: { gems: 1 } },
  { id: 'wet-win', name: 'Rain Master', desc: 'Win a race in the rain', target: 1, value: count('wetWin'), reward: { gems: 3 } },
  { id: 'pits-50', name: 'Pit Lane Regular', desc: 'Make 50 pit stops', target: 50, value: count('pit'), reward: { gems: 2 } },
  { id: 'pits-500', name: 'Pit Lane Legend', desc: 'Make 500 pit stops', target: 500, value: count('pit'), reward: { gems: 5 } },
  { id: 'taps-1000', name: 'Busy Fingers', desc: 'Tap 1,000 times', target: 1000, value: count('tap'), reward: { gems: 3 } },
  { id: 'taps-10000', name: 'Tap Dancer', desc: 'Tap 10,000 times', target: 10000, value: count('tap'), reward: { gems: 5 } },
];

export const achievementDef = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
export const achievementValue = (s: GameState, a: AchievementDef) => Math.min(a.target, a.value(s));
export const achievementClaimed = (s: GameState, a: AchievementDef) => s.goals.claimed.includes(a.id);
export const achievementReady = (s: GameState, a: AchievementDef) => !achievementClaimed(s, a) && a.value(s) >= a.target;
export const readyAchievements = (s: GameState) => ACHIEVEMENTS.filter((a) => achievementReady(s, a));

export function claimAchievement(s: GameState, id: string): boolean {
  const a = achievementDef(id);
  if (!a || !achievementReady(s, a)) return false;
  s.goals.claimed.push(id);
  applyReward(s, a.reward);
  return true;
}

// ---- Daily goals ----

export interface DailyDef {
  id: string;
  label: string;
  event: GoalEvent;
  target: number;
  reward: Reward;
}

export const DAILY_POOL: DailyDef[] = [
  { id: 'races', label: 'Finish races', event: 'race', target: 3, reward: { gems: 1 } },
  { id: 'pits', label: 'Make pit stops', event: 'pit', target: 6, reward: { gems: 1 } },
  { id: 'taps', label: 'Tap the track', event: 'tap', target: 150, reward: { clout: 1 } },
  { id: 'dev', label: 'Start a car development package', event: 'devStart', target: 1, reward: { gems: 1 } },
  { id: 'podium', label: 'Finish on the podium', event: 'podium', target: 1, reward: { gems: 2 } },
];

export const DAILY_COUNT = 3;
export const DAILY_BONUS_GEMS = 2;
export const STREAK_BONUS_CAP = 5;

export const dailyDef = (id: string) => DAILY_POOL.find((d) => d.id === id);

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const yesterdayKey = (now: Date) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

// Real milliseconds until the next local midnight, when the goals are replaced.
export const msUntilReset = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

// The same date always gives the same goals.
function seededRng(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDaily(date: string): GoalsState['daily'] {
  const rng = seededRng(date);
  const pool = [...DAILY_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { date, goals: pool.slice(0, DAILY_COUNT).map((d) => ({ id: d.id, progress: 0, claimed: false })), bonusClaimed: false };
}

// Replaces yesterday's goals once the date changes. Unclaimed goals from a past day are lost.
export function ensureToday(s: Pick<GameState, 'goals'>, now = new Date()): void {
  const today = dayKey(now);
  if (s.goals.daily.date !== today || s.goals.daily.goals.length === 0) s.goals.daily = rollDaily(today);
}

export function recordEvent(s: Pick<GameState, 'goals'>, event: GoalEvent, n = 1, now = new Date()): void {
  s.goals.counters[event] += n;
  ensureToday(s, now);
  for (const g of s.goals.daily.goals) {
    const def = dailyDef(g.id);
    if (def && def.event === event) g.progress = Math.min(def.target, g.progress + n);
  }
}

// Everything a finished race adds up to. `positions` are the player's finishing places, best first.
export function recordRaceResult(s: Pick<GameState, 'goals'>, positions: number[], wet: boolean, now = new Date()): void {
  recordEvent(s, 'race', 1, now);
  const best = positions[0] ?? Infinity;
  if (best <= 3) recordEvent(s, 'podium', 1, now);
  if (best === 1) {
    recordEvent(s, 'win', 1, now);
    if (wet) recordEvent(s, 'wetWin', 1, now);
  }
}

export const dailyDone = (g: DailyGoal) => {
  const def = dailyDef(g.id);
  return !!def && g.progress >= def.target;
};

export function claimDaily(s: GoalsHolder, index: number, now = new Date()): boolean {
  ensureToday(s, now);
  const g = s.goals.daily.goals[index];
  const def = g && dailyDef(g.id);
  if (!g || !def || g.claimed || !dailyDone(g)) return false;
  g.claimed = true;
  applyReward(s, def.reward);
  return true;
}

// Days in a row the bonus has been collected, counting today's once it's claimed; zero if the chain has broken.
export function streakCount(s: Pick<GameState, 'goals'>, now = new Date()): number {
  const { last, count: n } = s.goals.streak;
  return last === dayKey(now) || last === yesterdayKey(now) ? n : 0;
}

export const allDailyClaimed = (s: Pick<GameState, 'goals'>) => s.goals.daily.goals.length > 0 && s.goals.daily.goals.every((g) => g.claimed);

// What the bonus would pay if claimed now.
export function dailyBonusReward(s: Pick<GameState, 'goals'>, now = new Date()): Reward {
  const next = s.goals.streak.last === yesterdayKey(now) ? s.goals.streak.count + 1 : 1;
  return { gems: DAILY_BONUS_GEMS + Math.min(next, STREAK_BONUS_CAP) };
}

export const canClaimBonus = (s: Pick<GameState, 'goals'>) => allDailyClaimed(s) && !s.goals.daily.bonusClaimed;

// Collect the bonus for finishing all three goals; it also extends the streak.
export function claimDailyBonus(s: GoalsHolder, now = new Date()): boolean {
  ensureToday(s, now);
  if (!canClaimBonus(s)) return false;
  const reward = dailyBonusReward(s, now);
  const today = dayKey(now);
  s.goals.streak = { count: s.goals.streak.last === yesterdayKey(now) ? s.goals.streak.count + 1 : 1, last: today };
  s.goals.daily.bonusClaimed = true;
  applyReward(s, reward);
  return true;
}

// How many things are waiting to be collected, for the notification dot.
export function claimableCount(s: GameState, now = new Date()): number {
  ensureToday(s, now);
  const daily = s.goals.daily.goals.filter((g) => !g.claimed && dailyDone(g)).length;
  return readyAchievements(s).length + daily + (canClaimBonus(s) ? 1 : 0);
}
