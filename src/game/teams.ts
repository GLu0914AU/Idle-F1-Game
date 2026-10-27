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
  { id: 'redbull', name: 'Red Bowl Racing', color: 0x3671c6, drivers: ['Max Verstopping', 'Yuki Tsunami'], rating: 62 },
  { id: 'ferrari', name: 'Furrari', color: 0xe8002d, drivers: ['Charles Clerk', 'Lewis Hammerton'], rating: 60 },
  { id: 'mclaren', name: 'McLearn', color: 0xff8000, drivers: ['Lando Chorus', 'Oscar Pastry'], rating: 64 },
  { id: 'mercedes', name: 'Mercadies', color: 0x27f4d2, drivers: ['George Rustle', 'Kimi Antelope'], rating: 58 },
  { id: 'astonmartin', name: 'Aston Marlin', color: 0x229971, drivers: ['Fernando Alone-So', 'Lance Scroll'], rating: 46 },
  { id: 'alpine', name: 'Alpyne', color: 0x2293d1, drivers: ['Pierre Ghastly', 'Franco Colapint'], rating: 38 },
  { id: 'williams', name: 'Williamson', color: 0x64c4ff, drivers: ['Alex Album', 'Carlos Signs'], rating: 40 },
  { id: 'racingbulls', name: 'Racing Bills', color: 0x6692ff, drivers: ['Liam Lawsuit', 'Isack Hedger'], rating: 34 },
  { id: 'haas', name: 'Hoss', color: 0xb6babd, drivers: ['Esteban Icon', 'Oliver Barman'], rating: 30 },
];

export const PLAYER_TEAM_ID = 'player';
export const PLAYER_DRIVERS: [string, string] = ['Driver One', 'Driver Two'];
export const PLAYER_COLOR = 0xffd400;

// Rivals get stronger every season, compounding, until they outgrow what a run can build: that's the cue to prestige.
export const RIVAL_GROWTH = 1.3;
export function rivalRating(base: number, season: number): number {
  return base * RIVAL_GROWTH ** (season - 1);
}
