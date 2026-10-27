import { UPGRADE_DEFS, carRating, formatNumber, incomePerSecond } from './economy';
import { FREE_LEVELS_PER_RESEARCH } from './prestige';
import { paceMultiplier, BREAKDOWN_SECONDS, DNF_SHARE, breakdownChance } from './race';
import { pitDuration, pitIssueChance } from './strategy';

export interface UpgradeInfo {
  title: string;
  description: string;
  stats: string[];
}

interface InfoState {
  upgrades: Record<string, number>;
  research: Record<string, number>;
  sponsors: number;
}

const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

// What an upgrade does, plus its current numbers. `eff` is the total level map (money-bought plus R&D levels).
export function upgradeInfo(key: string, state: InfoState, eff: Record<string, number>): UpgradeInfo | null {
  const def = UPGRADE_DEFS.find((d) => d.key === key);
  if (!def) return null;
  const bought = state.upgrades[key] ?? 0;
  const free = (state.research[key] ?? 0) * FREE_LEVELS_PER_RESEARCH;
  const total = eff[key] ?? bought + free;
  const rating = carRating(eff);
  const stats = [
    `Level ${total} (${bought} bought${free ? ` + ${free} from R&D` : ''})`,
    `Rating from this: +${+(total * def.ratingPerLevel).toFixed(1)} (+${def.ratingPerLevel} per level)`,
    `Car rating: ${Math.round(rating)} (${pct(paceMultiplier(rating) - 1, 1)} pace)`,
  ];
  let description = 'Adds car rating. A higher rating makes the car faster and earns more money per second.';

  if (key === 'tyres') {
    description += ' Also slows tyre wear, so you can stay out longer between stops.';
    stats.push(`Tyre wear: -${pct(1 - 1 / (1 + 0.05 * total), 1)} from this upgrade`);
  } else if (key === 'reliability') {
    description += ' Also lowers the chance of a breakdown during a race. It never reaches zero.';
    stats.push(`Breakdown chance per race: ${pct(breakdownChance(total), 1)}`);
    stats.push(`${pct(DNF_SHARE)} of breakdowns retire the car; the rest cost about ${BREAKDOWN_SECONDS}s at a crawl`);
  } else if (key === 'pitCrew') {
    description += ' Also makes pit stops faster and less likely to go wrong.';
    stats.push(`Pit stop time: ${pitDuration(total).toFixed(1)}s (${pitDuration(0).toFixed(0)}s with no crew)`);
    stats.push(`Chance of a pit problem: ${pct(pitIssueChance(total), 0)}`);
  } else {
    stats.push('No other effect.');
  }
  stats.push(`Income: $${formatNumber(incomePerSecond(rating, state.sponsors))}/s`);
  return { title: def.name, description, stats };
}
