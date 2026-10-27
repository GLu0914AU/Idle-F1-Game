import { COMPOUNDS, Strategy, enterPitLane, isPitting, newStrategy, paceFactor, stepStrategy } from './strategy';
import { PLAYER_COLOR, PLAYER_DRIVERS, RIVAL_TEAMS, rivalRating } from './teams';
import { Track } from './track';

export interface Car {
  id: string;
  teamId: string;
  teamName: string;
  driver: string;
  color: number;
  isPlayer: boolean;
  rating: number;
  // Distance covered, in track-length units (1 = one full lap).
  progress: number;
  // Per-lap pace variation, redrawn each lap.
  form: number;
  finishTime: number | null;
  // Tyre and pit state for NPC cars. The player cars are driven by the player's own Strategy instead.
  tyres?: Strategy;
  // Wear level at which this NPC calls itself in.
  pitWear?: number;
}

export interface RaceConfig {
  track: Track;
  laps: number;
  season: number;
  playerRating: number;
  playerTeamName: string;
  seed: number;
  // Seconds a rating-0 car takes for one lap.
  baseLapTime?: number;
}

export interface Race {
  config: RaceConfig;
  cars: Car[];
  time: number;
  finished: boolean;
  rng: () => number;
}

// Small deterministic PRNG so races are reproducible in tests.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Diminishing returns: rating 0 -> 1.0x, rating 100 -> 1.25x, approaching 1.5x.
export function paceMultiplier(rating: number): number {
  const r = Math.max(0, rating);
  return 1 + 0.5 * (r / (r + 100));
}

export function lapTime(rating: number, baseLapTime = 90): number {
  return baseLapTime / paceMultiplier(rating);
}

function rollForm(rng: () => number): number {
  return 1 + (rng() - 0.5) * 0.03;
}

export function createRace(config: RaceConfig): Race {
  const rng = mulberry32(config.seed);
  const cars: Car[] = [];
  const add = (c: Omit<Car, 'progress' | 'form' | 'finishTime'>) =>
    cars.push({ ...c, progress: 0, form: rollForm(rng), finishTime: null });

  PLAYER_DRIVERS.forEach((driver, i) =>
    add({
      id: `player-${i}`,
      teamId: 'player',
      teamName: config.playerTeamName,
      driver,
      color: PLAYER_COLOR,
      isPlayer: true,
      rating: config.playerRating,
    }),
  );
  for (const team of RIVAL_TEAMS) {
    team.drivers.forEach((driver, i) => {
      add({
        id: `${team.id}-${i}`,
        teamId: team.id,
        teamName: team.name,
        driver,
        color: team.color,
        isPlayer: false,
        // Second driver is slightly slower to spread the field.
        rating: rivalRating(team.rating, config.season) * (i === 0 ? 1 : 0.97),
      });
      const car = cars[cars.length - 1];
      car.tyres = newStrategy();
      car.tyres.compound = randomCompound(rng);
      car.pitWear = 0.5 + rng() * 0.3;
    });
  }
  return { config, cars, time: 0, finished: false, rng };
}

function randomCompound(rng: () => number) {
  return COMPOUNDS[Math.floor(rng() * COMPOUNDS.length) % COMPOUNDS.length];
}

const NO_UPGRADES = { tapPower: 0, pitCrew: 0, tyres: 0 };

// NPC tyre logic: call the car in when worn (with a random fresh compound), stop at the line.
function stepNpcTyres(race: Race, car: Car, dt: number): number {
  const s = car.tyres;
  if (!s) return 1;
  stepStrategy(s, dt, NO_UPGRADES);
  if (!isPitting(s) && !s.pitRequested && s.wear >= (car.pitWear ?? 0.7) && race.config.laps - car.progress > 1) {
    s.pitRequested = true;
    s.nextCompound = randomCompound(race.rng);
  }
  return paceFactor(s);
}

// Advance the race by dt seconds. speedBoost multiplies the player cars only (taps/strategy later).
export function stepRace(race: Race, dt: number, playerBoost = 1): void {
  if (race.finished) return;
  const { laps, baseLapTime = 90 } = race.config;
  for (const car of race.cars) {
    if (car.finishTime !== null) continue;
    const boost = car.isPlayer ? playerBoost : stepNpcTyres(race, car, dt);
    const lapsPerSecond = (paceMultiplier(car.rating) * car.form * boost) / baseLapTime;
    const before = car.progress;
    car.progress += lapsPerSecond * dt;
    if (Math.floor(car.progress) > Math.floor(before)) {
      car.form = rollForm(race.rng);
      if (car.tyres && car.progress < laps) enterPitLane(car.tyres, 0);
    }
    if (car.progress >= laps) {
      // Interpolate the exact crossing time within this step.
      const over = (car.progress - laps) / lapsPerSecond;
      car.finishTime = race.time + dt - over;
      car.progress = laps;
    }
  }
  race.time += dt;
  race.finished = race.cars.every((c) => c.finishTime !== null);
}

// Finished cars first by finish time, then the rest by distance covered.
export function standings(race: Race): Car[] {
  return [...race.cars].sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    return b.progress - a.progress;
  });
}
