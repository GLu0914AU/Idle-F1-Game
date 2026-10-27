import { describe, expect, it } from 'vitest';
import { carRating, incomePerSecond, sponsorMultiplier } from './economy';
import { AUTO_OFFLINE_CAP_S, FREE_OFFLINE_CAP_S, offlineEarnings } from './offline';
import { newGame } from './save';
import { CALENDAR, pickTrack } from './tracks';
import { pointAt } from './track';

describe('offline', () => {
  const base = () => newGame(0);
  const perSec = (s: ReturnType<typeof base>) => incomePerSecond(carRating(s.upgrades), sponsorMultiplier(s));

  it('ignores short gaps', () => {
    expect(offlineEarnings(base(), 30_000).earned).toBe(0);
  });

  it('pays half rate to free players', () => {
    const s = base();
    const r = offlineEarnings(s, 600_000);
    expect(r.seconds).toBe(600);
    expect(r.earned).toBe(Math.floor(perSec(s) * 600 * 0.5));
  });

  it('caps free players at 2h and paid players at 8h', () => {
    const s = base();
    expect(offlineEarnings(s, 20 * 3600_000).seconds).toBe(FREE_OFFLINE_CAP_S);
    s.autoUnlocked = true;
    const r = offlineEarnings(s, 20 * 3600_000);
    expect(r.seconds).toBe(AUTO_OFFLINE_CAP_S);
    expect(r.earned).toBe(Math.floor(perSec(s) * AUTO_OFFLINE_CAP_S));
  });

  it('handles a clock set in the past', () => {
    const s = base();
    s.lastSavedAt = 10_000_000;
    expect(offlineEarnings(s, 0).earned).toBe(0);
  });
});

describe('calendar', () => {
  it('has many distinct circuits', () => {
    expect(CALENDAR).toHaveLength(40);
    expect(new Set(CALENDAR.map((t) => t.name)).size).toBe(CALENDAR.length);
  });

  it('never picks the excluded circuit and varies', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = pickTrack(Math.random, 'Monaco');
      expect(t.name).not.toBe('Monaco');
      seen.add(t.name);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('every circuit stays inside the unit square and closes its loop', () => {
    for (const t of CALENDAR) {
      for (const pt of t.points) {
        expect(pt.x).toBeGreaterThan(-0.05);
        expect(pt.x).toBeLessThan(1.05);
        expect(pt.y).toBeGreaterThan(-0.05);
        expect(pt.y).toBeLessThan(1.05);
      }
      const start = pointAt(t, 0);
      const end = pointAt(t, t.length - 1e-9);
      expect(Math.hypot(start.x - end.x, start.y - end.y)).toBeLessThan(0.01);
    }
  });
});
