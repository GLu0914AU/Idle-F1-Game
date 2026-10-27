import { describe, expect, it } from 'vitest';
import { ACTIVE, LAZY, Profile, RunResult, avg, simulate } from './sim';

// Vitest runs in Node; the app's tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };

// `BALANCE=1 npx vitest run src/game/balance.test.ts` prints the full report across many seeds.
const FULL = !!process.env.BALANCE;
const SEEDS = Number(process.env.SEEDS ?? 6);
const PRESTIGES = Number(process.env.PRESTIGES ?? 8);

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');

function report(profile: Profile) {
  const all: RunResult[][] = [];
  for (let seed = 1; seed <= SEEDS; seed++) all.push(simulate({ seed, profile, prestiges: PRESTIGES }).runs);
  const lines: string[] = [`\n=== ${profile.name}: ${SEEDS} seeds, ${PRESTIGES} prestiges ===`];
  lines.push('run | season reached (mean min-max) | gain vs prev best (mean min-max) | real min (mean) | RP | losses | titles');
  const maxRuns = Math.max(...all.map((r) => r.length));
  for (let run = 0; run < maxRuns; run++) {
    const rs = all.map((r) => r[run]).filter(Boolean);
    const seasons = rs.map((r) => r.maxSeason);
    const gains = rs.map((r) => (r.run === 0 ? r.maxSeason - 1 : r.maxSeason - r.previousBest));
    lines.push(
      [
        String(run + 1).padStart(3),
        `${fmt(avg(seasons))} (${Math.min(...seasons)}-${Math.max(...seasons)})`,
        `${fmt(avg(gains))} (${Math.min(...gains)}-${Math.max(...gains)})`,
        fmt(avg(rs.map((r) => r.realSeconds / 60)), 0),
        fmt(avg(rs.map((r) => r.rpEarned)), 1),
        fmt(avg(rs.map((r) => r.seasonLosses))),
        fmt(avg(rs.map((r) => r.titles))),
      ].join(' | '),
    );
  }
  const flat = all.flat();
  const prizes = flat.reduce((a, r) => a + r.prizes + r.income + r.sponsorCash, 0);
  const wages = flat.reduce((a, r) => a + r.wages, 0);
  const races = flat.reduce((a, r) => a + r.races, 0);
  const rainy = flat.reduce((a, r) => a + r.rainy, 0);
  const player = flat.length * 0 + races * 2;
  lines.push(
    `wages/total earnings ${fmt((100 * wages) / prizes, 2)}% | driver quits ${flat.reduce((a, r) => a + r.quits, 0)} | ` +
      `rain ${fmt((100 * rainy) / races)}% of races | avg finish dry ${fmt(avg(flat.flatMap((r) => r.dryPositions)))} rain ${fmt(avg(flat.flatMap((r) => r.rainPositions)))}`,
  );
  lines.push(
    `breakdowns ${fmt((100 * flat.reduce((a, r) => a + r.breakdowns, 0)) / player)}% of car-races, DNF ${fmt((100 * flat.reduce((a, r) => a + r.dnfs, 0)) / player)}% | ` +
      `pit issues ${fmt((100 * flat.reduce((a, r) => a + r.pitIssues, 0)) / Math.max(1, flat.reduce((a, r) => a + r.pits, 0)))}% of ${flat.reduce((a, r) => a + r.pits, 0)} stops`,
  );
  const stuck = flat.filter((r) => r.stuck).length;
  if (stuck) lines.push(`STUCK runs: ${stuck}`);
  process.stdout.write(lines.join('\n') + '\n');
  return all;
}

describe('simulator', () => {
  it('plays a fresh game through its first prestige', () => {
    const { runs } = simulate({ seed: 1, profile: ACTIVE, prestiges: 1 });
    expect(runs.length).toBe(2);
    expect(runs[0].maxSeason).toBeGreaterThanOrEqual(3);
    expect(runs[0].rpEarned).toBeGreaterThan(0);
  }, 120_000);

  it('lets a fresh team clear Season 1 in a reasonable time on average', () => {
    const runs = Array.from({ length: 10 }, (_, i) => simulate({ seed: i + 1, profile: ACTIVE, prestiges: 0 }).runs[0]);
    const mean = (f: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
    expect(mean((r) => r.season1[0].best)).toBeLessThanOrEqual(12);
    expect(mean((r) => r.reached[2])).toBeLessThan(20 * 60);
    // A lost title costs a whole replay, but most teams still win it first time.
    expect(runs.filter((r) => r.reached[2] < 17 * 60).length).toBeGreaterThanOrEqual(7);
  }, 120_000);

  it.runIf(FULL)('reports the opening (Season 1, first run)', () => {
    const runs = Array.from({ length: SEEDS }, (_, i) => simulate({ seed: i + 1, profile: ACTIVE, prestiges: 0 }).runs[0]);
    const lines = ['\n=== opening: Season 1 races, first run (mean over seeds) ===', 'race# | best | worst | minute | rating | money before'];
    for (let n = 0; n < 14; n++) {
      const rs = runs.map((r) => r.season1[n]).filter(Boolean);
      if (!rs.length) break;
      lines.push([String(n + 1).padStart(4), fmt(avg(rs.map((r) => r.best))), fmt(avg(rs.map((r) => r.worst))), fmt(avg(rs.map((r) => r.seconds / 60))), fmt(avg(rs.map((r) => r.rating)), 0), fmt(avg(rs.map((r) => r.money)), 0)].join(' | '));
    }
    lines.push(`season 1 cleared after ${fmt(avg(runs.map((r) => (r.reached[2] ?? NaN) / 60)))} min on average`);
    process.stdout.write(lines.join('\n') + '\n');
  }, 600_000);

  it.runIf(FULL)('reports balance across seeds', () => {
    report(ACTIVE);
    if (process.env.LAZY) report(LAZY);
  }, 3_600_000);
});
