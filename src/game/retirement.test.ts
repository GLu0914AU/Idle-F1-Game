import { describe, expect, it } from 'vitest';
import { MAX_CAREER, careerLabel, offerContract, requestDriverMeeting, retireAfterPrestige, rollCareer } from './drivers';
import { prestige } from './prestige';
import { mulberry32 } from './race';
import { newGame } from './save';

describe('team member careers', () => {
  it('rolls 1 to 25 prestiges', () => {
    const rng = mulberry32(7);
    const rolls = Array.from({ length: 500 }, () => rollCareer(rng));
    expect(Math.min(...rolls)).toBe(1);
    expect(Math.max(...rolls)).toBe(MAX_CAREER);
    expect(rollCareer(() => 0.9999999)).toBe(MAX_CAREER);
  });

  it('carries the roll from the candidate onto the signed driver', () => {
    const s = { ...newGame(), clout: 5 };
    const c = requestDriverMeeting(s, mulberry32(3))!;
    offerContract(s, 0, 1e9);
    expect(s.drivers[0].prestigesLeft).toBe(c.career);
  });

  it('counts down each prestige and retires at zero', () => {
    const s = newGame();
    s.drivers[0] = { ...s.drivers[0], skill: 10, salary: 500, prestigesLeft: 2 };
    s.driverNames[0] = 'Test Driver';
    s.engineer = { name: 'Eng', pit: 50, tyre: 50, mode: 50, salary: 100, prestigesLeft: 1 };
    s.staff.tyre = { name: 'Tyre Guy', stats: {}, salary: 100, prestigesLeft: 3 };
    expect(retireAfterPrestige(s)).toEqual(['Eng']);
    expect(s.engineer).toBeNull();
    expect(s.drivers[0].prestigesLeft).toBe(1);
    expect(s.staff.tyre?.prestigesLeft).toBe(2);
    expect(retireAfterPrestige(s)).toEqual(['Test Driver']);
    expect(s.drivers[0].salary).toBe(0);
    expect(s.driverNames[0]).not.toBe('Test Driver');
  });

  it('never retires contracts without a career (older saves)', () => {
    const s = newGame();
    s.drivers[0] = { ...s.drivers[0], salary: 500 };
    expect(retireAfterPrestige(s)).toEqual([]);
    expect(s.drivers[0].salary).toBe(500);
  });

  it('is applied by prestige()', () => {
    const s = { ...newGame(), season: 5 };
    s.drivers[1] = { ...s.drivers[1], salary: 500, prestigesLeft: 1 };
    prestige(s);
    expect(s.drivers[1].salary).toBe(0);
  });

  it('labels the remaining career', () => {
    expect(careerLabel(1)).toBe('Retires after 1 prestige');
    expect(careerLabel(12)).toBe('Retires after 12 prestiges');
    expect(careerLabel(undefined)).toBe('');
  });
});
