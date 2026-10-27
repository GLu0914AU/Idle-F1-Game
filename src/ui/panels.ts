import Phaser from 'phaser';
import { AUTO_PRICE_LABEL, purchaseAutoUnlock, showRewardedAd } from '../game/monetization';
import { GameState } from '../game/save';
import { MIN_PRESTIGE_SEASON, RESEARCH_DEFS, ResearchDef, buyResearch, researchCost, researchPointsFor } from '../game/prestige';
import { openingPitch, meetingCost, pitch, requestMeeting, sponsorIncome, walkAway } from '../game/sponsors';
import {
  DRIVER_MEETING_CLOUT,
  DriverStats,
  MAX_TRAIT,
  Driver,
  endDriverMeeting,
  offerContract,
  openingOffer,
  requestDriverMeeting,
} from '../game/drivers';
import { formatNumber } from '../game/economy';
import {
  ENGINEER_MEETING_CLOUT,
  Engineer,
  EngineerStats,
  endEngineerMeeting,
  offerEngineerContract,
  requestEngineerMeeting,
} from '../game/engineers';
import { PLAYER_COLOR } from '../game/teams';
import {
  STAFF_DEFS,
  STAFF_MEETING_CLOUT,
  STAFF_ROLES,
  StaffCandidate,
  StaffRole,
  endStaffMeeting,
  offerStaffContract,
  requestStaffMeeting,
} from '../game/staff';
import { DEV_PACKAGES, DevPackage, DevOutcome, developmentCost, developmentOdds, fitsSeason, packageDef, startDevelopment, teamQuality } from '../game/development';
import { RACES_PER_SEASON } from '../game/season';
import {
  ACHIEVEMENTS,
  AchievementDef,
  achievementClaimed,
  achievementReady,
  achievementValue,
  canClaimBonus,
  claimAchievement,
  claimDaily,
  claimDailyBonus,
  dailyBonusReward,
  dailyDef,
  dailyDone,
  ensureToday,
  msUntilReset,
  recordEvent,
  rewardLabel,
  streakCount,
} from '../game/goals';
import { FANS_PER_WIN, FanCurrency, canRunFanEvent, fanChance, fansFor, runFanEvent } from '../game/career';
import { Button, COLORS, W, addBox, addButton, addText } from './widgets';

export const TABS = ['Race', 'Team', 'Sponsors', 'Prestige', 'Shop'] as const;
const TEAM_COLORS = [0xffd400, 0xff7a1a, 0xe10600, 0xff4fa3, 0xb48cff, 0x2f6bff, 0x4de3ff, 0x14b87a, 0xffffff, 0x9aa0b5];
const STAT_LABELS = ['RACES WON', "DRIVERS' TITLES", "CONSTRUCTORS' TITLES"];
type TabName = (typeof TABS)[number];
type AutoKey = 'autoBuy' | 'autoTap';

const driverLines = (d: DriverStats) => [
  `Skill: +${d.skill}% car rating`,
  `Tyre management: ${d.tyreMgmt}/${MAX_TRAIT}`,
  `Consistency: ${d.consistency}/${MAX_TRAIT}`,
  `Race craft: ${d.raceCraft}/${MAX_TRAIT}`,
];

const engineerLines = (e: EngineerStats) => [
  `Pit calls: right ${e.pit}% of the time`,
  `Tyre choice: right ${e.tyre}% of the time`,
  `Push / conserve: right ${e.mode}% of the time`,
];

const describeDriver = (d: Driver) =>
  `Skill +${d.skill}% · Tyres ${d.tyreMgmt} · Consistency ${d.consistency} · Race craft ${d.raceCraft} · ${d.salary > 0 ? `$${formatNumber(d.salary)}/race` : 'no wage'}`;

const DEV_OUTCOME_LABEL: Record<DevOutcome, string> = { big: 'a breakthrough!', solid: 'a solid gain', flop: 'a flop' };
const oddsHint = (p: number) => (p < 0.1 ? 'rare' : p < 0.2 ? 'unlikely' : p < 0.35 ? 'possible' : p < 0.55 ? 'likely' : 'very likely');

const describeEngineer = (e: Engineer | null) =>
  e ? `Pit ${e.pit}% · Tyres ${e.tyre}% · Mode ${e.mode}% · $${formatNumber(e.salary)}/race` : 'No engineer: you call strategy by hand';

export const GEM_BOOST_COST = 10;
export const BOOST_SECONDS = 60;
export const GEM_BOOST_SECONDS = 300;

const GOAL_BAR_W = 330;
const ACH_ROWS = 7;

interface GoalRow {
  parts: Phaser.GameObjects.GameObject[];
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  value: Phaser.GameObjects.Text;
  btn: Button;
  onClaim: () => void;
}

export interface PanelHooks {
  rename(): void;
  // The team colour changed, so cars and the strategy strip need recolouring.
  recolour(): void;
  incomePerSecond(): number;
  prestige(): void;
  // Persist right away so a reload can't undo a spend or an outcome.
  save(): void;
  // Research changes the car's rating, so the live race needs refreshing.
  onResearch(): void;
  // A driver was signed, so the live race needs their name, rating and traits.
  onDriversChanged(): void;
  onInfo(key: string): void;
}

// Full-screen panels shown over the race view for every tab except Race.
export class PanelHost {
  private panels = new Map<TabName, Phaser.GameObjects.Container>();
  private current: TabName = 'Race';
  private sponsorMessage = '';
  private sponsorMessageGood = false;
  private pitchAmount = 0;
  private pitchFor: GameState['meeting'] = null;
  private sponsors!: {
    info: Phaser.GameObjects.Text;
    meet: Button;
    name: Phaser.GameObjects.Text;
    estimate: Phaser.GameObjects.Text;
    amount: Phaser.GameObjects.Text;
    caption: Phaser.GameObjects.Text;
    stepBtns: Button[];
    pitchBtn: Button;
    walkBtn: Button;
    idle: Phaser.GameObjects.Text;
    total: Phaser.GameObjects.Text;
    rows: { name: Phaser.GameObjects.Text; amount: Phaser.GameObjects.Text }[];
  };
  private teamName!: Phaser.GameObjects.Text;
  private recruitOpen = false;
  private driverMessage = '';
  private driverMessageGood = false;
  private driverOffer = 0;
  private offerFor: GameState['driverMeeting'] = null;
  private recruit!: {
    box: Phaser.GameObjects.Container;
    info: Phaser.GameObjects.Text;
    meet: Button;
    name: Phaser.GameObjects.Text;
    estimate: Phaser.GameObjects.Text;
    traits: Phaser.GameObjects.Text;
    amount: Phaser.GameObjects.Text;
    caption: Phaser.GameObjects.Text;
    stepBtns: Button[];
    sign: Button[];
    walkBtn: Button;
    idle: Phaser.GameObjects.Text;
    current: Phaser.GameObjects.Text[];
  };
  private fanMessage = '';
  private engineerOpen = false;
  private engineerMessage = '';
  private engineerMessageGood = false;
  private engineerOffer = 0;
  private engineerOfferFor: GameState['engineerMeeting'] = null;
  private engineerRecruit!: {
    box: Phaser.GameObjects.Container;
    info: Phaser.GameObjects.Text;
    meet: Button;
    name: Phaser.GameObjects.Text;
    estimate: Phaser.GameObjects.Text;
    traits: Phaser.GameObjects.Text;
    amount: Phaser.GameObjects.Text;
    caption: Phaser.GameObjects.Text;
    stepBtns: Button[];
    sign: Button;
    walkBtn: Button;
    idle: Phaser.GameObjects.Text;
    current: Phaser.GameObjects.Text;
  };
  private developmentOpen = false;
  private goalsOpen = false;
  private goalsTab: 'daily' | 'achievements' = 'daily';
  private goalsPage = 0;
  private goalsUi!: {
    box: Phaser.GameObjects.Container;
    dailyTab: Button;
    achTab: Button;
    info: Phaser.GameObjects.Text;
    rows: GoalRow[];
    prev: Button;
    next: Button;
    page: Phaser.GameObjects.Text;
  };
  private staffOpen = false;
  private staffRole: StaffRole = 'tyre';
  private staffMessage = '';
  private staffMessageGood = false;
  private staffOffer = 0;
  private staffOfferFor: StaffCandidate | null = null;
  private staffUi!: {
    box: Phaser.GameObjects.Container;
    tabs: Button[];
    info: Phaser.GameObjects.Text;
    meet: Button;
    name: Phaser.GameObjects.Text;
    estimate: Phaser.GameObjects.Text;
    traits: Phaser.GameObjects.Text;
    amount: Phaser.GameObjects.Text;
    caption: Phaser.GameObjects.Text;
    stepBtns: Button[];
    sign: Button;
    walkBtn: Button;
    idle: Phaser.GameObjects.Text;
    currentTitle: Phaser.GameObjects.Text;
    current: Phaser.GameObjects.Text;
  };
  private developmentUi!: {
    box: Phaser.GameObjects.Container;
    info: Phaser.GameObjects.Text;
    status: Phaser.GameObjects.Text;
    rows: { def: DevPackage; odds: Phaser.GameObjects.Text; button: Button }[];
  };
  private team!: {
    swatches: { sw: Phaser.GameObjects.Rectangle; color: number }[];
    driverRows: { name: Phaser.GameObjects.Text; chip: Phaser.GameObjects.Rectangle; detail: Phaser.GameObjects.Text }[];
    recruitBtn: Button;
    engineerRow: { name: Phaser.GameObjects.Text; chip: Phaser.GameObjects.Rectangle; detail: Phaser.GameObjects.Text };
    engineerBtn: Button;
    developmentBtn: Button;
    staffBtn: Button;
    stats: Phaser.GameObjects.Text[];
    fans: Phaser.GameObjects.Text;
    fanInfo: Phaser.GameObjects.Text;
    fanButton: Button;
    fanResult: Phaser.GameObjects.Text;
  };
  private prestige!: {
    info: Phaser.GameObjects.Text;
    button: Button;
    rows: { def: ResearchDef; level: Phaser.GameObjects.Text; button: Button }[];
    auto: Button;
  };
  private prestigeArmedUntil = 0;
  private shop!: {
    gems: Phaser.GameObjects.Text;
    unlock: Button;
    toggles: { key: AutoKey; button: Button; name: string }[];
    gemBoost: Button;
  };

  constructor(
    private scene: Phaser.Scene,
    private state: () => GameState,
    private hooks: PanelHooks,
  ) {
    this.buildSponsors();
    this.buildTeam();
    this.buildPrestige();
    this.buildShop();
    this.buildGoals();
    this.show('Race');
  }

  show(tab: TabName) {
    const changed = tab !== this.current;
    this.current = tab;
    if (changed) {
      this.recruitOpen = false;
      this.engineerOpen = false;
      this.developmentOpen = false;
      this.staffOpen = false;
      this.goalsOpen = false;
    }
    this.goalsUi?.box.setVisible(this.goalsOpen && tab === 'Race');
    this.recruit?.box.setVisible(this.recruitOpen && tab === 'Team');
    this.engineerRecruit?.box.setVisible(this.engineerOpen && tab === 'Team');
    this.developmentUi?.box.setVisible(this.developmentOpen && tab === 'Team');
    this.staffUi?.box.setVisible(this.staffOpen && tab === 'Team');
    for (const [name, c] of this.panels) {
      c.setVisible(name === tab);
      if (name === tab && changed) {
        this.scene.tweens.killTweensOf(c);
        c.setAlpha(0).setY(14);
        this.scene.tweens.add({ targets: c, alpha: 1, y: 0, duration: 180, ease: 'Cubic.easeOut' });
      }
    }
  }

  private panel(name: TabName, title: string) {
    const c = this.scene.add.container(0, 0).setVisible(false);
    // Blocks taps from reaching the race view underneath.
    c.add(addBox(this.scene, 0, 70, W, 810, COLORS.bg).setInteractive());
    c.add(this.scene.add.rectangle(W / 2, 84, 120, 3, COLORS.red));
    c.add(addText(this.scene, W / 2, 90, title.toUpperCase(), 24).setOrigin(0.5, 0));
    this.panels.set(name, c);
    return c;
  }

  private buildSponsors() {
    const c = this.panel('Sponsors', 'Sponsors');
    const info = addText(this.scene, W / 2, 124, '', 14, '#9aa7d0', c)
      .setOrigin(0.5, 0)
      .setWordWrapWidth(W - 60)
      .setAlign('center');
    const meet = addButton(
      this.scene,
      30,
      170,
      W - 60,
      44,
      '',
      () => {
        if (requestMeeting(this.state())) {
          this.sponsorMessage = '';
          this.hooks.save();
        }
      },
      { fill: COLORS.green, size: 16, parent: c },
    );

    // Negotiation card: only the visible part depends on whether a meeting is open.
    addBox(this.scene, 20, 226, W - 40, 250, COLORS.panel, c);
    const name = addText(this.scene, W / 2, 238, '', 22, '#ffd400', c).setOrigin(0.5, 0);
    const estimate = addText(this.scene, W / 2, 274, '', 14, '#9aa7d0', c).setOrigin(0.5, 0);
    const amount = addText(this.scene, W / 2, 306, '', 30, '#ffffff', c).setOrigin(0.5, 0);
    const caption = addText(this.scene, W / 2, 346, 'per season, paid at the start of each season', 12, '#9aa7d0', c).setOrigin(0.5, 0);
    const steps: [string, number][] = [['-25%', 0.75], ['-5%', 0.95], ['+5%', 1.05], ['+25%', 1.25]];
    const stepBtns = steps.map(([label, mult], i) =>
      addButton(
        this.scene,
        34 + i * 118,
        374,
        108,
        38,
        label,
        () => {
          this.pitchAmount = Math.max(1, Math.round(this.pitchAmount * mult));
        },
        { size: 16, parent: c },
      ),
    );
    const pitchBtn = addButton(
      this.scene,
      34,
      422,
      280,
      42,
      'PITCH THIS AMOUNT',
      () => {
        const s = this.state();
        const m = s.meeting;
        if (!m) return;
        const result = pitch(s, this.pitchAmount);
        this.sponsorMessage =
          result.outcome === 'signed'
            ? `Deal! ${result.sponsor.name} will pay $${formatNumber(result.sponsor.amount)} every season.`
            : `${m.name} walked out. Negotiations fell apart.`;
        this.sponsorMessageGood = result.outcome === 'signed';
        this.hooks.save();
      },
      { fill: COLORS.green, size: 16, parent: c },
    );
    const walkBtn = addButton(
      this.scene,
      326,
      422,
      180,
      42,
      'WALK AWAY',
      () => {
        const s = this.state();
        if (!s.meeting) return;
        this.sponsorMessage = `You ended talks with ${s.meeting.name}.`;
        this.sponsorMessageGood = false;
        walkAway(s);
        this.hooks.save();
      },
      { size: 16, parent: c },
    );
    const idle = addText(this.scene, W / 2, 300, '', 15, '#9aa7d0', c)
      .setOrigin(0.5, 0)
      .setWordWrapWidth(W - 90)
      .setAlign('center');

    addText(this.scene, 30, 490, 'Signed sponsors', 16, '#ffffff', c);
    const total = addText(this.scene, W - 30, 492, '', 14, '#14b87a', c).setOrigin(1, 0);
    const rows = Array.from({ length: 10 }, (_, i) => ({
      name: addText(this.scene, 36, 522 + i * 26, '', 15, '#cfd6ee', c),
      amount: addText(this.scene, W - 36, 522 + i * 26, '', 15, '#cfd6ee', c).setOrigin(1, 0),
    }));
    this.sponsors = { info, meet, name, estimate, amount, caption, stepBtns, pitchBtn, walkBtn, idle, total, rows };
  }

  private renderSponsors(s: GameState) {
    const p = this.sponsors;
    const cost = meetingCost(s.sponsorList.length);
    p.info.setText(`Gems: ${s.gems} · Sponsors pay you at the start of each new season. Pitch too high and they walk away.`);
    p.meet.setLabel(s.meeting ? 'MEETING IN PROGRESS' : `MEET A SPONSOR: ${cost} GEMS`);
    p.meet.setState(!s.meeting && s.gems >= cost, COLORS.green);

    const m = s.meeting;
    if (m !== this.pitchFor) {
      this.pitchFor = m;
      if (m) this.pitchAmount = openingPitch(m);
    }
    for (const b of [p.name, p.estimate, p.amount, p.caption, ...p.stepBtns.flatMap((x) => [x.rect, x.label]), p.pitchBtn.rect, p.pitchBtn.label, p.walkBtn.rect, p.walkBtn.label]) {
      b.setVisible(!!m);
    }
    p.idle.setVisible(!m);
    if (m) {
      p.name.setText(m.name);
      p.estimate.setText(`They seem to have $${formatNumber(m.lo)} to $${formatNumber(m.hi)} to spend`);
      p.amount.setText(`$${formatNumber(this.pitchAmount)}`);
      p.pitchBtn.setLabel(`PITCH $${formatNumber(this.pitchAmount)}`);
    } else {
      p.idle.setText(this.sponsorMessage || 'Spend gems to book a meeting with a sponsor. Each one has a hidden budget: pitch under it and they sign, over it and talks collapse. Each sponsor you sign makes the next meeting cost more.');
      p.idle.setColor(this.sponsorMessage ? (this.sponsorMessageGood ? '#14b87a' : '#e08a1f') : '#9aa7d0');
    }

    p.total.setText(s.sponsorList.length ? `$${formatNumber(sponsorIncome(s))} / season` : '');
    const shown = [...s.sponsorList].reverse();
    p.rows.forEach((row, i) => {
      const sp = shown[i];
      const more = i === p.rows.length - 1 && shown.length > p.rows.length;
      row.name.setText(more ? `+ ${shown.length - i} more` : (sp?.name ?? (i === 0 ? 'None yet' : '')));
      row.amount.setText(!more && sp ? `$${formatNumber(sp.amount)}` : '');
    });
  }

  private buildTeam() {
    const c = this.panel('Team', 'Team');
    const section = (y: number, label: string) => addText(this.scene, 30, y, label.toUpperCase(), 14, '#9aa7d0', c);
    this.teamName = addText(this.scene, W / 2, 124, '', 22, '#ffd400', c).setOrigin(0.5, 0);
    addButton(this.scene, W / 2 - 80, 154, 160, 30, 'RENAME TEAM', () => this.hooks.rename(), { parent: c, size: 14 });

    section(196, 'Team colour');
    const swatches = TEAM_COLORS.map((color, i) => {
      const sw = addBox(this.scene, 30 + i * 48, 218, 40, 28, color, c).setInteractive({ useHandCursor: true });
      sw.on('pointerdown', () => {
        this.state().teamColor = color;
        this.hooks.recolour();
        this.hooks.save();
      });
      return { sw, color };
    });

    section(256, 'Drivers');
    const rowBox = (y: number, name: string) => {
      addBox(this.scene, 30, y, W - 60, 48, COLORS.panel, c);
      const chip = addBox(this.scene, 30, y, 8, 48, PLAYER_COLOR, c).setStrokeStyle(0);
      return {
        name: addText(this.scene, 52, y + 4, name, 19, '#ffffff', c),
        chip,
        detail: addText(this.scene, 52, y + 28, '', 12, '#9aa7d0', c),
      };
    };
    const driverRows = [0, 1].map((i) => rowBox(276 + i * 52, ''));
    const recruitBtn = addButton(this.scene, 30, 382, W - 60, 32, 'RECRUIT A DRIVER', () => this.openRecruit(true), { parent: c, size: 15, fill: COLORS.green });

    section(422, 'Race engineer');
    const engineerRow = rowBox(442, '');
    const engineerBtn = addButton(this.scene, 30, 496, W - 60, 32, 'RECRUIT A RACE ENGINEER', () => this.openEngineer(true), { parent: c, size: 15, fill: COLORS.green });

    section(538, 'Car development & staff');
    const half = (W - 68) / 2;
    const developmentBtn = addButton(this.scene, 30, 558, half, 32, 'CAR DEVELOPMENT', () => this.openDevelopment(true), { parent: c, size: 13, fill: COLORS.green });
    const staffBtn = addButton(this.scene, 38 + half, 558, half, 32, 'SPECIALIST STAFF', () => this.openStaff(true), { parent: c, size: 13, fill: COLORS.green });

    section(600, 'Career');
    const stats = STAT_LABELS.map((label, i) => {
      const x = 30 + i * 156;
      addBox(this.scene, x, 620, 144, 56, COLORS.panel, c);
      const value = addText(this.scene, x + 72, 624, '', 26, '#ffc933', c).setOrigin(0.5, 0);
      addText(this.scene, x + 72, 656, label, 12, '#9aa7d0', c).setOrigin(0.5, 0);
      return value;
    });

    section(684, 'Fans');
    addBox(this.scene, 30, 704, W - 60, 140, COLORS.panel, c);
    addBox(this.scene, 30, 704, 5, 140, COLORS.red, c).setStrokeStyle(0);
    const fans = addText(this.scene, 52, 708, '', 26, '#ffffff', c);
    const fanInfo = addText(this.scene, 52, 740, '', 11, '#9aa7d0', c).setWordWrapWidth(W - 120);
    const fanButton = addButton(this.scene, 52, 800, W - 104, 36, '', () => this.runFanEvent(), { parent: c, size: 16, fill: COLORS.green });
    const fanResult = addText(this.scene, W / 2, 848, '', 14, '#ffc933', c).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 80);
    this.team = { swatches, driverRows, recruitBtn, engineerRow,     engineerBtn, developmentBtn, staffBtn, stats, fans, fanInfo, fanButton, fanResult };
    this.buildRecruit();
    this.buildEngineerRecruit();
    this.buildDevelopment();
        this.buildStaff();
      }

      private openStaff(open: boolean) {
        this.staffOpen = open;
        this.staffUi.box.setVisible(open && this.current === 'Team');
      }

      private buildStaff() {
        const c = this.scene.add.container(0, 0).setVisible(false);
        c.add(addBox(this.scene, 0, 70, W, 810, COLORS.bg).setInteractive());
        c.add(this.scene.add.rectangle(W / 2, 84, 120, 3, COLORS.red));
        c.add(addText(this.scene, W / 2, 90, 'SPECIALIST STAFF', 24).setOrigin(0.5, 0));
        const tabW = (W - 68) / 3;
        const tabs = STAFF_ROLES.map((role, i) =>
          addButton(this.scene, 30 + i * (tabW + 4), 124, tabW, 32, STAFF_DEFS[role].title.replace(' engineer', '').replace(' specialist', '').toUpperCase(), () => {
            this.staffRole = role;
          }, { size: 12, parent: c }),
        );
        const info = addText(this.scene, W / 2, 164, '', 13, '#9aa7d0', c).setOrigin(0.5, 0).setWordWrapWidth(W - 60).setAlign('center');
        const meet = addButton(this.scene, 30, 214, W - 60, 40, '', () => {
          if (requestStaffMeeting(this.state(), this.staffRole)) {
            this.staffMessage = '';
            this.hooks.save();
          }
        }, { fill: COLORS.green, size: 15, parent: c });

        addBox(this.scene, 20, 262, W - 40, 350, COLORS.panel, c);
        const name = addText(this.scene, W / 2, 272, '', 22, '#ffd400', c).setOrigin(0.5, 0);
        const estimate = addText(this.scene, W / 2, 304, '', 14, '#9aa7d0', c).setOrigin(0.5, 0);
        const traits = addText(this.scene, W / 2, 334, '', 14, '#cfd6ee', c).setOrigin(0.5, 0).setAlign('center').setLineSpacing(4).setWordWrapWidth(W - 70);
        const amount = addText(this.scene, W / 2, 414, '', 30, '#ffffff', c).setOrigin(0.5, 0);
        const caption = addText(this.scene, W / 2, 452, 'per race, paid after every race', 12, '#9aa7d0', c).setOrigin(0.5, 0);
        const steps: [string, number][] = [['-25%', 0.75], ['-5%', 0.95], ['+5%', 1.05], ['+25%', 1.25]];
        const stepBtns = steps.map(([label, mult], i) =>
          addButton(this.scene, 34 + i * 118, 478, 108, 36, label, () => {
            this.staffOffer = Math.max(1, Math.round(this.staffOffer * mult));
          }, { size: 16, parent: c }),
        );
        const sign = addButton(this.scene, 34, 524, W - 68, 40, '', () => {
          const s = this.state();
          const role = this.staffRole;
          const m = s.staffMeetings[role];
          if (!m) return;
          const result = offerStaffContract(s, role, this.staffOffer);
          this.staffMessage =
            result.outcome === 'signed'
              ? `${result.name} signed for $${formatNumber(this.staffOffer)} a race${result.replaced ? `, replacing ${result.replaced}` : ''}.`
              : `${m.name} turned the offer down and left.`;
          this.staffMessageGood = result.outcome === 'signed';
          this.hooks.save();
        }, { fill: COLORS.green, size: 14, parent: c });
        const walkBtn = addButton(this.scene, 34, 572, W - 68, 30, 'WALK AWAY', () => {
          const s = this.state();
          const m = s.staffMeetings[this.staffRole];
          if (!m) return;
          this.staffMessage = `You ended talks with ${m.name}.`;
          this.staffMessageGood = false;
          endStaffMeeting(s, this.staffRole);
          this.hooks.save();
        }, { size: 14, parent: c });
        const idle = addText(this.scene, W / 2, 340, '', 15, '#9aa7d0', c).setOrigin(0.5, 0).setWordWrapWidth(W - 90).setAlign('center');

        const currentTitle = addText(this.scene, 30, 628, '', 16, '#ffffff', c);
        const current = addText(this.scene, 36, 656, '', 13, '#cfd6ee', c).setWordWrapWidth(W - 72).setLineSpacing(4);
        addButton(this.scene, 30, 800, W - 60, 44, 'BACK TO TEAM', () => this.openStaff(false), { size: 16, parent: c });
        this.staffUi = { box: c, tabs, info, meet, name, estimate, traits, amount, caption, stepBtns, sign, walkBtn, idle, currentTitle, current };
      }

      private renderStaff(s: GameState) {
        const r = this.staffUi;
        const role = this.staffRole;
        const def = STAFF_DEFS[role];
        r.tabs.forEach((b, i) => b.setState(true, STAFF_ROLES[i] === role ? COLORS.green : COLORS.panel));
        r.info.setText(`Clout: ${s.clout} · ${def.blurb} Paid every race; unpaid staff quit.`);
        const m = s.staffMeetings[role];
        r.meet.setLabel(m ? 'NEGOTIATION IN PROGRESS' : `MEET A ${def.title.toUpperCase()}: ${STAFF_MEETING_CLOUT} CLOUT`);
        r.meet.setState(!m && s.clout >= STAFF_MEETING_CLOUT, COLORS.green);
        if (m !== this.staffOfferFor) {
          this.staffOfferFor = m;
          if (m) this.staffOffer = openingOffer(m);
        }
        for (const b of [r.name, r.estimate, r.traits, r.amount, r.caption, ...r.stepBtns.flatMap((x) => [x.rect, x.label]), r.sign.rect, r.sign.label, r.walkBtn.rect, r.walkBtn.label]) {
          b.setVisible(!!m);
        }
        r.idle.setVisible(!m);
        const holder = s.staff[role];
        if (m) {
          r.name.setText(m.name);
          r.estimate.setText(`They want roughly $${formatNumber(m.lo)} to $${formatNumber(m.hi)} a race`);
          r.traits.setText(def.lines(m.stats).join('\n'));
          r.amount.setText(`$${formatNumber(this.staffOffer)}`);
          r.sign.setLabel(holder ? `SIGN, REPLACING ${holder.name.toUpperCase()}` : `SIGN AS ${def.title.toUpperCase()}`);
        } else {
          r.idle.setText(this.staffMessage || `Spend clout to meet a ${def.title.toLowerCase()}. Each has a hidden minimum wage: offer at least that and they sign, offer less and they walk.`);
          r.idle.setColor(this.staffMessage ? (this.staffMessageGood ? '#14b87a' : '#e08a1f') : '#9aa7d0');
        }
        r.currentTitle.setText(`Current ${def.title.toLowerCase()}`);
        r.current.setText(holder ? `${holder.name}\n${def.lines(holder.stats).join('\n')}\n$${formatNumber(holder.salary)}/race` : `No ${def.title.toLowerCase()} hired`);
      }

  openGoals(open: boolean) {
    this.goalsOpen = open;
    if (open) this.goalsPage = 0;
    this.goalsUi.box.setVisible(open && this.current === 'Race');
  }

  private buildGoals() {
    const c = this.scene.add.container(0, 0).setVisible(false);
    c.add(addBox(this.scene, 0, 70, W, 810, COLORS.bg).setInteractive());
    c.add(this.scene.add.rectangle(W / 2, 84, 120, 3, COLORS.red));
    c.add(addText(this.scene, W / 2, 90, 'GOALS', 24).setOrigin(0.5, 0));
    const dailyTab = addButton(this.scene, 30, 124, (W - 64) / 2, 32, 'DAILY', () => {
      this.goalsTab = 'daily';
    }, { size: 14, parent: c });
    const achTab = addButton(this.scene, 34 + (W - 64) / 2, 124, (W - 64) / 2, 32, 'ACHIEVEMENTS', () => {
      this.goalsTab = 'achievements';
      this.goalsPage = 0;
    }, { size: 14, parent: c });
    const info = addText(this.scene, W / 2, 164, '', 13, '#9aa7d0', c).setOrigin(0.5, 0).setWordWrapWidth(W - 60).setAlign('center');
    const rows: GoalRow[] = [];
    for (let i = 0; i < ACH_ROWS; i++) {
      const y = 196 + i * 80;
      const row = {} as GoalRow;
      row.onClaim = () => undefined;
      const box = addBox(this.scene, 20, y, W - 40, 72, COLORS.panel, c);
      row.name = addText(this.scene, 32, y + 6, '', 16, '#ffffff', c);
      row.desc = addText(this.scene, 32, y + 28, '', 12, '#9aa7d0', c).setWordWrapWidth(W - 180);
      const track = this.scene.add.rectangle(32, y + 54, GOAL_BAR_W, 8, COLORS.bg).setOrigin(0, 0.5);
      row.bar = this.scene.add.rectangle(32, y + 54, GOAL_BAR_W, 8, COLORS.green).setOrigin(0, 0.5);
      c.add([track, row.bar]);
      row.value = addText(this.scene, 32 + GOAL_BAR_W + 8, y + 48, '', 12, '#cfd6ee', c);
      row.btn = addButton(this.scene, W - 124, y + 14, 92, 40, 'CLAIM', () => row.onClaim(), { fill: COLORS.green, size: 14, parent: c });
      row.parts = [box, row.name, row.desc, track, row.bar, row.value, row.btn.rect, row.btn.label];
      rows.push(row);
    }
    const prev = addButton(this.scene, 30, 764, 120, 34, 'PREV', () => {
      this.goalsPage = Math.max(0, this.goalsPage - 1);
    }, { size: 14, parent: c });
    const next = addButton(this.scene, W - 150, 764, 120, 34, 'NEXT', () => {
      this.goalsPage += 1;
    }, { size: 14, parent: c });
    const page = addText(this.scene, W / 2, 772, '', 14, '#cfd6ee', c).setOrigin(0.5, 0);
    addButton(this.scene, 30, 812, W - 60, 44, 'BACK TO RACE', () => this.openGoals(false), { size: 16, parent: c });
    this.goalsUi = { box: c, dailyTab, achTab, info, rows, prev, next, page };
  }

  private setGoalRow(
    row: GoalRow | undefined,
    d: { name: string; desc: string; frac: number; value: string; claimed: boolean; ready: boolean; onClaim: () => void } | null,
  ) {
    if (!row) return;
    for (const p of row.parts) (p as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(!!d);
    if (!d) return;
    row.name.setText(d.name);
    row.desc.setText(d.desc);
    row.bar.setSize(Math.max(1, GOAL_BAR_W * Math.min(1, d.frac)), 8);
    row.bar.setFillStyle(d.claimed ? COLORS.border : COLORS.green);
    row.value.setText(d.value);
    row.btn.setLabel(d.claimed ? 'CLAIMED' : 'CLAIM');
    row.btn.setState(d.ready && !d.claimed, COLORS.green);
    row.onClaim = d.onClaim;
  }

  private renderGoals(s: GameState) {
    const r = this.goalsUi;
    const now = new Date();
    ensureToday(s, now);
    const daily = this.goalsTab === 'daily';
    r.dailyTab.setState(true, daily ? COLORS.green : COLORS.panel);
    r.achTab.setState(true, daily ? COLORS.panel : COLORS.green);
    const save = () => this.hooks.save();
    if (daily) {
      const mins = Math.ceil(msUntilReset(now) / 60000);
      const streak = streakCount(s, now);
      r.info.setText(`Daily streak: ${streak} day${streak === 1 ? '' : 's'} · New goals in ${Math.floor(mins / 60)}h ${mins % 60}m`);
      r.rows.forEach((row, i) => {
        const g = s.goals.daily.goals[i];
        const def = g && dailyDef(g.id);
        if (i < s.goals.daily.goals.length && g && def) {
          this.setGoalRow(row, {
            name: def.label,
            desc: `Reward: ${rewardLabel(def.reward)}`,
            frac: g.progress / def.target,
            value: `${Math.min(g.progress, def.target)}/${def.target}`,
            claimed: g.claimed,
            ready: dailyDone(g),
            onClaim: () => {
              if (claimDaily(s, i, now)) save();
            },
          });
        } else if (i === s.goals.daily.goals.length) {
          const done = s.goals.daily.goals.filter((x) => x.claimed).length;
          this.setGoalRow(row, {
            name: 'Daily bonus',
            desc: `Claim every goal today · Reward: ${rewardLabel(dailyBonusReward(s, now))}`,
            frac: done / Math.max(1, s.goals.daily.goals.length),
            value: `${done}/${s.goals.daily.goals.length}`,
            claimed: s.goals.daily.bonusClaimed,
            ready: canClaimBonus(s),
            onClaim: () => {
              if (claimDailyBonus(s, now)) save();
            },
          });
        } else {
          this.setGoalRow(row, null);
        }
      });
      for (const b of [r.prev, r.next]) for (const p of [b.rect, b.label]) p.setVisible(false);
      r.page.setVisible(false);
      return;
    }
    const order = (a: AchievementDef) => (achievementReady(s, a) ? 0 : achievementClaimed(s, a) ? 2 : 1);
    const list = [...ACHIEVEMENTS].sort((a, b) => order(a) - order(b));
    const pages = Math.max(1, Math.ceil(list.length / ACH_ROWS));
    this.goalsPage = Math.min(this.goalsPage, pages - 1);
    const claimedCount = list.filter((a) => achievementClaimed(s, a)).length;
    r.info.setText(`${claimedCount}/${list.length} achievements collected`);
    r.rows.forEach((row, i) => {
      const a = list[this.goalsPage * ACH_ROWS + i];
      this.setGoalRow(
        row,
        a
          ? {
              name: a.name,
              desc: `${a.desc} · ${rewardLabel(a.reward)}`,
              frac: achievementValue(s, a) / a.target,
              value: `${achievementValue(s, a)}/${a.target}`,
              claimed: achievementClaimed(s, a),
              ready: achievementReady(s, a),
              onClaim: () => {
                if (claimAchievement(s, a.id)) save();
              },
            }
          : null,
      );
    });
    for (const b of [r.prev, r.next]) for (const p of [b.rect, b.label]) p.setVisible(true);
    r.page.setVisible(true).setText(`${this.goalsPage + 1} / ${pages}`);
    r.prev.setState(this.goalsPage > 0, COLORS.accent);
    r.next.setState(this.goalsPage < pages - 1, COLORS.accent);
  }

  private openRecruit(open: boolean) {
    this.recruitOpen = open;
    this.recruit.box.setVisible(open && this.current === 'Team');
  }

  private openEngineer(open: boolean) {
    this.engineerOpen = open;
    this.engineerRecruit.box.setVisible(open && this.current === 'Team');
  }

  private openDevelopment(open: boolean) {
    this.developmentOpen = open;
    this.developmentUi.box.setVisible(open && this.current === 'Team');
  }

  private buildDevelopment() {
    const c = this.scene.add.container(0, 0).setVisible(false);
    c.add(addBox(this.scene, 0, 70, W, 810, COLORS.bg).setInteractive());
    c.add(this.scene.add.rectangle(W / 2, 84, 120, 3, COLORS.red));
    c.add(addText(this.scene, W / 2, 90, 'CAR DEVELOPMENT', 24).setOrigin(0.5, 0));
    const info = addText(this.scene, W / 2, 124, '', 13, '#9aa7d0', c).setOrigin(0.5, 0).setWordWrapWidth(W - 60).setAlign('center');
    addBox(this.scene, 20, 186, W - 40, 62, COLORS.panel, c);
    const status = addText(this.scene, 32, 194, '', 14, '#ffffff', c).setWordWrapWidth(W - 64).setLineSpacing(4);
    const rows = DEV_PACKAGES.map((def, i) => {
      const y = 262 + i * 132;
      addBox(this.scene, 20, y, W - 40, 120, COLORS.panel, c);
      addText(this.scene, 32, y + 8, def.name, 19, '#ffffff', c);
      addText(this.scene, 32, y + 34, `${def.blurb} · ${def.races} races`, 12, '#9aa7d0', c);
      const odds = addText(this.scene, 32, y + 54, '', 12, '#cfd6ee', c).setWordWrapWidth(W - 64);
      const button = addButton(this.scene, 32, y + 80, W - 64, 32, '', () => {
        const st = this.state();
        if (startDevelopment(st, def.key, RACES_PER_SEASON)) {
          recordEvent(st, 'devStart');
          this.hooks.save();
        }
      }, { fill: COLORS.green, size: 15, parent: c });
      return { def, odds, button };
    });
    addText(
      this.scene,
      W / 2,
      664,
      'Finished packages boost the whole car until the season ends, then reset. Rivals also improve race by race. Better drivers and a better race engineer make breakthroughs likelier and flops rarer.',
      12,
      '#9aa7d0',
      c,
    ).setOrigin(0.5, 0).setWordWrapWidth(W - 60).setAlign('center');
    addButton(this.scene, 30, 800, W - 60, 44, 'BACK TO TEAM', () => this.openDevelopment(false), { size: 16, parent: c });
    this.developmentUi = { box: c, info, status, rows };
  }

  private renderDevelopment(s: GameState) {
    const u = this.developmentUi;
    const dev = s.development;
    u.info.setText(`Season ${s.season} · Race ${s.race}/${RACES_PER_SEASON} · Season bonus so far: ${dev.bonus >= 0 ? '+' : ''}${(dev.bonus * 100).toFixed(1)}% car rating`);
    const active = dev.active ? packageDef(dev.active.key) : undefined;
    const last = dev.last ? packageDef(dev.last.key) : undefined;
    u.status.setText(
      active
        ? `In progress: ${active.name}, ${dev.active!.racesLeft} race${dev.active!.racesLeft === 1 ? '' : 's'} to go`
        : `No package in progress${last && dev.last ? `\nLast result: ${last.name}, ${DEV_OUTCOME_LABEL[dev.last.outcome]}` : ''}`,
    );
    const q = teamQuality(s);
    for (const { def, odds, button } of u.rows) {
      const o = developmentOdds(q, def);
      const g = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
      odds.setText(`Breakthrough ${g(def.big)}: ${oddsHint(o.big)} · Solid ${g(def.solid)}: ${oddsHint(o.solid)} · Flop ${def.flop === 0 ? '(nothing)' : g(def.flop)}: ${oddsHint(o.flop)}`);
      const cost = developmentCost(s, def);
      const fits = fitsSeason(s, def, RACES_PER_SEASON);
      button.setLabel(!fits ? 'WON\'T FINISH THIS SEASON' : dev.active ? 'BUSY' : `START: $${formatNumber(cost)}`);
      button.setState(fits && !dev.active && s.money >= cost, COLORS.green);
    }
  }

  private buildEngineerRecruit() {
    const c = this.scene.add.container(0, 0).setVisible(false);
    c.add(addBox(this.scene, 0, 70, W, 810, COLORS.bg).setInteractive());
    c.add(this.scene.add.rectangle(W / 2, 84, 120, 3, COLORS.red));
    c.add(addText(this.scene, W / 2, 90, 'RECRUIT A RACE ENGINEER', 24).setOrigin(0.5, 0));
    const info = addText(this.scene, W / 2, 124, '', 14, '#9aa7d0', c).setOrigin(0.5, 0).setWordWrapWidth(W - 60).setAlign('center');
    const meet = addButton(this.scene, 30, 170, W - 60, 44, '', () => {
      if (requestEngineerMeeting(this.state())) {
        this.engineerMessage = '';
        this.hooks.save();
      }
    }, { fill: COLORS.green, size: 16, parent: c });

    addBox(this.scene, 20, 226, W - 40, 370, COLORS.panel, c);
    const name = addText(this.scene, W / 2, 238, '', 22, '#ffd400', c).setOrigin(0.5, 0);
    const estimate = addText(this.scene, W / 2, 272, '', 14, '#9aa7d0', c).setOrigin(0.5, 0);
    const traits = addText(this.scene, W / 2, 304, '', 15, '#cfd6ee', c).setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    const amount = addText(this.scene, W / 2, 398, '', 30, '#ffffff', c).setOrigin(0.5, 0);
    const caption = addText(this.scene, W / 2, 438, 'per race, paid after every race', 12, '#9aa7d0', c).setOrigin(0.5, 0);
    const steps: [string, number][] = [['-25%', 0.75], ['-5%', 0.95], ['+5%', 1.05], ['+25%', 1.25]];
    const stepBtns = steps.map(([label, mult], i) =>
      addButton(this.scene, 34 + i * 118, 466, 108, 38, label, () => {
        this.engineerOffer = Math.max(1, Math.round(this.engineerOffer * mult));
      }, { size: 16, parent: c }),
    );
    const sign = addButton(this.scene, 34, 514, W - 68, 40, '', () => {
      const s = this.state();
      const m = s.engineerMeeting;
      if (!m) return;
      const result = offerEngineerContract(s, this.engineerOffer);
      this.engineerMessage =
        result.outcome === 'signed'
          ? `${result.name} signed for $${formatNumber(this.engineerOffer)} a race${result.replaced ? `, replacing ${result.replaced}` : ''}.`
          : `${m.name} turned the offer down and left.`;
      this.engineerMessageGood = result.outcome === 'signed';
      this.hooks.save();
    }, { fill: COLORS.green, size: 14, parent: c });
    const walkBtn = addButton(this.scene, 34, 558, W - 68, 30, 'WALK AWAY', () => {
      const s = this.state();
      if (!s.engineerMeeting) return;
      this.engineerMessage = `You ended talks with ${s.engineerMeeting.name}.`;
      this.engineerMessageGood = false;
      endEngineerMeeting(s);
      this.hooks.save();
    }, { size: 14, parent: c });
    const idle = addText(this.scene, W / 2, 320, '', 15, '#9aa7d0', c).setOrigin(0.5, 0).setWordWrapWidth(W - 90).setAlign('center');

    addText(this.scene, 30, 612, 'Current race engineer', 16, '#ffffff', c);
    const current = addText(this.scene, 36, 642, '', 13, '#cfd6ee', c).setWordWrapWidth(W - 72);
    addButton(this.scene, 30, 800, W - 60, 44, 'BACK TO TEAM', () => this.openEngineer(false), { size: 16, parent: c });
    this.engineerRecruit = { box: c, info, meet, name, estimate, traits, amount, caption, stepBtns, sign, walkBtn, idle, current };
  }

  private renderEngineerRecruit(s: GameState) {
    const r = this.engineerRecruit;
    r.info.setText(`Clout: ${s.clout} · One engineer calls pits, tyres and push/conserve for both cars. Each stat is how often they get it right. Unpaid engineers quit.`);
    r.meet.setLabel(s.engineerMeeting ? 'NEGOTIATION IN PROGRESS' : `MEET AN ENGINEER: ${ENGINEER_MEETING_CLOUT} CLOUT`);
    r.meet.setState(!s.engineerMeeting && s.clout >= ENGINEER_MEETING_CLOUT, COLORS.green);

    const m = s.engineerMeeting;
    if (m !== this.engineerOfferFor) {
      this.engineerOfferFor = m;
      if (m) this.engineerOffer = openingOffer(m);
    }
    for (const b of [r.name, r.estimate, r.traits, r.amount, r.caption, ...r.stepBtns.flatMap((x) => [x.rect, x.label]), r.sign.rect, r.sign.label, r.walkBtn.rect, r.walkBtn.label]) {
      b.setVisible(!!m);
    }
    r.idle.setVisible(!m);
    if (m) {
      r.name.setText(m.name);
      r.estimate.setText(`They want roughly $${formatNumber(m.lo)} to $${formatNumber(m.hi)} a race`);
      r.traits.setText(engineerLines(m.stats).join('\n'));
      r.amount.setText(`$${formatNumber(this.engineerOffer)}`);
      r.sign.setLabel(s.engineer ? `SIGN, REPLACING ${s.engineer.name.toUpperCase()}` : 'SIGN AS RACE ENGINEER');
    } else {
      r.idle.setText(this.engineerMessage || 'Spend clout to meet a race engineer. Each has a hidden minimum wage: offer at least that and they sign, offer less and they walk. A better engineer costs more.');
      r.idle.setColor(this.engineerMessage ? (this.engineerMessageGood ? '#14b87a' : '#e08a1f') : '#9aa7d0');
    }
    r.current.setText(s.engineer ? `${s.engineer.name}\n${describeEngineer(s.engineer)}` : describeEngineer(null));
  }

  private buildRecruit() {
    const c = this.scene.add.container(0, 0).setVisible(false);
    c.add(addBox(this.scene, 0, 70, W, 810, COLORS.bg).setInteractive());
    c.add(this.scene.add.rectangle(W / 2, 84, 120, 3, COLORS.red));
    c.add(addText(this.scene, W / 2, 90, 'RECRUIT A DRIVER', 24).setOrigin(0.5, 0));
    const info = addText(this.scene, W / 2, 124, '', 14, '#9aa7d0', c).setOrigin(0.5, 0).setWordWrapWidth(W - 60).setAlign('center');
    const meet = addButton(this.scene, 30, 170, W - 60, 44, '', () => {
      if (requestDriverMeeting(this.state())) {
        this.driverMessage = '';
        this.hooks.save();
      }
    }, { fill: COLORS.green, size: 16, parent: c });

    addBox(this.scene, 20, 226, W - 40, 370, COLORS.panel, c);
    const name = addText(this.scene, W / 2, 238, '', 22, '#ffd400', c).setOrigin(0.5, 0);
    const estimate = addText(this.scene, W / 2, 272, '', 14, '#9aa7d0', c).setOrigin(0.5, 0);
    const traits = addText(this.scene, W / 2, 300, '', 15, '#cfd6ee', c).setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    const amount = addText(this.scene, W / 2, 398, '', 30, '#ffffff', c).setOrigin(0.5, 0);
    const caption = addText(this.scene, W / 2, 438, 'per race, paid after every race', 12, '#9aa7d0', c).setOrigin(0.5, 0);
    const steps: [string, number][] = [['-25%', 0.75], ['-5%', 0.95], ['+5%', 1.05], ['+25%', 1.25]];
    const stepBtns = steps.map(([label, mult], i) =>
      addButton(this.scene, 34 + i * 118, 466, 108, 38, label, () => {
        this.driverOffer = Math.max(1, Math.round(this.driverOffer * mult));
      }, { size: 16, parent: c }),
    );
    const sign = ([0, 1] as const).map((slot) =>
      addButton(this.scene, 34 + slot * 238, 514, 230, 40, '', () => {
        const s = this.state();
        const m = s.driverMeeting;
        if (!m) return;
        const result = offerContract(s, slot, this.driverOffer);
        this.driverMessage =
          result.outcome === 'signed'
            ? `${result.name} signed for $${formatNumber(this.driverOffer)} a race, replacing ${result.replaced}.`
            : `${m.name} turned the offer down and left.`;
        this.driverMessageGood = result.outcome === 'signed';
        if (result.outcome === 'signed') this.hooks.onDriversChanged();
        this.hooks.save();
      }, { fill: COLORS.green, size: 13, parent: c }),
    );
    const walkBtn = addButton(this.scene, 34, 558, W - 68, 30, 'WALK AWAY', () => {
      const s = this.state();
      if (!s.driverMeeting) return;
      this.driverMessage = `You ended talks with ${s.driverMeeting.name}.`;
      this.driverMessageGood = false;
      endDriverMeeting(s);
      this.hooks.save();
    }, { size: 14, parent: c });
    const idle = addText(this.scene, W / 2, 320, '', 15, '#9aa7d0', c).setOrigin(0.5, 0).setWordWrapWidth(W - 90).setAlign('center');

    addText(this.scene, 30, 612, 'Current drivers', 16, '#ffffff', c);
    const current = [0, 1].map((i) => addText(this.scene, 36, 642 + i * 44, '', 13, '#cfd6ee', c).setWordWrapWidth(W - 72));
    addButton(this.scene, 30, 800, W - 60, 44, 'BACK TO TEAM', () => this.openRecruit(false), { size: 16, parent: c });
    this.recruit = { box: c, info, meet, name, estimate, traits, amount, caption, stepBtns, sign, walkBtn, idle, current };
  }

  private renderRecruit(s: GameState) {
    const r = this.recruit;
    r.info.setText(`Clout: ${s.clout} · Win races, then run a Fan Event to earn clout. Drivers stay until you replace them, and are paid after every race: if you can't pay, they quit.`);
    r.meet.setLabel(s.driverMeeting ? 'NEGOTIATION IN PROGRESS' : `MEET A DRIVER: ${DRIVER_MEETING_CLOUT} CLOUT`);
    r.meet.setState(!s.driverMeeting && s.clout >= DRIVER_MEETING_CLOUT, COLORS.green);

    const m = s.driverMeeting;
    if (m !== this.offerFor) {
      this.offerFor = m;
      if (m) this.driverOffer = openingOffer(m);
    }
    for (const b of [r.name, r.estimate, r.traits, r.amount, r.caption, ...r.stepBtns.flatMap((x) => [x.rect, x.label]), ...r.sign.flatMap((x) => [x.rect, x.label]), r.walkBtn.rect, r.walkBtn.label]) {
      b.setVisible(!!m);
    }
    r.idle.setVisible(!m);
    if (m) {
      r.name.setText(m.name);
      r.estimate.setText(`They want roughly $${formatNumber(m.lo)} to $${formatNumber(m.hi)} a race`);
      r.traits.setText(driverLines(m.stats).join('\n'));
      r.amount.setText(`$${formatNumber(this.driverOffer)}`);
      r.sign.forEach((b, i) => b.setLabel(`SIGN AS DRIVER ${i + 1}`));
    } else {
      r.idle.setText(this.driverMessage || 'Spend clout to meet a driver. Each one has a hidden minimum wage: offer at least that and they sign into the seat you choose, offer less and they walk. A better driver costs more.');
      r.idle.setColor(this.driverMessage ? (this.driverMessageGood ? '#14b87a' : '#e08a1f') : '#9aa7d0');
    }
    r.current.forEach((t, i) => t.setText(`Driver ${i + 1}: ${s.driverNames[i]}\n${describeDriver(s.drivers[i])}`));
  }

  private runFanEvent() {
    const s = this.state();
    const drops = runFanEvent(s, this.hooks.incomePerSecond());
    if (!drops) return;
    const parts = [
      drops.money > 0 && `$${formatNumber(drops.money)}`,
      drops.gems > 0 && `${drops.gems} gems`,
      drops.researchPoints > 0 && `${drops.researchPoints} RP`,
      drops.clout > 0 && `${drops.clout} clout`,
    ].filter(Boolean);
    this.fanMessage = parts.length > 0 ? `The fans came through!\n+ ${parts.join('  + ')}` : 'The fans cheered, but nothing dropped this time.';
    this.hooks.save();
  }

  private renderTeam(s: GameState) {
    const t = this.team;
    this.teamName.setText(s.teamName.toUpperCase());
    t.swatches.forEach(({ sw, color }) => sw.setStrokeStyle(color === s.teamColor ? 4 : 2, color === s.teamColor ? 0xffffff : COLORS.border));
    t.driverRows.forEach((row, i) => {
      row.name.setText(`${s.driverNames[i]}${s.drivers[i].salary > 0 ? '' : '  (rookie)'}`);
      row.detail.setText(describeDriver(s.drivers[i]));
      row.chip.setFillStyle(s.teamColor);
    });
    t.recruitBtn.setLabel(`RECRUIT A DRIVER (${s.clout} CLOUT)`);
    if (this.recruitOpen) this.renderRecruit(s);
    t.engineerRow.name.setText(s.engineer ? s.engineer.name : 'No race engineer');
    t.engineerRow.detail.setText(describeEngineer(s.engineer));
    t.engineerRow.chip.setFillStyle(s.engineer ? s.teamColor : COLORS.border);
    t.engineerBtn.setLabel(`RECRUIT A RACE ENGINEER (${s.clout} CLOUT)`);
    if (this.engineerOpen) this.renderEngineerRecruit(s);
    t.developmentBtn.setLabel(s.development.active ? `CAR DEVELOPMENT (${s.development.active.racesLeft} RACES LEFT)` : 'CAR DEVELOPMENT');
    if (this.developmentOpen) this.renderDevelopment(s);
    t.staffBtn.setLabel(`SPECIALIST STAFF (${STAFF_ROLES.filter((r) => s.staff[r]).length}/${STAFF_ROLES.length})`);
    if (this.staffOpen) this.renderStaff(s);
    [s.stats.racesWon, s.stats.wdc, s.stats.wcc].forEach((v, i) => t.stats[i].setText(String(v)));
    const fans = fansFor(s.stats);
    t.fans.setText(`${formatNumber(fans)} FANS`);
    const pct = (cur: FanCurrency) => `${Math.round(fanChance(fans, cur) * 100)}%`;
    t.fanInfo.setText(
      `Every race win brings ${FANS_PER_WIN} fans. Run a Fan Event once per prestige: each currency has its own chance to drop, and more fans means better odds and bigger drops.\nChances: money ${pct('money')} · gems ${pct('gems')} · research ${pct('researchPoints')} · clout ${pct('clout')}`,
    );
    t.fanButton.setLabel(s.fanEventUsed ? 'FAN EVENT USED (PRESTIGE TO RESET)' : fans > 0 ? 'RUN FAN EVENT' : 'WIN A RACE TO GET FANS');
    t.fanButton.setState(canRunFanEvent(s));
    t.fanResult.setText(s.fanEventUsed ? this.fanMessage : '');
  }

  private buildPrestige() {
    const c = this.panel('Prestige', 'Prestige & R&D');
    const info = addText(this.scene, W / 2, 122, '', 13, '#9aa7d0', c)
      .setOrigin(0.5, 0)
      .setWordWrapWidth(W - 60)
      .setAlign('center');
    const button = addButton(
      this.scene,
      30,
      168,
      W - 60,
      40,
      '',
      () => {
        const now = this.scene.time.now;
        if (now < this.prestigeArmedUntil) {
          this.prestigeArmedUntil = 0;
          this.hooks.prestige();
        } else {
          this.prestigeArmedUntil = now + 3000;
        }
      },
      { fill: COLORS.green, size: 16, parent: c },
    );
    addText(this.scene, 30, 214, 'R&D: bought with research points', 14, '#ffffff', c);
    const auto = addButton(
      this.scene,
      W - 150,
      211,
      120,
      24,
      '',
      () => {
        const s = this.state();
        if (s.autoUnlocked) s.autoResearch = !s.autoResearch;
      },
      { size: 12, parent: c },
    );
    const rows = RESEARCH_DEFS.map((def, i) => {
      const y = 238 + i * 47;
      addBox(this.scene, 20, y, W - 40, 43, COLORS.panel, c);
      addText(this.scene, 32, y + 4, def.name, 15, '#ffffff', c);
      const level = addText(this.scene, 32, y + 25, '', 11, '#9aa7d0', c);
      addButton(this.scene, W - 182, y + 10, 24, 24, 'i', () => this.hooks.onInfo(def.key), { size: 13, fill: 0x1d2745, parent: c });
      const button = addButton(
        this.scene,
        W - 150,
        y + 6,
        120,
        31,
        '',
        () => {
          if (buyResearch(this.state(), def)) this.hooks.onResearch();
        },
        { size: 13, parent: c },
      );
      return { def, level, button };
    });
    this.prestige = { info, button, rows, auto };
  }

  private buildShop() {
    const c = this.panel('Shop', 'Shop');
    const gems = addText(this.scene, W / 2, 130, '', 16, '#9aa7d0', c).setOrigin(0.5, 0);
    const unlock = addButton(
      this.scene,
      30,
      170,
      W - 60,
      54,
      '',
      async () => {
        if (await purchaseAutoUnlock()) this.state().autoUnlocked = true;
      },
      { fill: COLORS.green, size: 18, parent: c },
    );
    const names: [AutoKey, string][] = [
      ['autoBuy', 'Auto Buy'],
      ['autoTap', 'Auto Tap'],
    ];
    const toggles = names.map(([key, name], i) => ({
      key,
      name,
      button: addButton(
        this.scene,
        30,
        250 + i * 60,
        W - 60,
        48,
        name,
        () => {
          const s = this.state();
          s[key] = !s[key];
        },
        { size: 16, parent: c },
      ),
    }));
    addButton(
      this.scene,
      30,
      390,
      W - 60,
      48,
      `Watch ad: 2x speed for ${BOOST_SECONDS}s`,
      async () => {
        if (await showRewardedAd()) this.state().boostSeconds += BOOST_SECONDS;
      },
      { size: 16, parent: c },
    );
    const gemBoost = addButton(
      this.scene,
      30,
      450,
      W - 60,
      48,
      `${GEM_BOOST_COST} gems: 2x speed for ${GEM_BOOST_SECONDS / 60} min`,
      () => {
        const s = this.state();
        if (s.gems < GEM_BOOST_COST) return;
        s.gems -= GEM_BOOST_COST;
        s.boostSeconds += GEM_BOOST_SECONDS;
      },
      { size: 16, parent: c },
    );
    addText(this.scene, W / 2, 530, 'Purchases and ads are stubbed in this build.', 13, '#5b6894', c).setOrigin(0.5, 0);
    this.shop = { gems, unlock, toggles, gemBoost };
  }

  render() {
    const s = this.state();
    if (this.goalsOpen && this.current === 'Race') this.renderGoals(s);
    if (this.current === 'Sponsors') {
      this.renderSponsors(s);
    } else if (this.current === 'Team') {
      this.renderTeam(s);
    } else if (this.current === 'Prestige') {
      const p = this.prestige;
      const rp = researchPointsFor(s.season);
      p.info.setText(
        rp > 0
          ? `Season ${s.season} · Research points: ${s.researchPoints}\nPrestige resets money, upgrades and seasons to Season 1 Race 1, but keeps research, gems and Auto.`
          : `Season ${s.season} · Research points: ${s.researchPoints}\nReach Season ${MIN_PRESTIGE_SEASON} to prestige. The further you get, the more research points you earn.`,
      );
      const armed = this.scene.time.now < this.prestigeArmedUntil;
      p.button.setLabel(armed ? 'TAP AGAIN TO CONFIRM' : rp > 0 ? `PRESTIGE: +${rp} RP` : 'PRESTIGE LOCKED');
      p.button.setState(rp > 0, armed ? COLORS.accent : COLORS.green);
      p.auto.setLabel(s.autoUnlocked ? `AUTO BUY ${s.autoResearch ? 'ON' : 'OFF'}` : 'AUTO BUY');
      p.auto.setState(s.autoUnlocked, s.autoUnlocked && s.autoResearch ? COLORS.green : COLORS.bg);
      for (const { def, level, button } of p.rows) {
        const lv = s.research[def.key] ?? 0;
        const cost = researchCost(def, lv);
        level.setText(`Lv ${lv} · ${def.blurb}`);
        button.setLabel(`${cost} RP`);
        button.setState(s.researchPoints >= cost);
      }
    } else if (this.current === 'Shop') {
      const sh = this.shop;
      sh.gems.setText(`Gems: ${s.gems}`);
      sh.unlock.setLabel(s.autoUnlocked ? 'Auto unlocked ✓' : `Unlock Auto (one-time) ${AUTO_PRICE_LABEL}`);
      sh.unlock.setState(!s.autoUnlocked, COLORS.green);
      for (const { key, name, button } of sh.toggles) {
        button.setLabel(`${name}: ${s[key] ? 'ON' : 'OFF'}`);
        button.setState(s.autoUnlocked, s[key] ? COLORS.green : COLORS.accent);
      }
      sh.gemBoost.setState(s.gems >= GEM_BOOST_COST);
    }
  }
}
