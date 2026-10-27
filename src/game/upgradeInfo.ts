import { UPGRADE_DEFS, carRating, formatNumber, incomePerSecond, handlingBonus, HANDLING_CAP } from './economy';
import { FREE_LEVELS_PER_RESEARCH, FUNDING_BONUS, RESEARCH_DEFS, SEED_MONEY, researchCost } from './prestige';
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

// What an R&D upgrade does, plus its current numbers. `eff` is the total level map (money-bought plus R&D levels).
export function researchInfo(key: string, state: InfoState & { researchPoints: number }, eff: Record<string, number>): UpgradeInfo | null {
  const def = RESEARCH_DEFS.find((d) => d.key === key);
  if (!def) return null;
  const lv = state.research[key] ?? 0;
  const l = eff[key] ?? 0;
  const stats = [`R&D level ${lv}${def.stat ? ` (+${lv * FREE_LEVELS_PER_RESEARCH} stat levels)` : ''}`];
  let description = '';
  switch (key) {
    case 'topSpeed':
      description = 'Makes the car faster on straights. The bonus has diminishing returns, so each level helps a little less.';
      stats.push(`Pace on straights: +${pct(handlingBonus(l), 1)} (max +${pct(HANDLING_CAP)})`);
      break;
    case 'cornering':
      description = 'Makes the car faster through corners. The bonus has diminishing returns, so each level helps a little less.';
      stats.push(`Pace in tight corners: +${pct(handlingBonus(l), 1)} (max +${pct(HANDLING_CAP)})`);
      break;
    case 'tapPower':
      description = 'Makes every tap stronger: more boost on track, and more time taken off a pit stop.';
      stats.push(`Boost per tap: ${pct(0.12 * (1 + 0.1 * l), 1)} of the bar`);
      stats.push(`Pit time saved per tap: ${(1.5 * (1 + 0.1 * l)).toFixed(1)}s`);
      break;
    case 'tyreScience':
      description = 'Tyres wear out more slowly, so you can run longer between stops. Stacks with the Tyres upgrade.';
      stats.push(`Tyre wear: -${pct(1 - 1 / (1 + 0.04 * l), 1)} from this research`);
      break;
    case 'energyRecovery':
      description = 'Tap boost fades more slowly after you stop tapping.';
      stats.push(`Boost lasts ${(1 + 0.1 * l).toFixed(1)}x as long`);
      break;
    case 'funding':
      description = `Raises income per second and race prize money by ${pct(FUNDING_BONUS)} per level. Also applies to offline earnings.`;
      stats.push(`Money multiplier: x${(1 + FUNDING_BONUS * lv).toFixed(2)}`);
      break;
    case 'seed':
      description = `Each time you prestige you start the next run with extra money: $${formatNumber(SEED_MONEY)} per level.`;
      stats.push(`Starting money: $${formatNumber(SEED_MONEY * lv)}`);
      break;
    default: {
      const car = upgradeInfo(key, state, eff);
      if (!car) return null;
      description = `Gives ${FREE_LEVELS_PER_RESEARCH} free ${car.title} levels every run, kept through prestige. ${car.description}`;
      stats.push(...car.stats);
    }
  }
  stats.push(`Next level costs ${researchCost(def, lv)} RP (you have ${state.researchPoints})`);
  return { title: def.name, description, stats };
}

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
