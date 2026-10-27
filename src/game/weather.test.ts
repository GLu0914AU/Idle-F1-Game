import { describe, expect, it } from 'vitest';
import {
  DRY,
  RAIN_CHANCE,
  RAMP_LAPS,
  Weather,
  describeWeather,
  gripPenalty,
  idealClass,
  rollWeather,
  tyreClass,
  weatherFactor,
  wetnessAt,
} from './weather';
import { autoCompound, shouldAutoPit } from './auto';
import { createRace, mulberry32, stepRace } from './race';
import { newStrategy } from './strategy';
import { CALENDAR } from './tracks';

const RAIN: Weather = { rainStart: 1, rainEnd: null, peak: 1 };

describe('forecast', () => {
  it('is dry before the rain, ramps up, and holds', () => {
    expect(wetnessAt(RAIN, 0.5)).toBe(0);
    expect(wetnessAt(RAIN, 1 + RAMP_LAPS / 2)).toBeCloseTo(0.5);
    expect(wetnessAt(RAIN, 3)).toBe(1);
    expect(wetnessAt(DRY, 2)).toBe(0);
  });

  it('dries out again when the rain ends', () => {
    const w: Weather = { rainStart: 1, rainEnd: 2.5, peak: 0.6 };
    expect(wetnessAt(w, 2)).toBeCloseTo(0.6);
    expect(wetnessAt(w, 2.5 - RAMP_LAPS / 2)).toBeCloseTo(0.3);
    expect(wetnessAt(w, 3)).toBe(0);
  });

  it('rolls rain about as often as RAIN_CHANCE and never on the first lap', () => {
    const rng = mulberry32(5);
    let rainy = 0;
    for (let i = 0; i < 2000; i++) {
      const w = rollWeather(rng, 5);
      if (w.peak > 0) {
        rainy++;
        expect(w.rainStart).toBeGreaterThanOrEqual(0.5);
        expect(w.rainStart).toBeLessThanOrEqual(4);
        expect(w.peak).toBeGreaterThanOrEqual(0.35);
        if (w.rainEnd !== null) expect(w.rainEnd).toBeGreaterThan(w.rainStart + 1);
      }
    }
    expect(rainy / 2000).toBeGreaterThan(RAIN_CHANCE - 0.05);
    expect(rainy / 2000).toBeLessThan(RAIN_CHANCE + 0.05);
  });

  it('describes the forecast', () => {
    expect(describeWeather(DRY, 0)).toBe('DRY');
    expect(describeWeather({ rainStart: 2.2, rainEnd: null, peak: 0.5 }, 0)).toBe('LIGHT RAIN FROM LAP 3');
    expect(describeWeather(RAIN, 3)).toBe('HEAVY RAIN');
  });
});

describe('tyres in the weather', () => {
  it('the right class of tyre is fastest at each wetness', () => {
    const best = (w: number) =>
      (['soft', 'intermediate', 'wet'] as const).reduce((a, b) => (gripPenalty(b, w) < gripPenalty(a, w) ? b : a));
    expect(best(0)).toBe('soft');
    expect(best(0.5)).toBe('intermediate');
    expect(best(1)).toBe('wet');
    for (const w of [0, 0.15, 0.25, 0.4, 0.5, 0.6, 0.8, 1]) {
      expect(tyreClass(best(w))).toBe(idealClass(w) === 'dry' ? 'dry' : idealClass(w));
    }
  });

  it('wrong tyres cost a lot of pace', () => {
    expect(weatherFactor('hard', 1, 0)).toBeCloseTo(0.7);
    expect(weatherFactor('wet', 0, 0)).toBeCloseTo(0.7);
    expect(weatherFactor('wet', 1, 0)).toBe(1);
    expect(weatherFactor('medium', 0, 0)).toBe(1);
  });

  it('Race Craft cuts the loss', () => {
    expect(weatherFactor('hard', 1, 10)).toBeCloseTo(0.85);
    expect(weatherFactor('hard', 1, 10)).toBeGreaterThan(weatherFactor('hard', 1, 0));
    expect(weatherFactor('wet', 1, 10)).toBe(1);
  });
});

describe('Auto strategy', () => {
  it('picks the tyre for the conditions', () => {
    expect(autoCompound(1, 5, 0.5)).toBe('intermediate');
    expect(autoCompound(1, 5, 0.9)).toBe('wet');
    expect(autoCompound(1, 5, 0)).toBe('hard');
  });

  it('boxes when the tyres are wrong, but not to refit the same wrong class the player chose', () => {
    const s = newStrategy();
    expect(shouldAutoPit(s, 1, 5, 0)).toBe(false);
    expect(shouldAutoPit(s, 1, 5, 0.9)).toBe(true);
    s.compoundChosen = true;
    s.nextCompound = 'soft';
    expect(shouldAutoPit(s, 1, 5, 0.9)).toBe(false);
    s.nextCompound = 'wet';
    expect(shouldAutoPit(s, 1, 5, 0.9)).toBe(true);
    expect(shouldAutoPit(s, 4.5, 5, 0.9)).toBe(false);
  });
});

describe('weather in a race', () => {
  const cfg = (weather: Weather, seed = 3) => ({
    track: CALENDAR[0],
    laps: 5,
    season: 1,
    playerRating: 30,
    playerTeamName: 'Me',
    seed,
    weather,
  });
  const run = (race: ReturnType<typeof createRace>) => {
    race.cars.forEach((c) => (c.fault = undefined));
    for (let i = 0; i < 4000 && !race.finished; i++) stepRace(race, 0.5);
    return race;
  };

  it('a dry race is unaffected', () => {
    const a = run(createRace({ ...cfg(DRY) }));
    const b = run(createRace({ track: CALENDAR[0], laps: 5, season: 1, playerRating: 30, playerTeamName: 'Me', seed: 3 }));
    expect(a.cars.map((c) => c.finishTime)).toEqual(b.cars.map((c) => c.finishTime));
  });

  it('rain slows the whole field', () => {
    const dry = run(createRace(cfg(DRY)));
    const wet = run(createRace(cfg(RAIN)));
    expect(Math.max(...wet.cars.map((c) => c.finishTime ?? 0))).toBeGreaterThan(Math.max(...dry.cars.map((c) => c.finishTime ?? 0)));
  });

  it('most rivals switch to wet tyres in a downpour', () => {
    const race = createRace(cfg(RAIN));
    race.cars.forEach((c) => (c.fault = undefined));
    for (let i = 0;     i < 600; i++) stepRace(race, 0.5);
    const rivals = race.cars.filter((c) => !c.isPlayer);
    const wet = rivals.filter((c) => c.tyres && tyreClass(c.tyres.compound) === 'wet');
    expect(race.wetness).toBe(1);
    expect(wet.length).toBeGreaterThan(rivals.length / 3);
    expect(wet.length).toBeLessThan(rivals.length);
  });

  it('a player with Race Craft loses less in the wet', () => {
    const lap = (raceCraft: number) => {
      const race = createRace({ ...cfg({ rainStart: 0.5, rainEnd: null, peak: 1 }), playerDriverStats: [{ skill: 0, tyreMgmt: 0, consistency: 0, raceCraft }, { skill: 0, tyreMgmt: 0, consistency: 0, raceCraft: 0 }] });
      race.cars.forEach((c) => (c.fault = undefined));
      const strategies: [ReturnType<typeof newStrategy>, ReturnType<typeof newStrategy>] = [newStrategy(), newStrategy()];
      for (let i = 0; i < 100; i++) stepRace(race, 0.5, 1, { strategies, pitCrew: 0 });
      return race.cars[0].progress;
    };
    expect(lap(10)).toBeGreaterThan(lap(0));
  });
});
