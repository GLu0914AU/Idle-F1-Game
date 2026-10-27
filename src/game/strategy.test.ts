import { describe, expect, it } from 'vitest';
import {
  MODE_COOLDOWN,
  newStrategy,
  paceFactor,
  pitDuration,
  setMode,
  startPit,
  stepStrategy,
  tap,
} from './strategy';

const L = { tapPower: 0, pitCrew: 0, tyres: 0 };

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

  it('a pit stop resets tyres and switches compound', () => {
    const s = newStrategy();
    stepStrategy(s, 200, L);
    s.nextCompound = 'hard';
    expect(startPit(s, 0)).toBe(true);
    expect(startPit(s, 0)).toBe(false);
    stepStrategy(s, pitDuration(0) + 1, L);
    expect(s.wear).toBe(0);
    expect(s.compound).toBe('hard');
    expect(s.pitRemaining).toBe(0);
  });

  it('taps shorten a pit stop and pit crew upgrades help', () => {
    const s = newStrategy();
    startPit(s, 0);
    const before = s.pitRemaining;
    tap(s, 0);
    expect(s.pitRemaining).toBeLessThan(before);
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
