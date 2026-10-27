import {
  COMPOUNDS,
  Compound,
  DRY_COMPOUNDS,
  PIT_HALF_LENGTH,
  Strategy,
  newStrategy,
  paceFactor,
  pitDuration,
  PIT_ISSUES,
  pitIssueChance,
  stepStrategy,
} from './strategy';
import { PLAYER_COLOR, PLAYER_DRIVERS, RIVAL_TEAMS, rivalRating } from './teams';
import { Handling, handlingFactor } from './economy';
import { DriverStats, consistencyFactor, driverRating, raceCraftBonus } from './drivers';
import { DRY, RIVAL_WET_CRAFT, TyreClass, Weather, idealClass, tyreClass, weatherFactor, wetnessAt } from './weather';
import { Track, cornerness } from './track';

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
  // Set while the car is in the pit lane: it travels the lane from the entrance to the exit as the stop completes.
  pit?: { start: number; remaining: number; total: number; issue?: string };
  // A breakdown decided at the start of the race: it strikes when the car reaches `at`, then either slows it for a while or retires it.
  fault?: { at: number; dnf: boolean; remaining: number; started: boolean; announced?: boolean };
  dnf?: boolean;
  // The driver's Race Craft trait (player cars only).
  raceCraft?: number;
  lastPitId?: number;
  // Game time at which a rival decides its tyres are wrong for the weather and boxes.
  reactAt?: number;
}

export interface RaceConfig {
  track: Track;
  laps: number;
  season: number;
  playerRating: number;
  playerTeamName: string;
  // Defaults to the standard names and colour.
  playerDrivers?: readonly [string, string];
  playerColor?: number;
  // Reliability level (including R&D); it lowers the player cars' breakdown chance.
  playerReliability?: number;
  // Stats of the two player drivers; skill raises the car's rating, the traits do the rest.
  playerDriverStats?: readonly [DriverStats, DriverStats];
  seed: number;
  // Seconds a rating-0 car takes for one lap.
  baseLapTime?: number;
  // The forecast; the race is dry if omitted.
  weather?: Weather;
}

export interface Race {
  config: RaceConfig;
  cars: Car[];
  time: number;
  finished: boolean;
  rng: () => number;
  weather: Weather;
  // Current track wetness, set from the leader's lap each step.
  wetness: number;
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

// Diminishing returns that never stop: rating 0 -> 1.0x, rating 100 -> 1.25x, 300 -> 1.5x, 1000 -> 1.86x.
// There is no ceiling, so rivals that keep growing stay a threat however long the run goes on.
export function paceMultiplier(rating: number): number {
  const r = Math.max(0, rating);
  return 1 + 0.25 * Math.log2(1 + r / 100);
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

  PLAYER_DRIVERS.forEach((fallback, i) =>
    add({
      id: `player-${i}`,
      teamId: 'player',
      teamName: config.playerTeamName,
      driver: config.playerDrivers?.[i] ?? fallback,
      color: config.playerColor ?? PLAYER_COLOR,
      isPlayer: true,
      rating: driverRating(config.playerRating, config.playerDriverStats?.[i] ?? { skill: 0 }),
      raceCraft: config.playerDriverStats?.[i]?.raceCraft ?? 0,
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
  // Breakdowns use their own random stream so they don't disturb the rest of the race.
  const frng = mulberry32((config.seed ^ 0x9e3779b9) >>> 0);
  for (const [idx, car] of cars.entries()) {
    const consistency = car.isPlayer ? (config.playerDriverStats?.[idx]?.consistency ?? 0) : 0;
    const chance = car.isPlayer ? breakdownChance(config.playerReliability ?? 0) * consistencyFactor(consistency) : RIVAL_BREAKDOWN_CHANCE;
    if (frng() < chance) {
      car.fault = { at: config.laps * (0.15 + 0.7 * frng()), dnf: frng() < DNF_SHARE, remaining: BREAKDOWN_SECONDS, started: false };
    }
  }
  return { config, cars, time: 0, finished: false, rng, weather: config.weather ?? DRY, wetness: 0 };
}

// Share of rival tyre choices in the wet that are wrong, and how long (game-seconds) they take to react to a change.
export const RIVAL_MISTAKE_CHANCE = 0.15;
export const RIVAL_REACT_MIN = 4;
export const RIVAL_REACT_SPREAD = 30;

// Chance a player car breaks down during a race: about 1 in 3 with no Reliability, falling with diminishing returns but never to zero.
export const breakdownChance = (reliability: number) => 0.04 + 0.29 / (1 + Math.max(0, reliability) / 12);
export const RIVAL_BREAKDOWN_CHANCE = 0.1;
// Share of breakdowns that retire the car; the rest only cost time.
export const DNF_SHARE = 0.15;
// Game-seconds a non-fatal breakdown lasts, and the pace the car crawls at meanwhile.
export const BREAKDOWN_SECONDS = 25;
export const BREAKDOWN_PACE = 0.2;

function randomCompound(rng: () => number) {
  return DRY_COMPOUNDS[Math.floor(rng() * DRY_COMPOUNDS.length) % DRY_COMPOUNDS.length];
}

// Tyres a rival fits for the conditions. In the wet they sometimes get it wrong; on a dry track the draw is the plain random one.
function chooseCompound(want: TyreClass, rng: () => number): Compound {
  if (want === 'dry') return randomCompound(rng);
  if (rng() < RIVAL_MISTAKE_CHANCE) return COMPOUNDS[Math.floor(rng() * COMPOUNDS.length) % COMPOUNDS.length];
  return want === 'inter' ? 'intermediate' : 'wet';
}

const NO_UPGRADES = { tapPower: 0, pitCrew: 0, tyres: 0 };

// NPC tyre logic: call the car in when worn, or when the weather has made its tyres wrong, with a fresh compound.
function stepNpcTyres(race: Race, car: Car, dt: number): number {
  const s = car.tyres;
  if (!s) return 1;
  stepStrategy(s, dt, { ...NO_UPGRADES, wetness: race.wetness });
  const canPit = !s.pitRequested && !car.pit && race.config.laps - car.progress > 1;
  const want = idealClass(race.wetness);
  const wrong = tyreClass(s.compound) !== want;
  if (!wrong) car.reactAt = undefined;
  else if (canPit && car.reactAt === undefined) car.reactAt = race.time + RIVAL_REACT_MIN + race.rng() * RIVAL_REACT_SPREAD;
  const weatherCall = canPit && wrong && car.reactAt !== undefined && race.time >= car.reactAt;
  if (canPit && (weatherCall || s.wear >= (car.pitWear ?? 0.7))) {
    s.pitRequested = true;
    s.pitRequestId += 1;
    s.nextCompound = chooseCompound(want, race.rng);
    car.reactAt = undefined;
  }
  return paceFactor(s);
}

export interface PlayerTeam {
  // One strategy per player car, in the same order as PLAYER_DRIVERS.
  strategies: [Strategy, Strategy];
  pitCrew: number;
  handling?: Handling;
}

function strategyOf(car: Car, player?: PlayerTeam): Strategy | undefined {
  if (!car.isPlayer) return car.tyres;
  return player?.strategies[car.id === 'player-0' ? 0 : 1];
}

// Where a car in the pit lane is, as laps of progress along the route (entrance to exit).
export function pitProgress(pit: NonNullable<Car['pit']>): number {
  return pit.start + 2 * PIT_HALF_LENGTH * (1 - pit.remaining / pit.total);
}

// Advance the race by dt seconds. playerBoost is an extra multiplier on the player cars' pace; player carries their strategies and pit crew.
export function stepRace(race: Race, dt: number, playerBoost = 1, player?: PlayerTeam): void {
  if (race.finished) return;
  const { laps, baseLapTime = 90 } = race.config;
  race.wetness = wetnessAt(race.weather, Math.max(...race.cars.map((c) => c.progress)));

  // Taps made during a stop shorten it for the car in the lane.
  for (const car of race.cars) {
    const s = car.isPlayer ? strategyOf(car, player) : undefined;
    if (s && s.pitTapCredit > 0 && car.pit) car.pit.remaining -= s.pitTapCredit;
  }
  player?.strategies.forEach((s) => (s.pitTapCredit = 0));

  for (const car of race.cars) {
    if (car.finishTime !== null || car.dnf) continue;
    const s = strategyOf(car, player);
    const crew = car.isPlayer ? (player?.pitCrew ?? 0) : 0;
    const boost = car.isPlayer ? playerBoost * (s ? paceFactor(s) : 1) : stepNpcTyres(race, car, dt);
    const before = car.progress;

    if (car.pit) {
      // In the pit lane the car follows the lane at the pace of the stop, whatever its racing speed.
      car.pit.remaining = Math.max(0, car.pit.remaining - dt);
      car.progress = pitProgress(car.pit);
      if (car.pit.remaining === 0) {
        car.pit = undefined;
        if (s?.pendingFit) {
          s.wear = 0;
          s.compound = s.nextCompound;
          s.pendingFit = false;
        }
      }
      if (Math.floor(car.progress) > Math.floor(before)) car.form = rollForm(race.rng);
      continue;
    }

    const f = car.fault;
    if (f && !f.started && car.progress >= f.at) {
      f.started = true;
      if (f.dnf) {
        car.dnf = true;
        continue;
      }
    }
    const crawling = !!f && f.started && f.remaining > 0;
    if (crawling) f.remaining -= dt;

    const handling = car.isPlayer && player?.handling ? handlingFactor(player.handling, cornerness(race.config.track, car.progress)) : 1;
    const grip = weatherFactor(s?.compound ?? 'medium', race.wetness, car.raceCraft ?? RIVAL_WET_CRAFT);
    const lapsPerSecond = (paceMultiplier(car.rating) * car.form * boost * handling * grip * raceCraftBonus(car.raceCraft ?? 0, car.progress) * (crawling ? BREAKDOWN_PACE : 1)) / baseLapTime;
    car.progress += lapsPerSecond * dt;
    if (Math.floor(car.progress) > Math.floor(before)) car.form = rollForm(race.rng);

    // Peel off into the pit lane at the entrance, which sits just before the line; never so late the exit would pass the flag.
    if (s?.pitRequested && car.lastPitId !== s.pitRequestId) {
      const lap = Math.floor(car.progress + PIT_HALF_LENGTH);
      if (lap > Math.floor(before + PIT_HALF_LENGTH) && lap >= 1 && lap < laps) {
        const base = pitDuration(crew);
        const roll = race.rng();
        const issue = roll < pitIssueChance(crew) ? PIT_ISSUES[Math.floor(race.rng() * PIT_ISSUES.length)] : undefined;
        const total = base + (issue?.extra ?? 0);
        car.pit = { start: lap - PIT_HALF_LENGTH, remaining: total, total, issue: issue?.name };
        car.progress = car.pit.start;
        car.lastPitId = s.pitRequestId;
        s.pendingFit = true;
        continue;
      }
    }

    if (car.progress >= laps) {
      // Interpolate the exact crossing time within this step.
      const over = (car.progress - laps) / lapsPerSecond;
      car.finishTime = race.time + dt - over;
      car.progress = laps;
    }
  }

  // Team-level pit state: the call is done once every car has made its stop.
  const teams = new Map<Strategy, Car[]>();
  for (const car of race.cars) {
    const s = strategyOf(car, player);
    if (s) teams.set(s, [...(teams.get(s) ?? []), car]);
  }
  for (const [s, cars] of teams) {
    s.pitRemaining = Math.max(0, ...cars.map((c) => c.pit?.remaining ?? 0));
    if (s.pitRequested && cars.every((c) => c.lastPitId === s.pitRequestId || c.finishTime !== null || c.dnf)) {
      s.pitRequested = false;
    }
  }

  race.time += dt;
  race.finished = race.cars.every((c) => c.finishTime !== null || c.dnf);
}

// Retired cars last, then finished cars by finish time, then the rest by distance covered.
export function standings(race: Race): Car[] {
  return [...race.cars].sort((a, b) => {
    if (!!a.dnf !== !!b.dnf) return a.dnf ? 1 : -1;
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    return b.progress - a.progress;
  });
}
