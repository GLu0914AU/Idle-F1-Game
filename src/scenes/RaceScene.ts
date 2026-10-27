import Phaser from 'phaser';
import { GameState, loadGame, saveGame } from '../game/save';

const W = 540;
const COLORS = { bg: 0x0b1020, panel: 0x151c33, border: 0x2a3558, accent: 0x2f6bff };
const UPGRADES: [string, string][] = [
  ['engine', 'Engine'],
  ['aero', 'Aero'],
  ['tyres', 'Tyres'],
  ['brakes', 'Brakes'],
  ['reliability', 'Reliability'],
  ['pitCrew', 'Pit Crew'],
];
const TABS = ['Race', 'Team', 'Standings', 'R&D', 'Shop'];

export class RaceScene extends Phaser.Scene {
  private state!: GameState;
  private moneyText!: Phaser.GameObjects.Text;

  constructor() {
    super('Race');
  }

  create() {
    this.state = loadGame();
    this.drawHud();
    this.drawTrack();
    this.drawStats();
    this.drawUpgrades();
    this.drawTabs();

    this.time.addEvent({ delay: 5000, loop: true, callback: () => saveGame(this.state) });
    window.addEventListener('beforeunload', () => saveGame(this.state));
  }

  private text(x: number, y: number, s: string, size = 18, color = '#ffffff') {
    return this.add.text(x, y, s, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, color });
  }

  private box(x: number, y: number, w: number, h: number, fill = COLORS.panel) {
    return this.add.rectangle(x, y, w, h, fill).setOrigin(0).setStrokeStyle(2, COLORS.border);
  }

  private drawHud() {
    this.box(0, 0, W, 70, COLORS.bg);
    this.text(16, 12, this.state.teamName, 22);
    this.text(16, 40, `Season ${this.state.season} · Race ${this.state.race}/10`, 14, '#9aa7d0');
    this.moneyText = this.text(W - 16, 12, `$ ${Math.floor(this.state.money)}`, 22).setOrigin(1, 0);
    this.text(W - 16, 40, `Gems ${this.state.gems}`, 14, '#9aa7d0').setOrigin(1, 0);
  }

  private drawTrack() {
    this.box(0, 70, W, 400, 0x070a14);
    const g = this.add.graphics();
    g.lineStyle(14, 0x3a4468);
    g.strokeEllipse(W / 2, 270, 380, 260);
    g.lineStyle(2, 0xffffff);
    g.strokeEllipse(W / 2, 270, 380, 260);
    this.text(W / 2, 270, 'Track view', 20, '#5b6894').setOrigin(0.5);
  }

  private drawStats() {
    this.text(16, 486, '0 $/s', 20);
    this.box(300, 478, 110, 44, 0x14b87a);
    this.text(355, 500, '2x SPEED', 14).setOrigin(0.5);
    this.box(420, 478, 110, 44, COLORS.bg).setStrokeStyle(2, COLORS.accent);
    this.text(475, 500, 'AUTO BUY', 14, '#2f6bff').setOrigin(0.5);
  }

  private drawUpgrades() {
    UPGRADES.forEach(([key, name], i) => {
      const x = 12 + (i % 2) * 264;
      const y = 540 + Math.floor(i / 2) * 106;
      this.box(x, y, 252, 96);
      this.text(x + 12, y + 10, name, 18);
      this.text(x + 12, y + 38, `Lv ${this.state.upgrades[key] ?? 0}`, 14, '#9aa7d0');
      this.box(x + 12, y + 62, 228, 26, COLORS.accent);
      this.text(x + 126, y + 75, 'UPGRADE', 14).setOrigin(0.5);
    });
  }

  private drawTabs() {
    const y = 880;
    this.box(0, y, W, 80, COLORS.bg);
    const w = W / TABS.length;
    TABS.forEach((t, i) => {
      if (i === 0) this.box(i * w + 6, y + 8, w - 12, 64, COLORS.panel).setStrokeStyle(2, COLORS.accent);
      this.text(i * w + w / 2, y + 40, t, 14).setOrigin(0.5);
    });
  }

  update() {
    this.moneyText.setText(`$ ${Math.floor(this.state.money)}`);
  }
}
