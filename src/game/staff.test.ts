import { describe, expect, it } from 'vitest';
import { developmentOdds, packageDef, teamQuality } from './development';
import { createRace, mulberry32, stepRace } from './race';
import { newGame, loadGame, saveGame } from './save';
import { settleRace } from './settle';
import { MAX_STAFF_STAT, STAFF_MEETING_CLOUT, STAFF_ROLES, StaffRole, endStaffMeeting, offerStaffContract, payStaff, payrollReserve, requestStaffMeeting, staffEffects } from './staff';
import { newStrategy, stepStrategy } from './strategy';

const hire = (state: ReturnType<typeof newGame>, role: StaffRole, stats: Record<string, number>, salary = 100) => {
  state.staff[role] = { name: 'Test', stats, salary };
};

// New games start with no clout, so negotiation tests grant some.
const richGame = () => ({ ...newGame(), clout: 10 });

describe('staff negotiation', () => {
  it('costs clout and opens one meeting per role', () => {
    const s = richGame();
    const before = s.clout;
    const c = requestStaffMeeting(s, 'tyre', mulberry32(1));
    expect(c).not.toBeNull();
    expect(s.clout).toBe(before - STAFF_MEETING_CLOUT);
    expect(requestStaffMeeting(s, 'tyre', mulberry32(2))).toBeNull();
    expect(requestStaffMeeting(s, 'pit', mulberry32(2))).not.toBeNull();
  });

  it('needs enough clout', () => {
    const s = newGame();
    s.clout = STAFF_MEETING_CLOUT - 1;
    expect(requestStaffMeeting(s, 'wind', mulberry32(1))).toBeNull();
  });

  it('generates the right stats for each role within range', () => {
    for (const role of STAFF_ROLES) {
      const s = richGame();
      const c = requestStaffMeeting(s, role, mulberry32(7))!;
      const keys = Object.keys(c.stats);
      expect(keys.length).toBe(role === 'pit' ? 2 : 1);
      for (const v of Object.values(c.stats)) {
        expect(v).toBeGreaterThanOrEqual(30);
        expect(v).toBeLessThanOrEqual(MAX_STAFF_STAT);
      }
    }
  });

  it('signs at or above the hidden minimum and fails below it', () => {
    const s = richGame();
    const c = requestStaffMeeting(s, 'pit', mulberry32(3))!;
    const low = offerStaffContract(s, 'pit', Math.max(1, c.secret - 1));
    expect(low.outcome).toBe('failed');
    expect(s.staff.pit).toBeNull();
    expect(s.staffMeetings.pit).toBeNull();

    s.clout = 10;
    const d = requestStaffMeeting(s, 'pit', mulberry32(4))!;
    const ok = offerStaffContract(s, 'pit', d.secret);
    expect(ok.outcome).toBe('signed');
    expect(s.staff.pit?.name).toBe(d.name);
    expect(s.staff.pit?.salary).toBe(d.secret);
  });

  it('walking away ends the meeting', () => {
    const s = newGame();
    requestStaffMeeting(s, 'wind', mulberry32(1));
    endStaffMeeting(s, 'wind');
    expect(s.staffMeetings.wind).toBeNull();
  });
});

describe('staff wages', () => {
  it('pays salaries and drops staff who cannot be paid', () => {
    const s = newGame();
    hire(s, 'tyre', { care: 60 }, 100);
    hire(s, 'pit', { speed: 60, precision: 60 }, 500);
    s.money = 300;
    const r = payStaff(s);
    expect(r.paid).toBe(60);
    expect(s.staff.tyre).not.toBeNull();
    expect(s.staff.pit).not.toBeNull();
    s.money = 55;
    expect(payStaff(s).quit).toEqual(['Test']);
    expect(s.staff.pit).toBeNull();
  });

  it('is taken in settleRace after every race, one instalment at a time', () => {
    const run = (race: number) => {
      const s = newGame();
      hire(s, 'wind', { insight: 50 }, 100);
      s.money = 1000;
      s.race = race;
      const r = createRace({ season: 1, seed: 5, laps: 1 } as never);
      stepRace(r, 100000, 1);
      return settleRace(s, r.cars.slice().sort((a, b) => b.progress - a.progress), mulberry32(1));
    };
    expect(run(3).wagesPaid).toBe(10);
    expect(run(10).wagesPaid).toBe(10);
  });

  it('keeps the next race\'s wages aside for Auto Buy', () => {
    const s = newGame();
    hire(s, 'wind', { insight: 50 }, 1000);
    s.drivers[0].salary = 200;
    expect(payrollReserve(s)).toBe(100 + 20);
  });
});

describe('staff effects', () => {
  it('do nothing without staff and stay modest at the maximum', () => {
    const none = staffEffects(newGame().staff);
    expect(none).toEqual({ tyreWearCut: 0, pitTimeCut: 0, pitIssueCut: 0, windQuality: 0 });
    const s = newGame();
    hire(s, 'tyre', { care: MAX_STAFF_STAT });
    hire(s, 'pit', { speed: MAX_STAFF_STAT, precision: MAX_STAFF_STAT });
    hire(s, 'wind', { insight: MAX_STAFF_STAT });
    const fx = staffEffects(s.staff);
    expect(fx.tyreWearCut).toBeCloseTo(0.15);
    expect(fx.pitTimeCut).toBeCloseTo(0.15);
    expect(fx.pitIssueCut).toBeCloseTo(0.35);
    expect(fx.windQuality).toBeCloseTo(0.4);
  });

  it('tyre care slows wear', () => {
    const levels = { tapPower: 0, pitCrew: 0, tyres: 0 };
    const a = newStrategy();
    const b = newStrategy();
    stepStrategy(a, 60, levels);
    stepStrategy(b, 60, { ...levels, tyreWearCut: 0.15 });
    expect(b.wear).toBeLessThan(a.wear);
    expect(b.wear / a.wear).toBeCloseTo(0.85, 2);
  });

  it('wind tunnel insight raises team quality and breakthrough odds', () => {
    const s = newGame();
    const base = teamQuality(s);
    hire(s, 'wind', { insight: MAX_STAFF_STAT });
    expect(teamQuality(s)).toBeGreaterThan(base);
    const def = packageDef('aero')!;
    expect(developmentOdds(teamQuality(s), def).big).toBeGreaterThan(developmentOdds(base, def).big);
  });
});

describe('staff saves', () => {
  it('old saves gain empty staff and keep hires', () => {
    const store = new Map<string, string>();
    const mem = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const old = JSON.parse(JSON.stringify(newGame())) as Record<string, unknown>;
    delete old.staff;
    delete old.staffMeetings;
    store.set('idle-f1-save', JSON.stringify(old));
    const loaded = loadGame(mem);
    expect(loaded.staff).toEqual({ tyre: null, pit: null, wind: null });

    hire(loaded, 'tyre', { care: 70 });
    saveGame(loaded, mem);
    expect(loadGame(mem).staff.tyre?.stats.care).toBe(70);
  });
});
