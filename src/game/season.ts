import { Car } from './race';
import { PLAYER_TEAM_ID, RIVAL_TEAMS } from './teams';

export const RACES_PER_SEASON = 10;
export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export interface SeasonState {
  season: number;
  race: number;
  // Constructors' points by team id.
  points: Record<string, number>;
}

export type SeasonOutcome =
  | { type: 'next-race' }
  | { type: 'season-won'; newSeason: number }
  | { type: 'season-lost' };

export function pointsForPosition(position: number): number {
  return POINTS_TABLE[position - 1] ?? 0;
}

// order is the finishing order, first place first.
export function awardPoints(state: SeasonState, order: Car[]): void {
  order.forEach((car, i) => {
    state.points[car.teamId] = (state.points[car.teamId] ?? 0) + pointsForPosition(i + 1);
  });
}

export interface TableRow {
  teamId: string;
  name: string;
  points: number;
  isPlayer: boolean;
}

export function constructorsTable(state: SeasonState, playerName: string): TableRow[] {
  const rows: TableRow[] = [
    { teamId: PLAYER_TEAM_ID, name: playerName, points: state.points[PLAYER_TEAM_ID] ?? 0, isPlayer: true },
    ...RIVAL_TEAMS.map((t) => ({ teamId: t.id, name: t.name, points: state.points[t.id] ?? 0, isPlayer: false })),
  ];
  return rows.sort((a, b) => b.points - a.points);
}

// The player must finish strictly ahead of every rival to advance.
export function playerWonChampionship(state: SeasonState): boolean {
  const mine = state.points[PLAYER_TEAM_ID] ?? 0;
  return RIVAL_TEAMS.every((t) => mine > (state.points[t.id] ?? 0));
}

// Call after a race's points have been awarded. Mutates state to the next race or season.
export function advanceSeason(state: SeasonState): SeasonOutcome {
  if (state.race < RACES_PER_SEASON) {
    state.race += 1;
    return { type: 'next-race' };
  }
  const won = playerWonChampionship(state);
  state.race = 1;
  state.points = {};
  if (won) {
    state.season += 1;
    return { type: 'season-won', newSeason: state.season };
  }
  return { type: 'season-lost' };
}
