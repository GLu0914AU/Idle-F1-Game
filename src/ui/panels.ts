import Phaser from 'phaser';
import { AUTO_PRICE_LABEL, purchaseAutoUnlock, showRewardedAd } from '../game/monetization';
import { GameState } from '../game/save';
import { MIN_PRESTIGE_SEASON, RESEARCH_DEFS, ResearchDef, buyResearch, researchCost, researchPointsFor } from '../game/prestige';
import { openingPitch, meetingCost, pitch, requestMeeting, sponsorIncome, walkAway } from '../game/sponsors';
import { formatNumber } from '../game/economy';
import { PLAYER_COLOR } from '../game/teams';
import { FANS_PER_WIN, FanCurrency, canRunFanEvent, fanChance, fansFor, runFanEvent } from '../game/career';
import { Button, COLORS, W, addBox, addButton, addText } from './widgets';

export const TABS = ['Race', 'Team', 'Sponsors', 'Prestige', 'Shop'] as const;
const TEAM_COLORS = [0xffd400, 0xff7a1a, 0xe10600, 0xff4fa3, 0xb48cff, 0x2f6bff, 0x4de3ff, 0x14b87a, 0xffffff, 0x9aa0b5];
const STAT_LABELS = ['RACES WON', "DRIVERS' TITLES", "CONSTRUCTORS' TITLES"];
type TabName = (typeof TABS)[number];
type AutoKey = 'autoBuy' | 'autoStrategy' | 'autoTap';

export const GEM_BOOST_COST = 10;
export const BOOST_SECONDS = 60;
export const GEM_BOOST_SECONDS = 300;

export interface PanelHooks {
  rename(): void;
  renameDriver(index: number): void;
  // The team colour changed, so cars and the strategy strip need recolouring.
  recolour(): void;
  incomePerSecond(): number;
  prestige(): void;
  // Persist right away so a reload can't undo a spend or an outcome.
  save(): void;
  // Research changes the car's rating, so the live race needs refreshing.
  onResearch(): void;
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
  private fanMessage = '';
  private team!: {
    swatches: { sw: Phaser.GameObjects.Rectangle; color: number }[];
    driverRows: { name: Phaser.GameObjects.Text; chip: Phaser.GameObjects.Rectangle }[];
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
    this.show('Race');
  }

  show(tab: TabName) {
    const changed = tab !== this.current;
    this.current = tab;
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
    const driverRows = [0, 1].map((i) => {
      const y = 280 + i * 42;
      addBox(this.scene, 30, y, W - 60, 36, COLORS.panel, c);
      const chip = addBox(this.scene, 30, y, 8, 36, PLAYER_COLOR, c).setStrokeStyle(0);
      const name = addText(this.scene, 52, y + 6, '', 20, '#ffffff', c);
      addButton(this.scene, W - 150, y + 5, 110, 26, 'CHANGE NAME', () => this.hooks.renameDriver(i), { parent: c, size: 12 });
      return { name, chip };
    });

    section(376, 'Career');
    const stats = STAT_LABELS.map((label, i) => {
      const x = 30 + i * 156;
      addBox(this.scene, x, 400, 144, 66, COLORS.panel, c);
      const value = addText(this.scene, x + 72, 408, '', 28, '#ffc933', c).setOrigin(0.5, 0);
      addText(this.scene, x + 72, 444, label, 12, '#9aa7d0', c).setOrigin(0.5, 0);
      return value;
    });

    section(486, 'Fans');
    addBox(this.scene, 30, 510, W - 60, 190, COLORS.panel, c);
    addBox(this.scene, 30, 510, 5, 190, COLORS.red, c).setStrokeStyle(0);
    const fans = addText(this.scene, 52, 520, '', 30, '#ffffff', c);
    const fanInfo = addText(this.scene, 52, 560, '', 13, '#9aa7d0', c).setWordWrapWidth(W - 120);
    const fanButton = addButton(this.scene, 52, 626, W - 104, 40, '', () => this.runFanEvent(), { parent: c, size: 16, fill: COLORS.green });
    const fanResult = addText(this.scene, W / 2, 712, '', 16, '#ffc933', c).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 80);
    this.team = { swatches, driverRows, stats, fans, fanInfo, fanButton, fanResult };
  }

  private runFanEvent() {
    const s = this.state();
    const drops = runFanEvent(s, this.hooks.incomePerSecond());
    if (!drops) return;
    const parts = [
      drops.money > 0 && `$${formatNumber(drops.money)}`,
      drops.gems > 0 && `${drops.gems} gems`,
      drops.researchPoints > 0 && `${drops.researchPoints} RP`,
    ].filter(Boolean);
    this.fanMessage = parts.length > 0 ? `The fans came through!\n+ ${parts.join('  + ')}` : 'The fans cheered, but nothing dropped this time.';
    this.hooks.save();
  }

  private renderTeam(s: GameState) {
    const t = this.team;
    this.teamName.setText(s.teamName.toUpperCase());
    t.swatches.forEach(({ sw, color }) => sw.setStrokeStyle(color === s.teamColor ? 4 : 2, color === s.teamColor ? 0xffffff : COLORS.border));
    t.driverRows.forEach((row, i) => {
      row.name.setText(s.driverNames[i]);
      row.chip.setFillStyle(s.teamColor);
    });
    [s.stats.racesWon, s.stats.wdc, s.stats.wcc].forEach((v, i) => t.stats[i].setText(String(v)));
    const fans = fansFor(s.stats);
    t.fans.setText(`${formatNumber(fans)} FANS`);
    const pct = (cur: FanCurrency) => `${Math.round(fanChance(fans, cur) * 100)}%`;
    t.fanInfo.setText(
      `Every race win brings ${FANS_PER_WIN} fans. Run a Fan Event once per prestige: each currency has its own chance to drop, and more fans means better odds and bigger drops.\nChances: money ${pct('money')} · gems ${pct('gems')} · research ${pct('researchPoints')}`,
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
    addText(this.scene, 30, 214, 'R&D: permanent, bought with research points', 14, '#ffffff', c);
    const rows = RESEARCH_DEFS.map((def, i) => {
      const y = 238 + i * 47;
      addBox(this.scene, 20, y, W - 40, 43, COLORS.panel, c);
      addText(this.scene, 32, y + 4, def.name, 15, '#ffffff', c);
      const level = addText(this.scene, 32, y + 25, '', 11, '#9aa7d0', c);
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
    this.prestige = { info, button, rows };
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
      ['autoStrategy', 'Auto Strategy'],
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
      460,
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
      520,
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
    addText(this.scene, W / 2, 600, 'Purchases and ads are stubbed in this build.', 13, '#5b6894', c).setOrigin(0.5, 0);
    this.shop = { gems, unlock, toggles, gemBoost };
  }

  render() {
    const s = this.state();
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
