import { describe, expect, it } from 'vitest';
import { CALENDAR } from './tracks';

describe('calendar', () => {
  it('labels every circuit uniquely as country plus city initials', () => {
    const names = CALENDAR.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[A-Za-z ]+ [A-Z]{2,3}$/);
  });
});
