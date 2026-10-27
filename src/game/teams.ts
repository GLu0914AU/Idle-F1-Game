export interface Team {
  id: string;
  name: string;
  color: number;
  drivers: [string, string];
  // Base car rating in season 1; scaled up per season.
  rating: number;
}

// 9 real rivals give 18 rival cars; the player's own team is the 10th.
export const RIVAL_TEAMS: Team[] = [
  { id: 'redbull', name: 'Red Bull Racing', color: 0x3671c6, drivers: ['Max Verstappen', 'Yuki Tsunoda'], rating: 62 },
  { id: 'ferrari', name: 'Ferrari', color: 0xe8002d, drivers: ['Charles Leclerc', 'Lewis Hamilton'], rating: 60 },
  { id: 'mclaren', name: 'McLaren', color: 0xff8000, drivers: ['Lando Norris', 'Oscar Piastri'], rating: 64 },
  { id: 'mercedes', name: 'Mercedes', color: 0x27f4d2, drivers: ['George Russell', 'Kimi Antonelli'], rating: 58 },
  { id: 'astonmartin', name: 'Aston Martin', color: 0x229971, drivers: ['Fernando Alonso', 'Lance Stroll'], rating: 46 },
  { id: 'alpine', name: 'Alpine', color: 0x2293d1, drivers: ['Pierre Gasly', 'Franco Colapinto'], rating: 38 },
  { id: 'williams', name: 'Williams', color: 0x64c4ff, drivers: ['Alex Albon', 'Carlos Sainz'], rating: 40 },
  { id: 'racingbulls', name: 'Racing Bulls', color: 0x6692ff, drivers: ['Liam Lawson', 'Isack Hadjar'], rating: 34 },
  { id: 'haas', name: 'Haas', color: 0xb6babd, drivers: ['Esteban Ocon', 'Oliver Bearman'], rating: 30 },
];

export const PLAYER_DRIVERS: [string, string] = ['Driver One', 'Driver Two'];
export const PLAYER_COLOR = 0xffd400;

// Rivals get stronger every season so progression stays under pressure.
export function rivalRating(base: number, season: number): number {
  return base * (1 + 0.25 * (season - 1));
}
