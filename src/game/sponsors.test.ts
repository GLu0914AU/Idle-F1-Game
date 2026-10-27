import { describe, expect, it } from 'vitest';
import { prestige } from './prestige';
import { loadGame, newGame, saveGame } from './save';
import { mulberry32 } from './race';
import {
  MAX_SPONSORS,
  fanMultiplier,
  MEETING_BASE_GEMS,
  MEETING_GEM_STEP,
  marketValue,
  meetingCost,
  openingPitch,
  pitch,
  requestMeeting,
  sponsorIncome,
  walkAway,
} from './sponsors';

const rich = () => {
  const s = newGame();
  s.gems = 1000;
  return s;
};

describe('sponsors', () => {
  it('a meeting costs gems and each signed sponsor makes the next cost more', () => {
    expect(meetingCost(0)).toBe(MEETING_BASE_GEMS);
    expect(meetingCost(3)).toBe(MEETING_BASE_GEMS + 3 * MEETING_GEM_STEP);
    const s = newGame();
    expect(requestMeeting(s)).toBeNull();
    s.gems = MEETING_BASE_GEMS;
    expect(requestMeeting(s, mulberry32(1))).not.toBeNull();
    expect(s.gems).toBe(0);
  });

  it('only one meeting can be open at a time', () => {
    const s = rich();
    requestMeeting(s, mulberry32(1));
    const gems = s.gems;
    expect(requestMeeting(s, mulberry32(2))).toBeNull();
    expect(s.gems).toBe(gems);
  });

  it('the estimate always contains the secret budget', () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = rich();
      s.season = 1 + (seed % 8);
      const m = requestMeeting(s, mulberry32(seed))!;
      expect(m.lo).toBeLessThanOrEqual(m.secret);
      expect(m.hi).toBeGreaterThanOrEqual(m.secret);
      expect(m.lo).toBeGreaterThan(0);
      expect(openingPitch(m)).toBeGreaterThan(0);
    }
  });

  it('budgets scale up with the season', () => {
    expect(marketValue(5)).toBeGreaterThan(marketValue(1));
    const avg = (season: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const s = rich();
        s.season = season;
        sum += requestMeeting(s, mulberry32(seed))!.secret;
      }
      return sum / 50;
    };
    expect(avg(6)).toBeGreaterThan(avg(1) * 3);
  });

  it('pitching at or under the secret signs at the pitched amount', () => {
    const s = rich();
    const m = requestMeeting(s, mulberry32(3))!;
    const result = pitch(s, m.secret);
    expect(result.outcome).toBe('signed');
    expect(s.sponsorList).toEqual([{ name: m.name, amount: m.secret }]);
    expect(s.meeting).toBeNull();
    expect(sponsorIncome(s)).toBe(m.secret);
    s.stats.    racesWon = 400;
    expect(fanMultiplier(s)).toBeCloseTo(2);
    expect(sponsorIncome(s)).toBe(m.secret * 2);
  });

  it('pitching over the secret ends talks with nothing signed', () => {
    const s = rich();
    const m = requestMeeting(s, mulberry32(4))!;
    expect(pitch(s, m.secret + 1).outcome).toBe('failed');
    expect(s.sponsorList).toEqual([]);
    expect(s.meeting).toBeNull();
  });

  it('rejects bad pitches and pitching with no meeting', () => {
    const s = rich();
    expect(pitch(s, 100).outcome).toBe('none');
    requestMeeting(s, mulberry32(5));
    expect(pitch(s, NaN).outcome).toBe('none');
    expect(pitch(s, -5).outcome).toBe('none');
    expect(s.meeting).not.toBeNull();
  });

  it('walking away ends the meeting without refunding gems', () => {
    const s = rich();
    requestMeeting(s, mulberry32(6));
    const gems = s.gems;
    walkAway(s);
    expect(s.meeting).toBeNull();
    expect(s.gems).toBe(gems);
  });

  it('avoids repeating a signed sponsor name', () => {
    const s = rich();
    const names = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const m = requestMeeting(s, mulberry32(i + 10))!;
      pitch(s, 1);
      names.add(m.name);
    }
    expect(names.size).toBe(10);
  });

  it('sponsors survive prestige, and sponsors plus an open meeting survive a save', () => {
    const s = rich();
    requestMeeting(s, mulberry32(7));
    pitch(s, 1);
    requestMeeting(s, mulberry32(8));
    const store = new Map<string, string>();
    const mem = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    saveGame(s, mem);
    const loaded = loadGame(mem);
    expect(loaded.sponsorList).toHaveLength(1);
    expect(loaded.meeting).toEqual(s.meeting);
    loaded.season = 5;
    prestige(loaded);
    expect(loaded.sponsorList).toHaveLength(1);
  });

  it('keeps at most 15 sponsors, dropping the lowest payer for a new signing', () => {
    const s = rich();
    for (let i = 0; i < MAX_SPONSORS; i++) {
      expect(requestMeeting(s, mulberry32(i))).not.toBeNull();
      pitch(s, 1);
    }
    expect(s.sponsorList).toHaveLength(MAX_SPONSORS);
    s.sponsorList[4].amount = 0.5;
    const lowest = s.sponsorList[4].name;
    expect(requestMeeting(s, mulberry32(99))).not.toBeNull();
    const result = pitch(s, 1);
    expect(s.sponsorList).toHaveLength(MAX_SPONSORS);
    expect(result.outcome === 'signed' && result.replaced?.name).toBe(lowest);
    expect(s.sponsorList.some((x) => x.name === lowest && x.amount === 0.5)).toBe(false);
  });
});
