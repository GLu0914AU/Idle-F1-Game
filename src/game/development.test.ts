import { describe, expect, it } from 'vitest';
import {
  DEV_PACKAGES,
  RIVAL_DRIFT_MAX,
  developmentCost,
  developmentOdds,
  fitsSeason,
  packageDef,
  startDevelopment,
  teamQuality,
  tickDevelopment,
} from './development';
import { carRating } from './economy';
import { effectiveUpgrades, prestige } from './prestige';
import { createRace } from './race';
import { loadGame, newGame, SAVE_KEY } from './save';
import { settleRace } from './settle';
import { RACES_PER_SEASON } from './season';
import { RIVAL_TEAMS } from './teams';
import { pickTrack } from './tracks';

const aero = packageDef('aero')!;
const rich = () => ({ ...newGame(0), money: 1e9 });

describe('development', () => {
  it('costs money and occupies the single development slot', () => {
    const s = rich();
    const cost = developmentCost(s, aero);
    expect(startDevelopment(s, 'aero', RACES_PER_SEASON)).toBe(true);
    expect(s.money).toBe(1e9 - cost);
    expect(startDevelopment(s, 'chassis', RACES_PER_SEASON)).toBe(false);
  });

  it('refuses a package the player cannot afford or that would not finish in time', () => {
    const poor = { ...newGame(0), money: 0 };
    expect(startDevelopment(poor, 'aero', RACES_PER_SEASON)).toBe(false);
    const late = { ...rich(), race: RACES_PER_SEASON };
    expect(fitsSeason(late, aero, RACES_PER_SEASON)).toBe(false);
    expect(startDevelopment(late, 'aero', RACES_PER_SEASON)).toBe(false);
  });

  it('costs more as the team earns more', () => {
    const a = rich();
    const b = rich();
    b.upgrades.engine = 40;
    expect(developmentCost(b, aero)).toBeGreaterThan(developmentCost(a, aero));
  });

  it('finishes after its races and adds to the car rating', () => {
    const s = rich();
    startDevelopment(s, 'aero', RACES_PER_SEASON);
    expect(tickDevelopment(s, () => 0)).toBeNull();
    const result = tickDevelopment(s, () => 0)!;
    expect(result.outcome).toBe('big');
    expect(s.development.active).toBeNull();
    expect(s.development.bonus).toBeCloseTo(aero.big);
    const base = carRating({ ...s.upgrades });
    expect(carRating(effectiveUpgrades(s))).toBeCloseTo(base * (1 + aero.big));
  });

  it('can flop, which with the risky package costs rating', () => {
    const s = rich();
    startDevelopment(s, 'power', RACES_PER_SEASON);
    let result = null;
    for (let i = 0; i < 3; i++) result = tickDevelopment(s, () => 0.999);
    expect(result?.outcome).toBe('flop');
    expect(s.development.bonus).toBeLessThan(0);
  });

  it('gives better odds to a team with better drivers and a better engineer', () => {
    const base = newGame(0);
    const better = newGame(0);
    better.drivers = [{ ...better.drivers[0], skill: 20 }, { ...better.drivers[1], skill: 20 }];
    better.engineer = { name: 'E', pit: 90, tyre: 90, mode: 90, salary: 0 };
    expect(teamQuality(base)).toBe(0);
    expect(teamQuality(better)).toBeGreaterThan(0.6);
    const lo = developmentOdds(teamQuality(base), aero);
    const hi = developmentOdds(teamQuality(better), aero);
    expect(hi.big).toBeGreaterThan(lo.big);
    expect(hi.flop).toBeLessThan(lo.flop);
    for (const o of [lo, hi]) expect(o.big + o.solid + o.flop).toBeCloseTo(1);
  });

  it('makes the risky package flop more often than the safe one', () => {
    const q = 0.3;
    expect(developmentOdds(q, packageDef('power')!).flop).toBeGreaterThan(developmentOdds(q, packageDef('chassis')!).flop);
    expect(DEV_PACKAGES.length).toBe(3);
  });

  it('makes rivals improve every race, and the improvement reaches their cars', () => {
    const s = newGame(0);
    for (let i = 0; i < 5; i++) tickDevelopment(s, () => 1);
    for (const t of RIVAL_TEAMS) expect(s.development.rivalDrift[t.id]).toBeCloseTo(5 * RIVAL_DRIFT_MAX);
    const track = pickTrack(() => 0);
    const cfg = { track, laps: 5, season: 3, playerRating: 50, playerTeamName: 'T', seed: 1 };
    const plain = createRace(cfg).cars.find((c) => c.teamId === 'redbull')!.rating;
    const drifted = createRace({ ...cfg, rivalDrift: s.development.rivalDrift }).cars.find((c) => c.teamId === 'redbull')!.rating;
    expect(drifted / plain).toBeCloseTo(1 + 5 * RIVAL_DRIFT_MAX);
  });

  it('resets when the season ends and on prestige', () => {
    const s = { ...rich(), season: 3, race: RACES_PER_SEASON };
    s.development.bonus = 0.1;
    s.development.rivalDrift = { redbull: 0.05 };
    const track = pickTrack(() => 0);
    const order = createRace({ track, laps: 5, season: 3, playerRating: 50, playerTeamName: 'T', seed: 1 }).cars;
    settleRace(s, order);
    expect(s.development.bonus).toBe(0);
    expect(s.development.rivalDrift).toEqual({});

    s.development.bonus = 0.1;
    s.season = 3;
    prestige(s);
    expect(s.development.bonus).toBe(0);
  });

  it('keeps developing between races within a season', () => {
    const s = { ...rich(), season: 2, race: 4 };
    s.development.bonus = 0.05;
    const track = pickTrack(() => 0);
    const order = createRace({ track, laps: 5, season: 2, playerRating: 50, playerTeamName: 'T', seed: 1 }).cars;
    settleRace(s, order);
    expect(s.development.bonus).toBe(0.05);
    expect(Object.keys(s.development.rivalDrift).length).toBe(RIVAL_TEAMS.length);
  });

  it('loads old saves that predate development', () => {
    const old = JSON.parse(JSON.stringify(newGame(0)));
    delete old.development;
    const store = { getItem: () => JSON.stringify(old), setItem: () => {}, removeItem: () => {} };
    const loaded = loadGame(store, 0);
    expect(loaded.development).toEqual({ active: null, bonus: 0, rivalDrift: {}, last: null });
    expect(SAVE_KEY).toBeTruthy();
  });
});
