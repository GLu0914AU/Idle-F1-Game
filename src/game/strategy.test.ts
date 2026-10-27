import { describe, expect, it } from 'vitest';
import {
  MODE_COOLDOWN,
  PIT_ISSUES,
  pitIssueChance,
  isPitting,
  newStrategy,
  paceFactor,
  pitDuration,
  selectCompound,
  setMode,
  stepStrategy,
  tap,
  togglePitRequest,
} from './strategy';

const L = { tapPower: 0, pitCrew: 0, tyres: 0 };

describe('pit issues', () => {
  it('stops are long, and a better crew makes problems rarer', () => {
    expect(pitDuration(0)).toBeGreaterThanOrEqual(30);
    expect(pitIssueChance(20)).toBeLessThan(pitIssueChance(0));
    expect(pitIssueChance(1000)).toBeGreaterThan(0);
    expect(PIT_ISSUES.every((i) => i.extra > 0)).toBe(true);
  });
});

describe('strategy', () => {
  it('tyres wear over time and slow the car', () => {
    const s = newStrategy();
    const fresh = paceFactor(s);
    stepStrategy(s, 200, L);
    expect(s.wear).toBeGreaterThan(0.5);
    expect(paceFactor(s)).toBeLessThan(fresh);
  });

  it('push is faster but wears quicker than conserve', () => {
    const push = newStrategy();
    const cons = newStrategy();
    push.mode = 'push';
    cons.mode = 'conserve';
    stepStrategy(push, 50, L);
    stepStrategy(cons, 50, L);
    expect(push.wear).toBeGreaterThan(cons.wear);
    expect(paceFactor({ ...newStrategy(), mode: 'push' })).toBeGreaterThan(paceFactor({ ...newStrategy(), mode: 'conserve' }));
  });

  it('tyre upgrades slow wear', () => {
    const a = newStrategy();
    const b = newStrategy();
    stepStrategy(a, 100, L);
    stepStrategy(b, 100, { ...L, tyres: 10 });
    expect(b.wear).toBeLessThan(a.wear);
  });

  it('tapping builds boost that decays', () => {
    const s = newStrategy();
    tap(s, 0);
    tap(s, 0);
    const boosted = paceFactor(s);
    expect(boosted).toBeGreaterThan(1);
    stepStrategy(s, 10, L);
    expect(s.boost).toBe(0);
  });

  it('tyres are fitted only by the race when a car completes its stop, not on track', () => {
    const s = newStrategy();
    stepStrategy(s, 100, L);
    selectCompound(s, 'soft');
    togglePitRequest(s);
    stepStrategy(s, 100, L);
    expect(s.compound).toBe('medium');
    expect(s.wear).toBeGreaterThan(0);
    expect(s.pitRequested).toBe(true);
  });

  it('a request can be cancelled but not while pitting', () => {
    const s = newStrategy();
    togglePitRequest(s);
    togglePitRequest(s);
    expect(s.pitRequested).toBe(false);
    s.pitRemaining = 4;
    expect(togglePitRequest(s)).toBe(false);
    expect(isPitting(s)).toBe(true);
  });

  it('taps earn pit credit during a stop and pit crew upgrades help', () => {
    const s = newStrategy();
    s.pitRemaining = 5;
    tap(s, 0);
    expect(s.pitTapCredit).toBeGreaterThan(0);
    expect(s.boost).toBe(0);
    expect(pitDuration(10)).toBeLessThan(pitDuration(0));
  });

  it('mode changes have a cooldown', () => {
    const s = newStrategy();
    expect(setMode(s, 'push')).toBe(true);
    expect(setMode(s, 'conserve')).toBe(false);
    stepStrategy(s, MODE_COOLDOWN, L);
    expect(setMode(s, 'conserve')).toBe(true);
  });
});
