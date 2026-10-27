import { describe, expect, it } from 'vitest';
import { FANS_PER_WIN, canRunFanEvent, fanChance, fansFor, recordRace, recordSeason, runFanEvent } from './career';
import { prestige } from './prestige';
import { loadGame, newGame } from './save';

const fresh = () => newGame(0);

describe('career stats', () => {
  it('counts only races won by the player', () => {
    const s = fresh();
    recordRace(s, true);
    recordRace(s, false);
    expect(s.stats.racesWon).toBe(1);
  });

  it('counts drivers and constructors titles separately', () => {
    const s = fresh();
    recordSeason(s, { type: 'next-race' });
    recordSeason(s, { type: 'season-won', newSeason: 2, skipped: 0, constructors: false, oneTwo: false });
    recordSeason(s, { type: 'season-won', newSeason: 4, skipped: 1, constructors: true, oneTwo: false });
    recordSeason(s, { type: 'season-lost', constructors: true });
    recordSeason(s, { type: 'season-lost', constructors: false });
    expect(s.stats).toMatchObject({ wdc: 2, wcc: 2 });
  });

  it('fans come from race wins', () => {
    expect(fansFor({ racesWon: 3 })).toBe(3 * FANS_PER_WIN);
  });
});

describe('fan event', () => {
  it('is unavailable below the fan threshold', () => {
    const s = fresh();
    s.stats.racesWon = 19;
    expect(canRunFanEvent(s)).toBe(false);
    expect(runFanEvent(s, 10)).toBeNull();
  });

  it('chance rises with fans and never reaches certainty', () => {
    expect(fanChance(0, 'money')).toBe(0);
    expect(fanChance(500, 'money')).toBeGreaterThan(fanChance(100, 'money'));
    expect(fanChance(1e9, 'gems')).toBeLessThan(1);
    expect(fanChance(500, 'researchPoints')).toBeLessThan(fanChance(500, 'money'));
  });

  it('pays out each currency independently and only once', () => {
    const s = fresh();
    s.stats.racesWon = 20;
    const drops = runFanEvent(s, 10, () => 0)!;
    expect(drops.money).toBeGreaterThan(0);
    expect(drops.gems).toBeGreaterThan(0);
    expect(drops.researchPoints).toBeGreaterThan(0);
    expect(s.money).toBe(drops.money);
    expect(s.gems).toBe(drops.gems);
    expect(s.researchPoints).toBe(drops.researchPoints);
    expect(runFanEvent(s, 10, () => 0)).toBeNull();
  });

  it('can drop nothing when the rolls are bad', () => {
    const s = fresh();
    s.stats.racesWon = 20;
    expect(runFanEvent(s, 10, () => 0.99)).toEqual({ money: 0, gems: 0, researchPoints: 0, clout: 0 });
    expect(s.fanEventUsed).toBe(true);
  });

  it('resets on prestige while stats stay', () => {
    const s = fresh();
    s.season = 5;
    s.stats.racesWon = 20;
    s.fanEventUsed = true;
    prestige(s);
    expect(s.fanEventUsed).toBe(false);
    expect(s.stats.racesWon).toBe(20);
  });
});

describe('save migration', () => {
  it('gives old saves default names, colour and stats', () => {
    const store = { getItem: () => JSON.stringify({ teamName: 'Old', money: 5 }), setItem: () => {}, removeItem: () => {} };
    const s = loadGame(store, 0);
    expect(s.driverNames).toEqual(['Driver One', 'Driver Two']);
    expect(s.stats).toEqual({ racesWon: 0, wdc: 0, wcc: 0 });
    expect(s.fanEventUsed).toBe(false);
  });
});
