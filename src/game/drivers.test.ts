import { describe, expect, it } from 'vitest';
import {
  DRIVER_MEETING_CLOUT,
  DriverState,
  endDriverMeeting,
  offerContract,
  openingOffer,
  payDrivers,
  raceCraftBonus,
  requestDriverMeeting,
  rookie,
} from './drivers';
import { newGame } from './save';
import { createRace, stepRace, breakdownChance } from './race';
import { runFanEvent } from './career';
import { prestige } from './prestige';
import { PLAYER_DRIVERS } from './teams';
import { CALENDAR } from './tracks';

const state = (): DriverState & ReturnType<typeof newGame> => ({ ...newGame(), clout: 5 });
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('driver negotiations', () => {
  it('costs clout and needs enough of it', () => {
    const s = state();
    s.clout = DRIVER_MEETING_CLOUT - 1;
    expect(requestDriverMeeting(s)).toBeNull();
    s.clout = 5;
    const c = requestDriverMeeting(s, seq(0.5));
    expect(c).not.toBeNull();
    expect(s.clout).toBe(5 - DRIVER_MEETING_CLOUT);
    expect(requestDriverMeeting(s)).toBeNull();
  });

  it('signs at or above the hidden minimum into the chosen seat', () => {
    const s = state();
    const c = requestDriverMeeting(s, seq(0.5))!;
    const result = offerContract(s, 1, c.secret);
    expect(result.outcome).toBe('signed');
    expect(s.drivers[1].salary).toBe(c.secret);
    expect(s.drivers[1].skill).toBe(c.stats.skill);
    expect(s.driverNames[1]).toBe(c.name);
    expect(s.drivers[0]).toEqual(rookie());
    expect(s.driverMeeting).toBeNull();
  });

  it('fails below the minimum and still ends the meeting', () => {
    const s = state();
    const c = requestDriverMeeting(s, seq(0.5))!;
    expect(offerContract(s, 0, c.secret - 1).outcome).toBe('failed');
    expect(s.driverMeeting).toBeNull();
    expect(s.drivers[0]).toEqual(rookie());
  });

  it('shows an estimate that brackets the minimum, and better drivers ask for more', () => {
    const lowQ = requestDriverMeeting(state(), seq(0.5, 0, 0.5, 0.5, 0.5, 0.5, 0.5))!;
    const highQ = requestDriverMeeting(state(), seq(0.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5))!;
    for (const c of [lowQ, highQ]) {
      expect(c.lo).toBeLessThanOrEqual(c.secret);
      expect(c.hi).toBeGreaterThanOrEqual(c.secret);
      expect(openingOffer(c)).toBeGreaterThan(0);
    }
    expect(highQ.stats.skill).toBeGreaterThan(lowQ.stats.skill);
    expect(highQ.secret).toBeGreaterThan(lowQ.secret);
  });

  it('can be abandoned without a refund', () => {
    const s = state();
    requestDriverMeeting(s);
    endDriverMeeting(s);
    expect(s.driverMeeting).toBeNull();
    expect(s.clout).toBe(5 - DRIVER_MEETING_CLOUT);
  });
});

describe('wages', () => {
  it('are paid per driver after a race', () => {
    const s = state();
    s.money = 1000;
    s.drivers[0].salary = 100;
    s.drivers[1].salary = 250;
    expect(payDrivers(s)).toEqual({ paid: 350, quit: [] });
    expect(s.money).toBe(650);
  });

  it('make a driver quit when unaffordable, replaced by a free rookie', () => {
    const s = state();
    s.money = 120;
    s.driverNames[1] = 'Big Name';
    s.drivers[0].salary = 100;
    s.drivers[1] = { ...rookie(), skill: 20, salary: 500 };
    const r = payDrivers(s);
    expect(r.quit).toEqual(['Big Name']);
    expect(s.money).toBe(20);
    expect(s.drivers[1]).toEqual(rookie());
    expect(s.driverNames[1]).toBe(PLAYER_DRIVERS[1]);
  });

  it('never charge rookies', () => {
    const s = state();
    expect(payDrivers(s)).toEqual({ paid: 0, quit: [] });
  });
});

describe('persistence', () => {
  it('drivers and clout survive prestige', () => {
    const s = state();
    s.season = 5;
    s.drivers[0] = { ...rookie(), skill: 10, salary: 50 };
    prestige(s);
    expect(s.drivers[0].skill).toBe(10);
    expect(s.clout).toBe(5);
  });

  it('the Fan Event can drop clout', () => {
    const s = { ...newGame(), clout: 0 };
    s.stats.racesWon = 50;
    const drops = runFanEvent(s, 10, () => 0);
    expect(drops?.clout).toBeGreaterThan(0);
    expect(s.clout).toBe(drops?.clout);
  });
});

describe('driver effects in a race', () => {
  const cfg = (stats?: ReturnType<typeof rookie>) => ({
    track: CALENDAR[0],
    laps: 5,
    season: 1,
    playerRating: 50,
    playerTeamName: 'T',
    seed: 7,
    playerDriverStats: stats ? ([stats, rookie()] as const) : undefined,
  });

  it('skill raises the car rating', () => {
    const a = createRace(cfg()).cars[0].rating;
    const b = createRace(cfg({ ...rookie(), skill: 20 })).cars[0].rating;
    expect(b).toBeCloseTo(a * 1.2);
  });

  it('consistency lowers the breakdown rate', () => {
    const count = (consistency: number) => {
      let n = 0;
      for (let seed = 0; seed < 400; seed++) {
        const race = createRace({ ...cfg({ ...rookie(), consistency }), seed });
        if (race.cars[0].fault) n++;
      }
      return n;
    };
    expect(count(10)).toBeLessThan(count(0));
    expect(breakdownChance(0)).toBeGreaterThan(0);
  });

  it('race craft helps most at the start', () => {
    expect(raceCraftBonus(5, 0)).toBeCloseTo(1.05);
    expect(raceCraftBonus(5, 0.5)).toBeCloseTo(1.025);
    expect(raceCraftBonus(5, 1.5)).toBe(1);
    const run = (raceCraft: number) => {
      const race = createRace(cfg({ ...rookie(), raceCraft }));
      race.cars.forEach((c) => (c.fault = undefined));
      for (let i = 0; i < 20; i++) stepRace(race, 1);
      return race.cars[0].progress;
    };
    expect(run(10)).toBeGreaterThan(run(0));
  });
});
