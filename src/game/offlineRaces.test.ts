import { describe, expect, it } from 'vitest';
import { mulberry32 } from './race';
import { AUTO_OFFLINE_CAP_S, FREE_OFFLINE_CAP_S } from './offline';
import { OFFLINE_RACE_SECONDS, applyOffline, simulateOffline } from './offlineRaces';
import { GameState, newGame } from './save';

const away = (secs: number, tweak: (s: GameState) => void = () => undefined) => {
  const s = newGame(0);
  s.bestSeason = 6;
  tweak(s);
  return { s, report: simulateOffline(s, secs * 1000, mulberry32(7)) };
};

describe('offline races', () => {
  it('ignores short gaps', () => {
    expect(away(30).report).toBeNull();
  });

  it('plays one race per minute away', () => {
    const { report } = away(5 * OFFLINE_RACE_SECONDS + 10);
    expect(report!.races).toBe(5);
    expect(report!.next.race).toBeGreaterThan(1);
  });

  it('does nothing to the live state until applied', () => {
    const { s, report } = away(600);
    expect(s.race).toBe(1);
    expect(s.money).toBe(0);
    applyOffline(s, report!);
    expect(s.race).toBe(report!.next.race);
    expect(s.money).toBe(report!.next.money);
  });

  it('is deterministic for a given seed', () => {
    expect(away(900).report!.next.money).toBe(away(900).report!.next.money);
  });

  it('never goes past the best season reached before', () => {
    const { report } = away(AUTO_OFFLINE_CAP_S, (s) => {
      s.autoUnlocked = true;
      s.bestSeason = 3;
    });
    expect(report!.next.season).toBeLessThanOrEqual(3);
    expect(report!.races).toBeLessThanOrEqual(AUTO_OFFLINE_CAP_S / OFFLINE_RACE_SECONDS);
  }, 30000);

  it('only pays money when already at the best season', () => {
    const { report } = away(3600, (s) => {
      s.bestSeason = 1;
    });
    expect(report!.races).toBe(0);
    expect(report!.income).toBeGreaterThan(0);
  });

  it('respects the free time cap and caps races', () => {
    const { report } = away(100 * 3600);
    expect(report!.seconds).toBe(FREE_OFFLINE_CAP_S);
    expect(report!.races).toBeLessThanOrEqual(FREE_OFFLINE_CAP_S / OFFLINE_RACE_SECONDS);
  });

  it('counts lifetime stats but not daily goals', () => {
    const { s, report } = away(600);
    expect(report!.next.goals.counters.race).toBe(report!.races);
    expect(report!.next.goals.daily).toEqual(s.goals.daily);
  });

  it('runs a full free-cap absence quickly', () => {
    const t = Date.now();
    away(FREE_OFFLINE_CAP_S);
    expect(Date.now() - t).toBeLessThan(20000);
  });
});
