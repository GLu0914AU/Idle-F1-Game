import { Car } from './race';
import { PLAYER_DRIVERS, PLAYER_TEAM_ID, RIVAL_TEAMS } from './teams';

export const RACES_PER_SEASON = 10;
// 2025 F1 scheme: top ten score, and there is no fastest-lap point.
export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export interface SeasonState {
  season: number;
  race: number;
  // Constructors' points by team id.
  points: Record<string, number>;
  // Drivers' points by car id (player-0, player-1, mclaren-0, ...).
  driverPoints: Record<string, number>;
}

export type SeasonOutcome =
  | { type: 'next-race' }
  // skipped is how many seasons were jumped over on top of the normal one.
  | { type: 'season-won'; newSeason: number; skipped: number; constructors: boolean; oneTwo: boolean }
  // constructors is true if the player won the constructors' title without the drivers' one.
  | { type: 'season-lost'; constructors: boolean };

export function pointsForPosition(position: number): number {
  return POINTS_TABLE[position - 1] ?? 0;
}

// order is the finishing order, first place first.
export function awardPoints(state: SeasonState, order: Car[]): void {
  order.forEach((car, i) => {
    const pts = pointsForPosition(i + 1);
    state.points[car.teamId] = (state.points[car.teamId] ?? 0) + pts;
    state.driverPoints[car.id] = (state.driverPoints[car.id] ?? 0) + pts;
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

export interface DriverRow {
  carId: string;
  name: string;
  points: number;
  isPlayer: boolean;
}

// All 20 drivers by season points; ties keep the player's cars first.
export function driversTable(
  state: Pick<SeasonState, 'driverPoints'> & { driverNames?: readonly string[] },
): DriverRow[] {
  const names = state.driverNames ?? PLAYER_DRIVERS;
  const rows: DriverRow[] = [
    ...PLAYER_DRIVERS.map((fallback, i) => ({ carId: `player-${i}`, name: names[i] ?? fallback, isPlayer: true })),
    ...RIVAL_TEAMS.flatMap((t) => t.drivers.map((name, i) => ({ carId: `${t.id}-${i}`, name, isPlayer: false }))),
  ].map((d) => ({ ...d, points: state.driverPoints[d.carId] ?? 0 }));
  return rows.sort((a, b) => b.points - a.points);
}

// The player must finish strictly ahead of every rival to win the constructors' title.
export function playerWonChampionship(state: SeasonState): boolean {
  const mine = state.points[PLAYER_TEAM_ID] ?? 0;
  return RIVAL_TEAMS.every((t) => mine > (state.points[t.id] ?? 0));
}

const bestPoints = (state: SeasonState, player: boolean) =>
  Math.max(-1, ...driversTable(state).filter((d) => d.isPlayer === player).map((d) => d.points));

// One of the player's drivers finishes strictly first in the drivers' standings.
export function playerWonDrivers(state: SeasonState): boolean {
  return bestPoints(state, true) > bestPoints(state, false);
}

// Both player drivers finish strictly ahead of every rival driver (P1 and P2).
export function playerOneTwo(state: SeasonState): boolean {
  const worstMine = Math.min(...driversTable(state).filter((d) => d.isPlayer).map((d) => d.points));
  return worstMine > bestPoints(state, false);
}

// Call after a race's points have been awarded. Mutates state to the next race or season.
// A drivers' title is needed to advance. Adding the constructors' title skips a season, and a 1-2 on top of that skips two.
export function advanceSeason(state: SeasonState): SeasonOutcome {
  if (state.race < RACES_PER_SEASON) {
    state.race += 1;
    return { type: 'next-race' };
  }
  const drivers = playerWonDrivers(state);
  const wcc = playerWonChampionship(state);
  const constructors = drivers && wcc;
  const oneTwo = constructors && playerOneTwo(state);
  state.race = 1;
  state.points = {};
  state.driverPoints = {};
  if (drivers) {
    const skipped = oneTwo ? 2 : constructors ? 1 : 0;
    state.season += 1 + skipped;
    return { type: 'season-won', newSeason: state.season, skipped, constructors, oneTwo };
  }
  return { type: 'season-lost', constructors: wcc };
}
