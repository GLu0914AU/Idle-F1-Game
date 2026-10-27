import { prize } from './economy';
import type { GameState } from './save';
import { PLAYER_DRIVERS } from './teams';

// Traits are levels from 0 to MAX_TRAIT. `skill` is a percentage boost to the car's rating.
export interface DriverStats {
  skill: number;
  // Less tyre wear.
  tyreMgmt: number;
  // Fewer breakdowns.
  consistency: number;
  // Extra pace at the start of a race (and in the wet, once weather exists).
  raceCraft: number;
}

export interface Driver extends DriverStats {
  // Paid after every race for as long as the driver stays.
  salary: number;
}

// A driver the player is negotiating with. `secret` is the least they will accept per race; lo..hi is the estimate the player sees.
export interface Candidate {
  name: string;
  stats: DriverStats;
  secret: number;
  lo: number;
  hi: number;
}

export type DriverState = Pick<GameState, 'clout' | 'season' | 'drivers' | 'driverNames' | 'driverMeeting' | 'money'>;

export const MAX_TRAIT = 10;
export const MAX_SKILL = 25;
export const DRIVER_MEETING_CLOUT = 2;
// A season's salary comes to this many winner's prizes. A season has ten races, so this is cheaper than the old per-race wage overall.
const SALARY_SHARE = 18;
const SECRET_MIN = 0.3;
const SECRET_MAX = 1.7;
const HINT_SPREAD = 0.5;

export const rookie = (): Driver => ({ skill: 0, tyreMgmt: 0, consistency: 0, raceCraft: 0, salary: 0 });

export const NAMES = [
  'Daniel Ricotta',
  'Sebastian Kettle',
  'Valtteri Bottle',
  'Kevin Magnate',
  'Nico Hulkenberry',
  'Zhou Guanyou',
  'Logan Sergeant',
  'Nyck De Freeze',
  'Jenson Buttons',
  'Mick Schumaker',
  'Antonio Giovanazzo',
  'Sergio Perish',
  'Gabriel Bortolotto',
  'Felipe Massive',
  'Romain Grosjam',
  'Pastor Maldonato',
  // Legends of the past.
  'Juan Manuel Fangio-Jr',
  'Alberto Ascari-Pasta',
  'Stirling Mossy',
  'Jim Clarke',
  'Jack Brabbit',
  'Graham Hillside',
  'Jackie Stewpot',
  'Jochen Rindt-Out',
  'Emerson Fittipaldy',
  'Niki Lauder-Dale',
  'James Hunting',
  'Mario Andretti-Spaghetti',
  'Jody Scheckter-Board',
  'Alan Jones-Bones',
  'Nelson Pickets',
  'Keke Rosberger',
  'Alain Prostitute',
  'Ayrton Sunna',
  'Nigel Mansfield',
  'Gerhard Bergamot',
  'Michele Alboreto-Pasta',
  'Riccardo Patrese-Pie',
  'Thierry Boutsen-Boots',
  'Jean Alesi-Mesi',
  'Damon Hillbilly',
  'Jacques Villeneuf',
  'Gilles Villeneuf',
  'Mika Hakkinen-Hockey',
  'David Coulthard-Cloth',
  'Eddie Irvine-Wine',
  'Heinz-Harald Frenzied',
  'Rubens Barrichelo',
  'Giancarlo Fisichella-Fella',
  'Ralf Schumaker',
  'Juan Pablo Montoyo',
  'Kimi Raikkonen-Net',
  'Mark Webbed',
  'Jarno Trullied',
  'Takuma Sato-Sushi',
  'Nick Heidfeld-Held',
  'Jenson Button-Up',
  'Robert Kubica-Cube',
  'Heikki Kovalainen-Lainen',
  'Timo Glock-Clock',
  'Sebastien Buemi-Bemi',
  'Jaime Alguersuari-Sari',
  'Vitaly Petrov-Dish',
  'Pedro De La Rosa-Bush',
  'Adrian Sutil-Soil',
  'Paul Di Resta-Rest',
  'Kamui Kobayashi-Sushi',
  'Bruno Senna-Sunna',
  'Jean-Eric Vergne-Vern',
  'Daniil Kvyat-Cat',
  'Max Chilton-Chill',
  'Jules Bianchi-Blanchi',
  'Marcus Ericsson-Son',
  'Felipe Nasr-Nasal',
  'Will Stevens-Stephens',
  'Roberto Merhi-Merry',
  'Jolyon Palmer-Palm',
  'Stoffel Vandoorne-Doorn',
  'Pascal Wehrlein-Wine',
  'Brendon Hartley-Hart',
  'Sergey Sirotkin-Sirloin',
  'Nicholas Latifi-Lattie',
  'Nikita Mazepin-Mazes',
  'Jack Doohan-Doohickey',
  'Ukyo Katayama-Pajama',
  'Pierluigi Martini-Martini',
  'Johnny Herbert-Herbal',
  'Martin Brundle-Bundle',
  'Mark Blundell-Blunder',
  'Olivier Panis-Panic',
  'Pedro Diniz-Dinners',
  'Allan McNish-Dish',
  'Tarso Marques-Marks',
  'Toranosuke Takagi-Tacky',
  'Luciano Burti-Bursty',
  'Enrique Bernoldi-Bernoulli',
  'Alex Yoong-Young',
  'Anthony Davidson-Davidsun',
  'Christijan Albers-Alberts',
  'Narain Karthikeyan-Karma',
  'Vitantonio Liuzzi-Lizzie',
  'Scott Speed-Speedy',
  'Sakon Yamamoto-Yamaha-Moto',
  'Giedo van der Garde-Garden',
  'Charles Pic-Pick',
  'Jerome d\'Ambrosio-Ambrosia',
];

// What a typical driver asks per season: a slice of a winner's prize, so it grows with the season.
export const salaryMarket = (season: number) => Math.max(1, Math.round(prize(1, season) * SALARY_SHARE));

export const payroll = (state: Pick<GameState, 'drivers'>) => state.drivers.reduce((sum, d) => sum + d.salary, 0);

// What a candidate asks per race, from their quality in 0..1: `secret` is the least they accept, and lo..hi is the estimate the player sees.
export function rollAsk(season: number, q: number, rng: () => number): { secret: number; lo: number; hi: number } {
  const secret = Math.max(1, Math.round(salaryMarket(season) * (SECRET_MIN + q * (SECRET_MAX - SECRET_MIN)) * (0.85 + rng() * 0.3)));
  const u = rng();
  return {
    secret,
    lo: Math.max(1, Math.round(secret / (1 + HINT_SPREAD * u))),
    hi: Math.round(secret * (1 + HINT_SPREAD * (1 - u))),
  };
}

// Quality in 0..1 drives the stats and the asking price together, so better drivers cost more.
export function requestDriverMeeting(state: DriverState, rng: () => number = Math.random): Candidate | null {
  if (state.driverMeeting || state.clout < DRIVER_MEETING_CLOUT) return null;
  state.clout -= DRIVER_MEETING_CLOUT;
  const taken = new Set(state.driverNames);
  const free = NAMES.filter((n) => !taken.has(n));
  const pool = free.length > 0 ? free : NAMES;
  const name = pool[Math.floor(rng() * pool.length) % pool.length];
  const q = rng();
  const trait = () => Math.max(0, Math.min(MAX_TRAIT, Math.round(q * MAX_TRAIT * (0.4 + rng() * 1.2))));
  const stats: DriverStats = { skill: Math.round(MAX_SKILL * q), tyreMgmt: trait(), consistency: trait(), raceCraft: trait() };
  const meeting: Candidate = { name, stats, ...rollAsk(state.season, q, rng) };
  state.driverMeeting = meeting;
  return meeting;
}

export const openingOffer = (c: { lo: number; hi: number }) => Math.round(Math.sqrt(c.lo * c.hi));

export type OfferResult = { outcome: 'signed'; name: string; replaced: string } | { outcome: 'failed'; name: string } | { outcome: 'none' };

// An offer at or above the driver's minimum signs them into the chosen seat at that salary; below it, talks collapse. Either way the meeting ends.
export function offerContract(state: DriverState, slot: 0 | 1, amount: number): OfferResult {
  const c = state.driverMeeting;
  if (!c || !Number.isFinite(amount) || amount <= 0) return { outcome: 'none' };
  state.driverMeeting = null;
  if (amount < c.secret) return { outcome: 'failed', name: c.name };
  const replaced = state.driverNames[slot];
  state.drivers[slot] = { ...c.stats, salary: Math.floor(amount) };
  state.driverNames[slot] = c.name;
  return { outcome: 'signed', name: c.name, replaced };
}

// Ends the negotiation without a deal. The clout is not refunded.
export function endDriverMeeting(state: Pick<GameState, 'driverMeeting'>): void {
  state.driverMeeting = null;
}

// Takes every salary at the end of a season. A driver the team can't pay walks out and is replaced by a free rookie.
export function payDrivers(state: DriverState): { paid: number; quit: string[] } {
  let paid = 0;
  const quit: string[] = [];
  state.drivers.forEach((d, i) => {
    if (d.salary <= 0) return;
    if (state.money >= d.salary) {
      state.money -= d.salary;
      paid += d.salary;
    } else {
      quit.push(state.driverNames[i]);
      state.drivers[i] = rookie();
      state.driverNames[i] = PLAYER_DRIVERS[i];
    }
  });
  return { paid, quit };
}

// Car rating with the driver's skill on top.
export const driverRating = (carRating: number, d: Pick<DriverStats, 'skill'>) => carRating * (1 + d.skill / 100);
// Multiplies breakdown chance.
export const consistencyFactor = (level: number) => 1 / (1 + 0.1 * level);
// Multiplies wear rate.
export const tyreMgmtFactor = (level: number) => 1 / (1 + 0.04 * level);
// Pace bonus that fades over the first lap.
export const raceCraftBonus = (level: number, progress: number) => 1 + 0.01 * level * Math.max(0, 1 - progress);
