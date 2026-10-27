import { describe, expect, it } from 'vitest';
import { PIT_HALF_LENGTH, newStrategy, togglePitRequest } from './strategy';
import { createRace, lapTime, paceMultiplier, standings, stepRace } from './race';
import { pointAt } from './track';
import { CALENDAR } from './tracks';

const TEST_TRACK = CALENDAR.find((t) => t.name === 'Monaco')!;

function config(over = {}) {
  return { track: TEST_TRACK, laps: 3, season: 1, playerRating: 10, playerTeamName: 'Me', seed: 1, ...over };
}

function runToEnd(race: ReturnType<typeof createRace>) {
  for (let i = 0; i < 100000 && !race.finished; i++) stepRace(race, 0.5);
}

describe('track', () => {
  it('wraps positions each lap', () => {
    const a = pointAt(TEST_TRACK, 0.3);
    const b = pointAt(TEST_TRACK, 0.3 + TEST_TRACK.length * 2);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });
});

describe('pace', () => {
  it('has diminishing returns', () => {
    const g1 = paceMultiplier(100) - paceMultiplier(0);
    const g2 = paceMultiplier(200) - paceMultiplier(100);
    expect(g2).toBeLessThan(g1);
    expect(lapTime(100)).toBeLessThan(lapTime(0));
  });
});

describe('race', () => {
  it('has 2 player cars and 18 rivals', () => {
    const race = createRace(config());
    expect(race.cars).toHaveLength(20);
    expect(race.cars.filter((c) => c.isPlayer)).toHaveLength(2);
  });

  it('is deterministic for a seed', () => {
    const a = createRace(config());
    const b = createRace(config());
    runToEnd(a);
    runToEnd(b);
    expect(standings(a).map((c) => c.id)).toEqual(standings(b).map((c) => c.id));
  });

  it('finishes with every car crossing the line in order', () => {
    const race = createRace(config());
    runToEnd(race);
    expect(race.finished).toBe(true);
    const times = standings(race).map((c) => c.finishTime as number);
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it('a much stronger player wins', () => {
    const race = createRace(config({ playerRating: 500 }));
    runToEnd(race);
    expect(standings(race)[0].isPlayer).toBe(true);
  });

  it('a weak player finishes behind the front-runners', () => {
    const race = createRace(config({ playerRating: 0 }));
    runToEnd(race);
    expect(standings(race)[0].isPlayer).toBe(false);
  });

  it('NPC cars enter at the pit entrance, exit past the line, and fit fresh random tyres', () => {
    const race = createRace(config({ laps: 8 }));
    const npc = race.cars.filter((c) => !c.isPlayer);
    expect(npc.every((c) => c.tyres)).toBe(true);
    const stops = new Map<string, number>();
    const compounds = new Set<string>();
    let wasPitting = new Set<string>();
    for (let i = 0; i < 100000 && !race.finished; i++) {
      stepRace(race, 0.5);
      const now = new Set<string>();
      for (const c of npc) {
        if (c.pit) {
          now.add(c.id);
          if (!wasPitting.has(c.id)) {
            stops.set(c.id, (stops.get(c.id) ?? 0) + 1);
            // The entrance is just before the line, never at or after it.
            expect(c.pit.start - Math.floor(c.pit.start)).toBeCloseTo(1 - PIT_HALF_LENGTH, 5);
          }
        } else if (wasPitting.has(c.id)) {
          expect(c.tyres!.wear).toBe(0);
          expect(c.progress - Math.floor(c.progress)).toBeLessThan(PIT_HALF_LENGTH + 0.02);
          compounds.add(c.tyres!.compound);
        }
      }
      wasPitting = now;
    }
    expect(stops.size).toBeGreaterThan(10);
    expect(compounds.size).toBeGreaterThan(1);
  });

  it('NPCs never start a stop on the final lap', () => {
    const race = createRace(config({ laps: 3 }));
    runToEnd(race);
    for (const c of race.cars.filter((x) => !x.isPlayer)) expect(c.pit).toBeUndefined();
  });

  it('both player cars make one stop per call, entering independently', () => {
    const race = createRace(config({ laps: 6 }));
    const s = newStrategy();
    s.wear = 0.8;
    s.nextCompound = 'hard';
    togglePitRequest(s);
    const team = { strategy: s, pitCrew: 0 };
    const players = race.cars.filter((c) => c.isPlayer);
    expect(players.length).toBe(2);
    let entries = 0;
    let was = [false, false];
    for (let i = 0; i < 100000 && !race.finished; i++) {
      stepRace(race, 0.5, 1, team);
      players.forEach((c, k) => {
        if (c.pit && !was[k]) entries++;
        was[k] = !!c.pit;
      });
    }
    expect(entries).toBe(2);
    expect(s.pitRequested).toBe(false);
    expect(s.compound).toBe('hard');
    expect(s.wear).toBeLessThan(0.8);
  });

  it('rivals get stronger in later seasons', () => {
    const s1 = createRace(config({ season: 1 }));
    const s5 = createRace(config({ season: 5 }));
    const rival = (r: typeof s1) => r.cars.find((c) => c.id === 'mclaren-0')!.rating;
    expect(rival(s5)).toBeGreaterThan(rival(s1));
  });
});
