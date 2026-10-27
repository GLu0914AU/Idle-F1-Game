import { describe, expect, it } from 'vitest';
import { effectiveUpgrades } from './prestige';
import { newGame } from './save';
import { upgradeInfo } from './upgradeInfo';

describe('upgradeInfo', () => {
  it('describes every upgrade with level, rating and its extra effect', () => {
    const s = newGame();
    s.upgrades.pitCrew = 5;
    s.research.pitCrew = 1;
    const info = (k: string) => upgradeInfo(k, { upgrades: s.upgrades, research: s.research, sponsors: 1 }, effectiveUpgrades(s))!;
    expect(info('engine').stats.join('\n')).toContain('No other effect');
    expect(info('tyres').stats.join('\n')).toContain('Tyre wear');
    expect(info('reliability').stats.join('\n')).toContain('Breakdown chance');
    const crew = info('pitCrew').stats.join('\n');
    expect(crew).toContain('Level 10 (5 bought + 5 from R&D)');
    expect(crew).toContain('Pit stop time');
    expect(upgradeInfo('nope', { upgrades: {}, research: {}, sponsors: 1 }, {})).toBeNull();
  });
});
