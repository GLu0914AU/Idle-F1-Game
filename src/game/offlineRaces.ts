import { carRating, incomePerSecond, sponsorMultiplier } from './economy';
import { ENGINEER_REVIEW_SECONDS, reviewStrategy } from './engineers';
import { driverRating } from './drivers';
import { AUTO_OFFLINE_CAP_S, FREE_OFFLINE_CAP_S, FREE_OFFLINE_RATE, MIN_OFFLINE_S } from './offline';
import { effectiveUpgrades } from './prestige';
import { createRace, mulberry32, standings, stepRace } from './race';
import { GameState } from './save';
import { settleRace } from './settle';
import { RACE_LAPS, RACE_SPEED } from './sim';
import { staffEffects } from './staff';
import { Strategy, newStrategy, stepStrategy } from './strategy';
import { pickTrack } from './tracks';
import { rollWeather } from './weather';

// Real seconds one race takes when played live.
export const OFFLINE_RACE_SECONDS = 60;
// Offline prize money is a little worse than live play, which has taps, boosts and manual calls.
export const OFFLINE_PRIZE_FACTOR = 0.85;
const SIM_DT = 0.15;

export interface OfflineReport {
  seconds: number;
  races: number;
  wins: number;
  podiums: number;
  bestFinish: number | null;
  startSeason: number;
  endSeason: number;
  income: number;
  prizes: number;
  wages: number;
  quits: string[];
  devResults: { flop: number; solid: number; big: number };
  // The state after the away time. It replaces the live state only once the player collects.
  next: GameState;
}

// Plays the races that would have happened while away. Never goes past the best season reached before a prestige,
// so being away can't set a new record. Works on a copy; the real state is untouched until applyOffline.
export function simulateOffline(state: GameState, now: number, rng: () => number = mulberry32(now >>> 0)): OfflineReport | null {
  const elapsed = Math.max(0, (now - state.lastSavedAt) / 1000);
  if (elapsed < MIN_OFFLINE_S) return null;
  const cap = state.autoUnlocked ? AUTO_OFFLINE_CAP_S : FREE_OFFLINE_CAP_S;
  const rate = state.autoUnlocked ? 1 : FREE_OFFLINE_RATE;
  const seconds = Math.min(elapsed, cap);
  const s = structuredClone(state);
  const report: OfflineReport = {
    seconds, races: 0, wins: 0, podiums: 0, bestFinish: null, startSeason: s.season, endSeason: s.season,
    income: 0, prizes: 0, wages: 0, quits: [], devResults: { flop: 0, solid: 0, big: 0 }, next: s,
  };
  const perSecond = () => incomePerSecond(carRating(effectiveUpgrades(s)), sponsorMultiplier(s)) * rate;
  const earn = (secs: number) => {
    const gain = Math.floor(perSecond() * secs);
    s.money += gain;
    report.income += gain;
  };

  let remaining = seconds;
  let lastTrack: string | undefined;
  while (remaining >= OFFLINE_RACE_SECONDS && s.season < s.bestSeason) {
    remaining -= OFFLINE_RACE_SECONDS;
    earn(OFFLINE_RACE_SECONDS);
    lastTrack = playRace(s, rng, report, lastTrack);
  }
  earn(remaining);
  report.endSeason = s.season;
  return report;
}

function playRace(s: GameState, rng: () => number, report: OfflineReport, lastTrack: string | undefined): string {
  const eff = effectiveUpgrades(s);
  const track = pickTrack(rng, lastTrack);
  const race = createRace({
    track,
    laps: RACE_LAPS,
    season: s.season,
    playerRating: carRating(eff),
    playerTeamName: s.teamName,
    playerDrivers: s.driverNames,
    playerColor: s.teamColor,
    playerReliability: eff.reliability ?? 0,
    playerDriverStats: s.drivers,
    weather: rollWeather(rng, RACE_LAPS),
    rivalDrift: s.development.rivalDrift,
    seed: Math.floor(rng() * 0x7fffffff),
  });
  race.cars.forEach((car) => {
    if (!car.isPlayer) return;
    const d = s.drivers[car.id === 'player-0' ? 0 : 1];
    car.rating = driverRating(carRating(eff), d);
    car.raceCraft = d.raceCraft;
  });
  const strategies: [Strategy, Strategy] = [newStrategy(), newStrategy()];
  const fx = staffEffects(s.staff);
  const gameDt = SIM_DT * RACE_SPEED;
  let reviewTimer = 0;
  // Offline play has no taps and no manual calls: only the race engineer steers.
  for (let i = 0; i < 20000 && !race.finished; i++) {
    if (s.engineer) {
      reviewTimer += SIM_DT;
      if (reviewTimer >= ENGINEER_REVIEW_SECONDS) {
        reviewTimer = 0;
        strategies.forEach((st, k) => {
          const car = race.cars.find((c) => c.id === `player-${k}`)!;
          reviewStrategy(s.engineer!, st, car.progress, RACE_LAPS, race.wetness, rng, race.safetyCarActive);
        });
      }
    }
    const levels = { tapPower: 0, pitCrew: eff.pitCrew ?? 0, tyres: eff.tyres ?? 0, tyreScience: eff.tyreScience ?? 0, energyRecovery: eff.energyRecovery ?? 0, wetness: race.wetness };
    strategies.forEach((st, k) => stepStrategy(st, gameDt, { ...levels, driverTyre: s.drivers[k].tyreMgmt, tyreWearCut: fx.tyreWearCut }));
    stepRace(race, gameDt, 1, { strategies, pitCrew: eff.pitCrew ?? 0, pitTimeCut: fx.pitTimeCut, pitIssueCut: fx.pitIssueCut, handling: { topSpeed: eff.topSpeed ?? 0, cornering: eff.cornering ?? 0 } });
  }

  const result = settleRace(s, standings(race), rng);
  // Only the prize is discounted; wages and sponsor cash are as normal.
  const penalty = Math.floor(result.payout * (1 - OFFLINE_PRIZE_FACTOR));
  s.money = Math.max(0, s.money - penalty);
  report.prizes += result.payout - penalty;
  report.wages += result.wagesPaid;
  report.quits.push(...result.quit);
  report.income += result.sponsorCash;
  report.races += 1;
  const best = Math.min(...result.positions);
  report.bestFinish = report.bestFinish === null ? best : Math.min(report.bestFinish, best);
  if (best <= 3) report.podiums += 1;
  if (best === 1) report.wins += 1;
  if (result.development) report.devResults[result.development.outcome] += 1;

  // Count towards lifetime achievements only; daily goals are for live play.
  const c = s.goals.counters;
  c.race += 1;
  if (best <= 3) c.podium += 1;
  if (best === 1) {
    c.win += 1;
    if (race.weather.peak > 0) c.wetWin += 1;
  }
  if (result.development?.outcome === 'big') c.breakthrough += 1;
  if (result.development?.outcome === 'flop') c.flop += 1;

  if (s.season > s.bestSeason) s.season = s.bestSeason;
  return track.name;
}

// Takes on the results once the player collects them.
export function applyOffline(state: GameState, report: OfflineReport): void {
  Object.assign(state, report.next);
}
