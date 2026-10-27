import Phaser from 'phaser';
import { RND_DEFS, UpgradeDef, buyUpgrade, formatNumber, upgradeCost } from '../game/economy';
import { AUTO_PRICE_LABEL, purchaseAutoUnlock, showRewardedAd } from '../game/monetization';
import { GameState } from '../game/save';
import { RACES_PER_SEASON, constructorsTable } from '../game/season';
import { PLAYER_DRIVERS } from '../game/teams';
import { Button, COLORS, W, addBox, addButton, addText } from './widgets';

export const TABS = ['Race', 'Team', 'Standings', 'R&D', 'Shop'] as const;
type TabName = (typeof TABS)[number];
type AutoKey = 'autoBuy' | 'autoStrategy' | 'autoTap';

export const GEM_BOOST_COST = 10;
export const BOOST_SECONDS = 60;
export const GEM_BOOST_SECONDS = 300;

export interface PanelHooks {
  rename(): void;
}

// Full-screen panels shown over the race view for every tab except Race.
export class PanelHost {
  private panels = new Map<TabName, Phaser.GameObjects.Container>();
  private current: TabName = 'Race';
  private standingRows: { row: Phaser.GameObjects.Text; pts: Phaser.GameObjects.Text }[] = [];
  private standingNote!: Phaser.GameObjects.Text;
  private teamName!: Phaser.GameObjects.Text;
  private teamInfo!: Phaser.GameObjects.Text;
  private rnd: { def: UpgradeDef; level: Phaser.GameObjects.Text; button: Button }[] = [];
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
    this.buildStandings();
    this.buildTeam();
    this.buildRnd();
    this.buildShop();
    this.show('Race');
  }

  show(tab: TabName) {
    this.current = tab;
    for (const [name, c] of this.panels) c.setVisible(name === tab);
  }

  private panel(name: TabName, title: string) {
    const c = this.scene.add.container(0, 0).setVisible(false);
    // Blocks taps from reaching the race view underneath.
    c.add(addBox(this.scene, 0, 70, W, 810, COLORS.bg).setInteractive());
    c.add(addText(this.scene, W / 2, 90, title, 24).setOrigin(0.5, 0));
    this.panels.set(name, c);
    return c;
  }

  private buildStandings() {
    const c = this.panel('Standings', "Constructors' Championship");
    for (let i = 0; i < 10; i++) {
      const row = addText(this.scene, 30, 150 + i * 44, '', 18, '#cfd6ee', c);
      const pts = addText(this.scene, W - 30, 150 + i * 44, '', 18, '#cfd6ee', c).setOrigin(1, 0);
      this.standingRows.push({ row, pts });
    }
    this.standingNote = addText(this.scene, W / 2, 620, '', 16, '#9aa7d0', c)
      .setOrigin(0.5, 0)
      .setWordWrapWidth(W - 60)
      .setAlign('center');
  }

  private buildTeam() {
    const c = this.panel('Team', 'Team');
    this.teamName = addText(this.scene, W / 2, 150, '', 28, '#ffd400', c).setOrigin(0.5, 0);
    addButton(this.scene, W / 2 - 80, 200, 160, 40, 'RENAME', () => this.hooks.rename(), { parent: c });
    addText(this.scene, 40, 280, 'Drivers', 20, '#9aa7d0', c);
    PLAYER_DRIVERS.forEach((d, i) => addText(this.scene, 40, 316 + i * 32, d, 20, '#ffffff', c));
    this.teamInfo = addText(this.scene, 40, 420, '', 16, '#9aa7d0', c).setWordWrapWidth(W - 80);
  }

  private buildRnd() {
    const c = this.panel('R&D', 'R&D');
    const blurbs: Record<string, string> = {
      tapPower: '+10% boost per tap and faster pit stops',
      sponsorDeals: '+10% income and prize money',
    };
    RND_DEFS.forEach((def, i) => {
      const y = 150 + i * 110;
      addBox(this.scene, 20, y, W - 40, 96, COLORS.panel, c);
      addText(this.scene, 36, y + 10, def.name, 20, '#ffffff', c);
      const level = addText(this.scene, 36, y + 40, '', 14, '#9aa7d0', c);
      addText(this.scene, 36, y + 62, blurbs[def.key] ?? '', 13, '#9aa7d0', c);
      const button = addButton(this.scene, W - 190, y + 28, 150, 40, '', () => buyUpgrade(this.state(), def), { parent: c });
      this.rnd.push({ def, level, button });
    });
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
    if (this.current === 'Standings') {
      this.standingNote.setText(
        `Season ${s.season} · Race ${s.race}/${RACES_PER_SEASON}. Finish 1st after race ${RACES_PER_SEASON} to unlock Season ${s.season + 1}.`,
      );
      const table = constructorsTable(s, s.teamName);
      this.standingRows.forEach(({ row, pts }, i) => {
        const r = table[i];
        const color = r?.isPlayer ? '#ffd400' : '#cfd6ee';
        row.setText(r ? `${String(i + 1).padStart(2)}  ${r.name}` : '').setColor(color);
        pts.setText(r ? String(r.points) : '').setColor(color);
      });
    } else if (this.current === 'Team') {
      this.teamName.setText(s.teamName);
      this.teamInfo.setText(`Season ${s.season}\nCars: 2\nAuto: ${s.autoUnlocked ? 'unlocked' : 'locked'}`);
    } else if (this.current === 'R&D') {
      for (const { def, level, button } of this.rnd) {
        const lv = s.upgrades[def.key] ?? 0;
        const cost = upgradeCost(def, lv);
        level.setText(`Level ${lv}`);
        button.setLabel(`$${formatNumber(cost)}`);
        button.setState(s.money >= cost);
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
