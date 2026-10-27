import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  DAILY_BONUS_GEMS,
  DAILY_COUNT,
  STREAK_BONUS_CAP,
  achievementReady,
  canClaimBonus,
  claimAchievement,
  claimDaily,
  claimDailyBonus,
  claimableCount,
  dailyBonusReward,
  dailyDef,
  ensureToday,
  mergeGoals,
  recordEvent,
  recordRaceResult,
  rollDaily,
  streakCount,
} from './goals';
import { newGame } from './save';

const day = (n: number) => new Date(2030, 0, n, 12);

function finishAllDaily(s: ReturnType<typeof newGame>, now: Date) {
  ensureToday(s, now);
  for (const g of s.goals.daily.goals) g.progress = dailyDef(g.id)!.target;
  s.goals.daily.goals.forEach((_, i) => claimDaily(s, i, now));
}

describe('daily goals', () => {
  it('rolls the same goals for the same date', () => {
    expect(rollDaily('2030-01-01')).toEqual(rollDaily('2030-01-01'));
    expect(rollDaily('2030-01-01').goals).toHaveLength(DAILY_COUNT);
  });

  it('rolls new goals when the date changes and keeps them within a day', () => {
    const s = newGame();
    ensureToday(s, day(1));
    s.goals.daily.goals[0].progress = 1;
    ensureToday(s, day(1));
    expect(s.goals.daily.goals[0].progress).toBe(1);
    ensureToday(s, day(2));
    expect(s.goals.daily.date).toBe('2030-01-02');
    expect(s.goals.daily.goals.every((g) => g.progress === 0)).toBe(true);
  });

  it('claims each goal once and pays its reward', () => {
    const s = newGame();
    const now = day(1);
    ensureToday(s, now);
    expect(claimDaily(s, 0, now)).toBe(false);
    s.goals.daily.goals[0].progress = dailyDef(s.goals.daily.goals[0].id)!.target;
    const before = s.gems + s.clout;
    expect(claimDaily(s, 0, now)).toBe(true);
    expect(s.gems + s.clout).toBeGreaterThan(before);
    expect(claimDaily(s, 0, now)).toBe(false);
  });

  it('only pays the bonus once every goal is claimed, and once per day', () => {
    const s = newGame();
    const now = day(1);
    ensureToday(s, now);
    expect(claimDailyBonus(s, now)).toBe(false);
    finishAllDaily(s, now);
    expect(canClaimBonus(s)).toBe(true);
    const gems = s.gems;
    expect(claimDailyBonus(s, now)).toBe(true);
    expect(s.gems).toBe(gems + DAILY_BONUS_GEMS + 1);
    expect(claimDailyBonus(s, now)).toBe(false);
  });

  it('grows the streak on consecutive days, caps the bonus, and resets after a gap', () => {
    const s = newGame();
    for (let d = 1; d <= 8; d++) {
      finishAllDaily(s, day(d));
      claimDailyBonus(s, day(d));
    }
    expect(streakCount(s, day(8))).toBe(8);
    expect(dailyBonusReward(s, day(9)).gems).toBe(DAILY_BONUS_GEMS + STREAK_BONUS_CAP);
    expect(streakCount(s, day(10))).toBe(0);
    expect(dailyBonusReward(s, day(10)).gems).toBe(DAILY_BONUS_GEMS + 1);
  });
});

describe('events', () => {
  it('counts race results', () => {
    const s = newGame();
    recordRaceResult(s, [1, 5], true, day(1));
    expect(s.goals.counters).toMatchObject({ race: 1, podium: 1, win: 1, wetWin: 1 });
    recordRaceResult(s, [4, 6], false, day(1));
    expect(s.goals.counters).toMatchObject({ race: 2, podium: 1, win: 1, wetWin: 1 });
  });

  it('advances matching daily goals, capped at the target', () => {
    const s = newGame();
    s.goals.daily = { date: '2030-01-01', bonusClaimed: false, goals: [{ id: 'taps', progress: 0, claimed: false }] };
    recordEvent(s, 'tap', 1000, day(1));
    expect(s.goals.daily.goals[0].progress).toBe(dailyDef('taps')!.target);
    expect(s.goals.counters.tap).toBe(1000);
  });
});

describe('achievements', () => {
  it('claims once and pays out', () => {
    const s = newGame();
    const a = ACHIEVEMENTS.find((x) => x.value(s) < x.target && x.id !== undefined)!;
    expect(claimAchievement(s, a.id)).toBe(false);
    const wins = ACHIEVEMENTS.find((x) => x.id === 'wins1' || x.target === 1)!;
    expect(wins).toBeDefined();
    s.goals.counters.win = 1000;
    s.goals.counters.race = 1000;
    s.goals.counters.podium = 1000;
    const ready = ACHIEVEMENTS.filter((x) => achievementReady(s, x));
    expect(ready.length).toBeGreaterThan(0);
    const id = ready[0].id;
    expect(claimAchievement(s, id)).toBe(true);
    expect(claimAchievement(s, id)).toBe(false);
    expect(claimableCount(s, day(1))).toBeGreaterThanOrEqual(ready.length - 1);
  });

  it('has unique ids and sane rewards', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.target).toBeGreaterThan(0);
      expect(a.reward.gems ?? 0).toBeLessThanOrEqual(25);
    }
  });
});

describe('save migration', () => {
  it('gives old saves a fresh goals state and keeps valid saved data', () => {
    expect(mergeGoals(undefined).claimed).toEqual([]);
    const merged = mergeGoals({ claimed: ['x'], counters: { win: 3 } as never });
    expect(merged.claimed).toEqual(['x']);
    expect(merged.counters.win).toBe(3);
    expect(merged.counters.race).toBe(0);
  });
});
