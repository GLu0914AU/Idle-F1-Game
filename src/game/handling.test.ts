import { describe, expect, it } from 'vitest';
import { handlingFactor } from './economy';
import { createRace, stepRace } from './race';
import { newStrategy, stepStrategy } from './strategy';
import { buildTrack, cornerShare, cornerness } from './track';
import { CALENDAR } from './tracks';

const oval = buildTrack('Oval', [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
]);

describe('handling', () => {
  it('track profile separates straights from corners', () => {
    // Opposite ends of the first long side are straight; a corner sits near the end of that side.
    const values = Array.from({ length: 100 }, (_, i) => cornerness(oval, i / 100));
    expect(Math.min(...values)).toBeLessThan(0.15);
    expect(Math.max(...values)).toBeGreaterThan(0.4);
    expect(cornerShare(oval)).toBeGreaterThan(0);
    expect(cornerShare(oval)).toBeLessThan(1);
  });

  it('every real circuit has both corners and straights', () => {
    for (const t of CALENDAR) {
      const share = cornerShare(t);
      expect(share, t.name).toBeGreaterThan(0.02);
      expect(share, t.name).toBeLessThan(0.98);
    }
  });

  it('top speed helps on straights, cornering in corners, with diminishing returns', () => {
    const top = { topSpeed: 10, cornering: 0 };
    const corner = { topSpeed: 0, cornering: 10 };
    expect(handlingFactor(top, 0)).toBeGreaterThan(handlingFactor(top, 1));
    expect(handlingFactor(corner, 1)).toBeGreaterThan(handlingFactor(corner, 0));
    expect(handlingFactor({ topSpeed: 0, cornering: 0 }, 0.5)).toBe(1);
    const gain = (l: number) => handlingFactor({ topSpeed: l, cornering: 0 }, 0) - 1;
    expect(gain(20) - gain(10)).toBeLessThan(gain(10) - gain(0));
    expect(gain(1e6)).toBeLessThan(0.3001);
  });

  it('handling upgrades make a player car faster than identical one without', () => {
    const run = (handling?: { topSpeed: number; cornering: number }) => {
      const race = createRace({ track: CALENDAR[0], laps: 3, season: 1, playerRating: 50, playerTeamName: 'T', seed: 7 });
      const s = newStrategy();
      while (!race.finished) stepRace(race, 1, 1, { strategy: s, pitCrew: 0, handling });
      return race.cars.find((c) => c.id === 'player-0')!.finishTime!;
    };
    expect(run({ topSpeed: 20, cornering: 20 })).toBeLessThan(run());
  });

  it('tyre science slows wear and energy recovery slows boost decay', () => {
    const L = { tapPower: 0, pitCrew: 0, tyres: 0 };
    const a = newStrategy();
    const b = newStrategy();
    stepStrategy(a, 100, L);
    stepStrategy(b, 100, { ...L, tyreScience: 10 });
    expect(b.wear).toBeLessThan(a.wear);
    const c = newStrategy();
    const d = newStrategy();
    c.boost = d.boost = 1;
    stepStrategy(c, 1, L);
    stepStrategy(d, 1, { ...L, energyRecovery: 10 });
    expect(d.boost).toBeGreaterThan(c.boost);
  });
});
