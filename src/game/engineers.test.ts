import { describe, expect, it } from 'vitest';
import {
  ENGINEER_MEETING_CLOUT,
  Engineer,
  MAX_ENGINEER_STAT,
  MIN_ENGINEER_STAT,
  endEngineerMeeting,
  offerEngineerContract,
  payEngineer,
  requestEngineerMeeting,
  reviewStrategy,
} from './engineers';
import { mulberry32 } from './race';
import { newStrategy } from './strategy';

const base = (over: Partial<Parameters<typeof requestEngineerMeeting>[0]> = {}) => ({
  clout: 5,
  season: 3,
  money: 1e9,
  engineer: null as Engineer | null,
  engineerMeeting: null as ReturnType<typeof requestEngineerMeeting>,
  ...over,
});

describe('engineer negotiation', () => {
  it('spends clout and rolls stats in range', () => {
    const s = base();
    const c = requestEngineerMeeting(s, mulberry32(1))!;
    expect(s.clout).toBe(5 - ENGINEER_MEETING_CLOUT);
    for (const v of [c.stats.pit, c.stats.tyre, c.stats.mode]) {
      expect(v).toBeGreaterThanOrEqual(MIN_ENGINEER_STAT);
      expect(v).toBeLessThanOrEqual(MAX_ENGINEER_STAT);
    }
    expect(requestEngineerMeeting(s, mulberry32(2))).toBeNull();
  });

  it('refuses a meeting without clout', () => {
    expect(requestEngineerMeeting(base({ clout: 0 }), mulberry32(1))).toBeNull();
  });

  it('signs at or above the price and walks otherwise', () => {
    const s = base();
    const c = requestEngineerMeeting(s, mulberry32(3))!;
    const low = offerEngineerContract(s, 1);
    expect(low.outcome).toBe('failed');
    expect(s.engineer).toBeNull();
    expect(s.engineerMeeting).toBeNull();

    const s2 = base();
    const c2 = requestEngineerMeeting(s2, mulberry32(3))!;
    expect(c2.name).toBe(c.name);
    expect(offerEngineerContract(s2, c2.hi * 2).outcome).toBe('signed');
    expect(s2.engineer?.name).toBe(c2.name);
  });

  it('walking away ends the meeting', () => {
    const s = base();
    requestEngineerMeeting(s, mulberry32(4));
    endEngineerMeeting(s);
    expect(s.engineerMeeting).toBeNull();
  });
});

describe('engineer wages', () => {
  const e: Engineer = { name: 'X', pit: 90, tyre: 90, mode: 90, salary: 100 };
  it('pays when affordable', () => {
    const s = base({ engineer: e, money: 500 });
    expect(payEngineer(s)).toEqual({ paid: 100, quit: [] });
    expect(s.money).toBe(400);
  });
  it('quits when the balance cannot be paid', () => {
    const s = base({ engineer: e, money: 5 });
    expect(payEngineer(s).quit).toEqual(['X']);
    expect(s.engineer).toBeNull();
  });
});

describe('reviewStrategy', () => {
  const pitRate = (pct: number) => {
    const rng = mulberry32(7);
    let calls = 0;
    for (let i = 0; i < 2000; i++) {
      const st = newStrategy();
      st.wear = 0.9;
      reviewStrategy({ pit: pct, tyre: pct, mode: pct }, st, 2, 5, 0, rng);
      if (st.pitRequested) calls++;
    }
    return calls / 2000;
  };

  it('calls needed stops in proportion to the Pit stat', () => {
    expect(pitRate(99)).toBeGreaterThan(0.95);
    expect(pitRate(30)).toBeLessThan(0.4);
    expect(pitRate(30)).toBeGreaterThan(0.2);
  });

  it('never overrides the player compound choice', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 200; i++) {
      const st = newStrategy();
      st.wear = 0.95;
      st.compoundChosen = true;
      st.nextCompound = 'hard';
      reviewStrategy({ pit: 99, tyre: 30, mode: 99 }, st, 2, 5, 0, rng);
      expect(st.nextCompound).toBe('hard');
    }
  });
});
