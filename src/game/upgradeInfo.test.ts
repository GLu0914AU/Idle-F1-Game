import { describe, expect, it } from 'vitest';
import { RESEARCH_DEFS, effectiveUpgrades } from './prestige';
import { newGame } from './save';
import { researchInfo, upgradeInfo } from './upgradeInfo';

describe('upgradeInfo', () => {
  it('describes every R&D upgrade with its research level and next cost', () => {
    const s = newGame();
    s.research.topSpeed = 2;
    s.research.funding = 2;
    s.research.seed = 1;
    s.researchPoints = 7;
    const eff = effectiveUpgrades(s);
    for (const d of RESEARCH_DEFS) {
      const info = researchInfo(d.key, s, eff)!;
      expect(info, d.key).not.toBeNull();
      expect(info.stats.join('\n'), d.key).toContain('Next level costs');
    }
    expect(researchInfo('topSpeed', s, eff)!.stats.join('\n')).toContain('Pace on straights');
    expect(researchInfo('funding', s, eff)!.stats.join('\n')).toContain('x1.50');
    expect(researchInfo('engine', s, eff)!.description).toContain('free Engine levels');
    expect(researchInfo('nope', s, eff)).toBeNull();
  });

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
