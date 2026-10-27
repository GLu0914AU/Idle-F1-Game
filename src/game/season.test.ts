import { describe, expect, it } from 'vitest';
import { createRace, standings, stepRace } from './race';
import {
  RACES_PER_SEASON,
  SeasonState,
  advanceSeason,
  awardPoints,
  constructorsTable,
  playerWonChampionship,
  pointsForPosition,
} from './season';
import { CALENDAR } from './tracks';

const fresh = (): SeasonState => ({ season: 1, race: 1, points: {} });

describe('season', () => {
  it('uses the F1 points table', () => {
    expect(pointsForPosition(1)).toBe(25);
    expect(pointsForPosition(10)).toBe(1);
    expect(pointsForPosition(11)).toBe(0);
  });

  it('awards constructors points from a race', () => {
    const race = createRace({ track: CALENDAR[0], laps: 1, season: 1, playerRating: 500, playerTeamName: 'Me', seed: 3 });
    while (!race.finished) stepRace(race, 1);
    const s = fresh();
    awardPoints(s, standings(race));
    // Both player cars win 1st and 2nd: 25 + 18.
    expect(s.points.player).toBe(43);
    expect(Object.values(s.points).reduce((a, b) => a + b, 0)).toBe(25 + 18 + 15 + 12 + 10 + 8 + 6 + 4 + 2 + 1);
  });

  it('sorts the constructors table by points', () => {
    const s = fresh();
    s.points = { player: 10, ferrari: 30, mclaren: 20 };
    const t = constructorsTable(s, 'Me');
    expect(t.map((r) => r.teamId).slice(0, 3)).toEqual(['ferrari', 'mclaren', 'player']);
    expect(t).toHaveLength(10);
  });

  it('requires strictly more points than every rival', () => {
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

  it('advances the season on a title win and resets points', () => {
    const s: SeasonState = { season: 1, race: RACES_PER_SEASON, points: { player: 200, ferrari: 100 } };
    expect(advanceSeason(s)).toEqual({ type: 'season-won', newSeason: 2 });
    expect(s).toEqual({ season: 2, race: 1, points: {} });
  });

  it('replays the season when the title is lost', () => {
    const s: SeasonState = { season: 3, race: RACES_PER_SEASON, points: { player: 50, ferrari: 100 } };
    expect(advanceSeason(s)).toEqual({ type: 'season-lost' });
    expect(s).toEqual({ season: 3, race: 1, points: {} });
  });
});
