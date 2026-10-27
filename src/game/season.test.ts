import { describe, expect, it } from 'vitest';
import { createRace, standings, stepRace } from './race';
import {
  RACES_PER_SEASON,
  SeasonState,
  advanceSeason,
  awardPoints,
  constructorsTable,
  driversTable,
  playerWonChampionship,
  pointsForPosition,
} from './season';
import { CALENDAR } from './tracks';

const fresh = (): SeasonState => ({ season: 1, race: 1, points: {}, driverPoints: {} });
const lastRace = (over: Partial<SeasonState>): SeasonState => ({ ...fresh(), season: 3, race: RACES_PER_SEASON, ...over });

describe('season', () => {
  it('uses the 2025 F1 points table', () => {
    expect(pointsForPosition(1)).toBe(25);
    expect(pointsForPosition(2)).toBe(18);
    expect(pointsForPosition(10)).toBe(1);
    expect(pointsForPosition(11)).toBe(0);
  });

  it('awards constructors and drivers points from a race', () => {
    const race = createRace({ track: CALENDAR[0], laps: 1, season: 1, playerRating: 500, playerTeamName: 'Me', seed: 3 });
    while (!race.finished) stepRace(race, 1);
    const s = fresh();
    awardPoints(s, standings(race));
    // Both player cars win 1st and 2nd: 25 + 18.
    expect(s.points.player).toBe(43);
    expect(Object.values(s.points).reduce((a, b) => a + b, 0)).toBe(25 + 18 + 15 + 12 + 10 + 8 + 6 + 4 + 2 + 1);
    expect(s.driverPoints['player-0'] + s.driverPoints['player-1']).toBe(43);
  });

  it('lists all 20 drivers sorted by points', () => {
    const s = fresh();
    s.driverPoints = { 'ferrari-1': 30, 'mclaren-0': 20, 'player-1': 10 };
    const t = driversTable(s);
    expect(t).toHaveLength(20);
    expect(t.slice(0, 3).map((r) => r.carId)).toEqual(['ferrari-1', 'mclaren-0', 'player-1']);
  });

  it('sorts the constructors table by points', () => {
    const s = fresh();
    s.points = { player: 10, ferrari: 30, mclaren: 20 };
    const t = constructorsTable(s, 'Me');
    expect(t.map((r) => r.teamId).slice(0, 3)).toEqual(['ferrari', 'mclaren', 'player']);
    expect(t).toHaveLength(10);
  });

  it('requires strictly more points than every rival for the constructors title', () => {
    const s = fresh();
    s.points = { player: 100, ferrari: 100 };
    expect(playerWonChampionship(s)).toBe(false);
    s.points.player = 101;
    expect(playerWonChampionship(s)).toBe(true);
  });

  it('moves to the next race mid-season', () => {
    const s = fresh();
    expect(advanceSeason(s)).toEqual({ type: 'next-race' });
    expect(s.race).toBe(2);
  });

  it('a drivers title alone advances one season and resets points', () => {
    const s = lastRace({ points: { player: 100, ferrari: 200 }, driverPoints: { 'player-0': 120, 'ferrari-0': 100, 'ferrari-1': 90 } });
    expect(advanceSeason(s)).toMatchObject({ type: 'season-won', newSeason: 4, skipped: 0, constructors: false });
    expect(s).toEqual({ season: 4, race: 1, points: {}, driverPoints: {} });
  });

  it('a constructors title is not enough without a drivers title', () => {
    const s = lastRace({ points: { player: 200, ferrari: 100 }, driverPoints: { 'player-0': 60, 'player-1': 60, 'ferrari-0': 61 } });
    expect(advanceSeason(s)).toEqual({ type: 'season-lost' });
    expect(s.season).toBe(3);
  });

  it('drivers plus constructors titles skip a season', () => {
    const s = lastRace({ points: { player: 200, ferrari: 100 }, driverPoints: { 'player-0': 120, 'ferrari-0': 100, 'player-1': 50 } });
    expect(advanceSeason(s)).toMatchObject({ newSeason: 5, skipped: 1, constructors: true, oneTwo: false });
  });

  it('a 1-2 plus the constructors title skips two seasons', () => {
    const s = lastRace({ points: { player: 200, ferrari: 100 }, driverPoints: { 'player-0': 120, 'player-1': 110, 'ferrari-0': 100 } });
    expect(advanceSeason(s)).toMatchObject({ newSeason: 6, skipped: 2, oneTwo: true });
  });

  it('a drivers tie is not a win', () => {
    const s = lastRace({ points: { player: 200 }, driverPoints: { 'player-0': 100, 'ferrari-0': 100 } });
    expect(advanceSeason(s)).toEqual({ type: 'season-lost' });
  });

  it('replays the season when the title is lost', () => {
    const s = lastRace({ points: { player: 50, ferrari: 100 }, driverPoints: { 'player-0': 30, 'ferrari-0': 60 } });
    expect(advanceSeason(s)).toEqual({ type: 'season-lost' });
    expect(s).toEqual({ season: 3, race: 1, points: {}, driverPoints: {} });
  });
});
