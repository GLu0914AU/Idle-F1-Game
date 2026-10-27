import { pickAutoBuy } from './auto';
import { canRunFanEvent, runFanEvent } from './career';
import { DEV_PACKAGES, developmentCost, startDevelopment } from './development';
import { DRIVER_MEETING_CLOUT, driverRating, endDriverMeeting, offerContract, requestDriverMeeting } from './drivers';
import {
  ENGINEER_MEETING_CLOUT,
  ENGINEER_REVIEW_SECONDS,
  endEngineerMeeting,
  engineerRating,
  offerEngineerContract,
  requestEngineerMeeting,
  reviewStrategy,
} from './engineers';
import { buyUpgrade, carRating, incomePerSecond, sponsorMultiplier } from './economy';
import { buyResearch, canPrestige, effectiveUpgrades, pickAutoResearch, prestige } from './prestige';
import { Race, createRace, mulberry32, standings, stepRace } from './race';
import { GameState, newGame } from './save';
import { settleRace } from './settle';
import { RACES_PER_SEASON } from './season';
import { STAFF_MEETING_CLOUT, STAFF_ROLES, endStaffMeeting, offerStaffContract, requestStaffMeeting, staffEffects } from './staff';
import { meetingCost, pitch, requestMeeting } from './sponsors';
import { newStrategy, stepStrategy, tap, Strategy } from './strategy';
import { pickTrack } from './tracks';
import { rollWeather } from './weather';

// These mirror GameScene.
export const RACE_LAPS = 5;
export const RACE_SPEED = 6;
const AUTO_BUY_EVERY = 0.5;
const AUTO_TAP_EVERY = 0.4;
// Real seconds the banner stays up between races.
const RESTART_DELAY = { next: 3, season: 5 };

// How the simulated player behaves. `active` has every Auto feature on and works the Team and Sponsors tabs.
export interface Profile {
  name: string;
  autoBuy: boolean;
  autoResearch: boolean;
  autoTap: boolean;
  // Calls pit stops and modes by hand when there is no engineer.
  manual: boolean;
  recruit: boolean;
  sponsors: boolean;
  fanEvent: boolean;
  // Commissions development packages between races.
  develop: boolean;
}

export const ACTIVE: Profile = { name: 'active', autoBuy: true, autoResearch: true, autoTap: true, manual: true, recruit: true, sponsors: true, fanEvent: true, develop: true };
// Buys things but never taps, never calls a stop and ignores sponsors, drivers and engineers.
export const LAZY: Profile = { name: 'lazy', autoBuy: true, autoResearch: true, autoTap: false, manual: false, recruit: false, sponsors: false, fanEvent: false, develop: false };
// A attentive human with no engineer: nearly always makes the right call.
const HUMAN_CALLER = { pit: 95, tyre: 95, mode: 90 };

export interface SimOptions {
  seed: number;
  profile: Profile;
  // How many prestiges to play through; the sim ends once the last run finishes.
  prestiges: number;
  // Prestige once this many seasons in a row are lost at the same level.
  lossesToPrestige?: number;
  // Real seconds a run may take before the player gives up (stuck below the prestige threshold).
  maxRunSeconds?: number;
  // Real seconds per sim step.
  dt?: number;
}

export interface RunResult {
  run: number;
  maxSeason: number;
  // Season the previous run ended at; 0 for the first.
  previousBest: number;
  realSeconds: number;
  races: number;
  seasonLosses: number;
  titles: number;
  rpEarned: number;
  rating: number;
  income: number;
  prizes: number;
  sponsorCash: number;
  wages: number;
  quits: number;
  rainy: number;
  rainPositions: number[];
  dryPositions: number[];
  breakdowns: number;
  dnfs: number;
  pits: number;
  pitIssues: number;
  // Money spent on development, and how its packages turned out.
  devSpent: number;
  devResults: { flop: number; solid: number; big: number };
  // Real seconds at which each season was first reached.
  reached: Record<number, number>;
  // The player's car rating when each season was first reached.
  ratingAt: Record<number, number>;
  stuck: boolean;
  // Every race played in Season 1 (including replays), for checking the opening.
  season1: { best: number; worst: number; seconds: number; rating: number; money: number }[];
  // Research levels while this run was played.
  research: Record<string, number>;
}

export interface SimResult {
  runs: RunResult[];
  state: GameState;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export { avg };

export function simulate(opts: SimOptions): SimResult {
  const rng = mulberry32(opts.seed);
  const dt = opts.dt ?? 0.15;
  const lossesToPrestige = opts.lossesToPrestige ?? 2;
  const maxRunSeconds = opts.maxRunSeconds ?? 8 * 3600;
  const p = opts.profile;
  const state = newGame(0);
  state.teamNamed = true;
  state.autoUnlocked = true;
  state.autoBuy = p.autoBuy;
  state.autoResearch = p.autoResearch;
  state.autoTap = p.autoTap;

  const eff = () => effectiveUpgrades(state);
  let strategies: [Strategy, Strategy] = [newStrategy(), newStrategy()];
  let race!: Race;
  let lastTrack: string | undefined;
  const startRace = () => {
    const track = pickTrack(rng, lastTrack);
    lastTrack = track.name;
    race = createRace({
      track,
      laps: RACE_LAPS,
      season: state.season,
      playerRating: carRating(eff()),
      playerTeamName: state.teamName,
      playerDrivers: state.driverNames,
      playerColor: state.teamColor,
      playerReliability: eff().reliability ?? 0,
      playerDriverStats: state.drivers,
      weather: rollWeather(rng, RACE_LAPS),
      rivalDrift: state.development.rivalDrift,
      seed: Math.floor(rng() * 0x7fffffff),
    });
    strategies = [newStrategy(strategies[0]), newStrategy(strategies[1])];
  };
  const applyRating = () => {
    const rating = carRating(eff());
    race.cars.forEach((car) => {
      if (!car.isPlayer) return;
      const d = state.drivers[car.id === 'player-0' ? 0 : 1];
      car.rating = driverRating(rating, d);
      car.raceCraft = d.raceCraft;
    });
  };

  const runs: RunResult[] = [];
  const blank = (run: number, previousBest: number): RunResult => ({
    run, maxSeason: 1, previousBest, realSeconds: 0, races: 0, seasonLosses: 0, titles: 0, rpEarned: 0, rating: 0,
    income: 0, prizes: 0, sponsorCash: 0, wages: 0, quits: 0, rainy: 0, rainPositions: [], dryPositions: [],
    breakdowns: 0, dnfs: 0, pits: 0, pitIssues: 0, devSpent: 0, devResults: { flop: 0, solid: 0, big: 0 }, reached: { 1: 0 }, ratingAt: { 1: 10 }, stuck: false, season1: [], research: {},
  });
  let cur = blank(0, 0);

  const beginRun = () => {
    if (p.fanEvent && canRunFanEvent(state)) runFanEvent(state, incomePerSecond(carRating(eff()), sponsorMultiplier(state)), rng);
  };

  startRace();
  beginRun();
  let autoBuyTimer = 0;
  let autoTapTimer = 0;
  let engineerTimer = 0;
  let restartAt = 0;
  let restartDelay = RESTART_DELAY.next;
  let settled = false;
  let lossStreak = 0;
  const seenPits = new WeakSet<object>();

  const endRun = (stuck: boolean) => {
    cur.stuck = stuck;
    cur.rating = carRating(eff());
    cur.research = { ...state.research };
    runs.push(cur);
  };

  while (runs.length <= opts.prestiges) {
    cur.realSeconds += dt;
    const boostIncome = incomePerSecond(carRating(eff()), sponsorMultiplier(state)) * dt;
    state.money += boostIncome;
    cur.income += boostIncome;

    // Autos, as in GameScene.runAutos.
    if (state.autoBuy) {
      autoBuyTimer += dt;
      if (autoBuyTimer >= AUTO_BUY_EVERY) {
        autoBuyTimer = 0;
        const def = pickAutoBuy(state.money, state.upgrades);
        if (def && buyUpgrade(state, def)) applyRating();
      }
    }
    if (state.autoResearch) {
      const def = pickAutoResearch(state);
      if (def && buyResearch(state, def)) applyRating();
    }
    if (state.autoTap) {
      autoTapTimer += dt;
      while (autoTapTimer >= AUTO_TAP_EVERY) {
        autoTapTimer -= AUTO_TAP_EVERY;
        for (const s of strategies) tap(s, eff().tapPower ?? 0);
      }
    }
    const caller = state.engineer ?? (p.manual ? HUMAN_CALLER : null);
    if (caller && !race.finished) {
      engineerTimer += dt;
      if (engineerTimer >= ENGINEER_REVIEW_SECONDS) {
        engineerTimer = 0;
        strategies.forEach((st, i) => {
          const car = race.cars.find((c) => c.id === `player-${i}`)!;
          reviewStrategy(caller, st, car.progress, RACE_LAPS, race.wetness, rng, race.safetyCarActive);
        });
      }
    }

    const e = eff();
    const gameDt = dt * RACE_SPEED;
    const levels = { tapPower: e.tapPower ?? 0, pitCrew: e.pitCrew ?? 0, tyres: e.tyres ?? 0, tyreScience: e.tyreScience ?? 0, energyRecovery: e.energyRecovery ?? 0, wetness: race.wetness };
    const fx = staffEffects(state.staff);
    strategies.forEach((st, i) => stepStrategy(st, gameDt, { ...levels, driverTyre: state.drivers[i].tyreMgmt, tyreWearCut: fx.tyreWearCut }));
    stepRace(race, gameDt, 1, { strategies, pitCrew: e.pitCrew ?? 0, pitTimeCut: fx.pitTimeCut, pitIssueCut: fx.pitIssueCut, handling: { topSpeed: e.topSpeed ?? 0, cornering: e.cornering ?? 0 } });
    for (const car of race.cars) {
      if (car.isPlayer && car.pit && !seenPits.has(car.pit)) {
        seenPits.add(car.pit);
        cur.pits += 1;
        if (car.pit.issue) cur.pitIssues += 1;
      }
    }

    if (race.finished && !settled) {
      settled = true;
      const order = standings(race);
      const seasonBefore = state.season;
      const moneyBefore = state.money;
      const s = settleRace(state, order, rng);
      if (s.development) cur.devResults[s.development.outcome] += 1;
      if (seasonBefore === 1) cur.season1.push({ best: Math.min(...s.positions), worst: Math.max(...s.positions), seconds: cur.realSeconds, rating: carRating(eff()), money: moneyBefore });
      cur.races += 1;
      cur.prizes += s.payout;
      cur.sponsorCash += s.sponsorCash;
      cur.wages += s.wagesPaid;
      cur.quits += s.quit.length;
      const rainy = race.weather.peak > 0;
      if (rainy) cur.rainy += 1;
      for (const pos of s.positions) (rainy ? cur.rainPositions : cur.dryPositions).push(pos);
      for (const car of race.cars) {
        if (!car.isPlayer) continue;
        if (car.fault?.started) cur.breakdowns += 1;
        if (car.dnf) cur.dnfs += 1;
      }
      if (s.quit.length > 0) applyRating();

      if (s.outcome.type === 'season-won') {
        cur.titles += 1;
        lossStreak = 0;
        cur.maxSeason = Math.max(cur.maxSeason, state.season);
        for (let k = 1; k <= state.season; k++) {
          if (cur.reached[k] === undefined) {
            cur.reached[k] = cur.realSeconds;
            cur.ratingAt[k] = carRating(eff());
          }
        }
      } else if (s.outcome.type === 'season-lost') {
        cur.seasonLosses += 1;
        lossStreak += 1;
      }

      // Between races the player works the Sponsors and Team tabs.
      if (p.develop) {
        // Commissions the most ambitious package they can afford that finishes in time.
        for (const def of [...DEV_PACKAGES].reverse()) {
          if (startDevelopment(state, def.key, RACES_PER_SEASON)) {
            cur.devSpent += developmentCost(state, def);
            break;
          }
        }
      }
      if (p.sponsors) {
        while (!state.meeting && state.gems >= meetingCost(state.sponsorList.length)) {
          const m = requestMeeting(state, rng);
          if (!m) break;
          pitch(state, m.lo);
        }
      }
      if (p.recruit) {
        while (!state.driverMeeting && state.clout >= DRIVER_MEETING_CLOUT) {
          const c = requestDriverMeeting(state, rng);
          if (!c) break;
          const slot = state.drivers[0].skill <= state.drivers[1].skill ? 0 : 1;
          const cheapEnough = state.money > c.hi * 10;
          if (c.stats.skill > state.drivers[slot].skill && cheapEnough) {
            offerContract(state, slot, c.hi);
            applyRating();
          } else endDriverMeeting(state);
        }
      }
      if (p.recruit) {
        while (!state.engineerMeeting && state.clout >= ENGINEER_MEETING_CLOUT) {
          const c = requestEngineerMeeting(state, rng);
          if (!c) break;
          const better = !state.engineer || engineerRating(c.stats) > engineerRating(state.engineer);
          if (better && state.money > c.hi * 10) offerEngineerContract(state, c.hi);
          else endEngineerMeeting(state);
        }
      }
      if (p.recruit) {
        for (const role of STAFF_ROLES) {
          while (!state.staffMeetings[role] && state.clout >= STAFF_MEETING_CLOUT) {
            const c = requestStaffMeeting(state, role, rng);
            if (!c) break;
            const total = (stats: Record<string, number>) => Object.values(stats).reduce((a, b) => a + b, 0);
            const cur2 = state.staff[role];
            if ((!cur2 || total(c.stats) > total(cur2.stats)) && state.money > c.hi * 10) offerStaffContract(state, role, c.hi);
            else endStaffMeeting(state, role);
          }
        }
      }

      const mustGiveUp = cur.realSeconds > maxRunSeconds && !canPrestige(state);
      if (mustGiveUp) {
        endRun(true);
        break;
      }
      if (lossStreak >= lossesToPrestige && canPrestige(state)) {
        const season = state.season;
        const earned = prestige(state);
        cur.maxSeason = Math.max(cur.maxSeason, season);
        cur.rpEarned = earned;
        const finished = cur;
        endRun(false);
        cur = blank(finished.run + 1, Math.max(...runs.map((r) => r.maxSeason)));
        lossStreak = 0;
        // Wages from the last run don't carry over, but the drivers do.
        restartAt = 0;
        startRace();
        beginRun();
        settled = false;
        continue;
      }
      restartAt = 0;
      restartDelay = s.outcome.type === 'next-race' ? RESTART_DELAY.next : RESTART_DELAY.next + (RESTART_DELAY.season - RESTART_DELAY.next);
    }
    if (race.finished) {
      restartAt += dt;
      if (restartAt > restartDelay) {
        startRace();
        settled = false;
      }
    }
    if (cur.realSeconds > maxRunSeconds * 2) {
      endRun(true);
      break;
    }
  }
  return { runs, state };
}

export { RACES_PER_SEASON };
