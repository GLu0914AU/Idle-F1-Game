import { describe, expect, it } from 'vitest';
import { currentSalary, offerContract, requestDriverMeeting, salaryMarket } from './drivers';
import { mulberry32 } from './race';
import { newGame } from './save';
import { totalPayroll } from './staff';

describe('season-tied contracts', () => {
  it('stamps the signing season on a new driver', () => {
    const s = { ...newGame(), season: 4, bestSeason: 4, clout: 5 };
    requestDriverMeeting(s, mulberry32(3));
    offerContract(s, 0, 1e9);
    expect(s.drivers[0].season).toBe(4);
  });

  it('costs the full contract in or above the signing season', () => {
    const s = { season: 5, bestSeason: 5 };
    expect(currentSalary({ salary: 1000, season: 5 }, s)).toBe(1000);
    expect(currentSalary({ salary: 1000, season: 3 }, s)).toBe(1000);
  });

  it('drops to Season 1 levels after a prestige and climbs back', () => {
    const c = { salary: 100000, season: 6 };
    const at = (season: number) => currentSalary(c, { season, bestSeason: 6 });
    expect(at(1)).toBe(Math.round((100000 * salaryMarket(1)) / salaryMarket(6)));
    expect(at(1)).toBeLessThan(at(3));
    expect(at(3)).toBeLessThan(at(6));
    expect(at(6)).toBe(100000);
  });

  it('treats an unstamped contract as signed at the best season reached', () => {
    expect(currentSalary({ salary: 5000 }, { season: 1, bestSeason: 5 })).toBeLessThan(5000);
    expect(currentSalary({ salary: 5000 }, { season: 2, bestSeason: 2 })).toBe(5000);
  });

  it('feeds the discounted wage into the payroll', () => {
    const s = { ...newGame(), season: 1, bestSeason: 6 };
    s.drivers[0] = { ...s.drivers[0], salary: 100000, season: 6 };
    expect(totalPayroll(s)).toBeLessThan(100000);
  });
});
