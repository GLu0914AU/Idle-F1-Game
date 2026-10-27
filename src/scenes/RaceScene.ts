import Phaser from 'phaser';
import {
  UPGRADE_DEFS,
  UpgradeDef,
  buyUpgrade,
  carRating,
  formatNumber,
  incomePerSecond,
  racePayout,
  upgradeCost,
} from '../game/economy';
import { Race, createRace, standings, stepRace } from '../game/race';
import { GameState, loadGame, saveGame } from '../game/save';
import { DEFAULT_TRACK, Point, pointAt } from '../game/track';

const W = 540;
const VIEW = { y: 70, h: 400, padX: 90, padY: 30 };
const RACE_LAPS = 5;
// Game seconds per real second; ~90s laps would be too slow to watch.
const RACE_SPEED = 6;
const COLORS = { bg: 0x0b1020, panel: 0x151c33, border: 0x2a3558, accent: 0x2f6bff };
const TABS = ['Race', 'Team', 'Standings', 'R&D', 'Shop'];

export class RaceScene extends Phaser.Scene {
  private state!: GameState;
  private moneyText!: Phaser.GameObjects.Text;
  private race!: Race;
  private carGfx!: Phaser.GameObjects.Graphics;
  private towerRows: Phaser.GameObjects.Text[] = [];
  private lapText!: Phaser.GameObjects.Text;
  private restartAt = 0;
  private paid = false;
  private incomeText!: Phaser.GameObjects.Text;
  private cards: {
    def: UpgradeDef;
    level: Phaser.GameObjects.Text;
    button: Phaser.GameObjects.Rectangle;
    cost: Phaser.GameObjects.Text;
  }[] = [];

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
    this.moneyText = this.text(W - 16, 12, '', 22).setOrigin(1, 0);
    this.text(W - 16, 40, `Gems ${this.state.gems}`, 14, '#9aa7d0').setOrigin(1, 0);
  }

  private drawTrack() {
    this.box(0, VIEW.y, W, VIEW.h, 0x070a14);
    const g = this.add.graphics();
    const pts = DEFAULT_TRACK.points.map((p) => new Phaser.Math.Vector2(this.toView(p).x, this.toView(p).y));
    g.lineStyle(16, 0x3a4468).strokePoints(pts, true, true);
    g.lineStyle(2, 0x6b78a8).strokePoints(pts, true, true);

    this.carGfx = this.add.graphics();
    this.towerRows = [];
    for (let i = 0; i < 20; i++) {
      this.towerRows.push(this.text(8, VIEW.y + 6 + i * 17, '', 11));
    }
    this.lapText = this.text(W - 12, VIEW.y + 8, '', 14, '#9aa7d0').setOrigin(1, 0);
    this.startRace();
  }

  private toView(p: Point): Point {
    return { x: VIEW.padX + p.x * (W - VIEW.padX * 2), y: VIEW.y + VIEW.padY + p.y * (VIEW.h - VIEW.padY * 2) };
  }

  private startRace() {
    this.race = createRace({
      track: DEFAULT_TRACK,
      laps: RACE_LAPS,
      season: this.state.season,
      playerRating: carRating(this.state.upgrades),
      playerTeamName: this.state.teamName,
      seed: Date.now() & 0x7fffffff,
    });
    this.restartAt = 0;
    this.paid = false;
  }

  private renderRace() {
    const order = standings(this.race);
    this.carGfx.clear();
    for (const car of [...this.race.cars].reverse()) {
      const p = this.toView(pointAt(DEFAULT_TRACK, car.progress * DEFAULT_TRACK.length));
      this.carGfx.fillStyle(car.color).fillCircle(p.x, p.y, car.isPlayer ? 7 : 5);
      if (car.isPlayer) this.carGfx.lineStyle(2, 0xffffff).strokeCircle(p.x, p.y, 8);
    }
    order.forEach((car, i) => {
      const row = this.towerRows[i];
      row.setText(`${String(i + 1).padStart(2)} ${car.isPlayer ? car.driver : car.driver.split(' ').pop()?.slice(0, 10)}`);
      row.setColor(car.isPlayer ? '#ffd400' : '#cfd6ee');
    });
    const lap = Math.min(RACE_LAPS, Math.floor(order[0].progress) + 1);
    this.lapText.setText(this.race.finished ? 'FINISHED' : `Lap ${lap}/${RACE_LAPS}`);
  }

  private drawStats() {
    this.incomeText = this.text(16, 486, '', 20);
    this.box(300, 478, 110, 44, 0x14b87a);
    this.text(355, 500, '2x SPEED', 14).setOrigin(0.5);
    this.box(420, 478, 110, 44, COLORS.bg).setStrokeStyle(2, COLORS.accent);
    this.text(475, 500, 'AUTO BUY', 14, '#2f6bff').setOrigin(0.5);
  }

  private drawUpgrades() {
    this.cards = UPGRADE_DEFS.map((def, i) => {
      const x = 12 + (i % 2) * 264;
      const y = 540 + Math.floor(i / 2) * 106;
      this.box(x, y, 252, 96);
      this.text(x + 12, y + 10, def.name, 18);
      const level = this.text(x + 12, y + 38, '', 14, '#9aa7d0');
      const button = this.box(x + 12, y + 62, 228, 26, COLORS.accent).setInteractive({ useHandCursor: true });
      const cost = this.text(x + 126, y + 75, '', 14).setOrigin(0.5);
      button.on('pointerdown', () => {
        if (buyUpgrade(this.state, def)) this.applyRating();
      });
      return { def, level, button, cost };
    });
  }

  private applyRating() {
    const rating = carRating(this.state.upgrades);
    for (const car of this.race.cars) if (car.isPlayer) car.rating = rating;
  }

  private renderEconomy() {
    const rating = carRating(this.state.upgrades);
    this.moneyText.setText(`$ ${formatNumber(this.state.money)}`);
    this.incomeText.setText(`${formatNumber(incomePerSecond(rating, this.state.sponsors))} $/s · Rating ${Math.round(rating)}`);
    for (const { def, level, button, cost } of this.cards) {
      const lv = this.state.upgrades[def.key] ?? 0;
      const price = upgradeCost(def, lv);
      const affordable = this.state.money >= price;
      level.setText(`Lv ${lv} · +${def.ratingPerLevel} rating`);
      cost.setText(`UPGRADE  $${formatNumber(price)}`);
      button.setFillStyle(affordable ? COLORS.accent : 0x2a3350);
      cost.setColor(affordable ? '#ffffff' : '#8591b8');
    }
  }

  private payOut() {
    const order = standings(this.race);
    const positions = order.flatMap((c, i) => (c.isPlayer ? [i + 1] : []));
    this.state.money += racePayout(positions, this.state.season, this.state.sponsors);
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

  update(_time: number, delta: number) {
    // Clamp so a backgrounded tab doesn't teleport the cars or the money.
    const dt = Math.min(delta, 100) / 1000;
    const rating = carRating(this.state.upgrades);
    this.state.money += incomePerSecond(rating, this.state.sponsors) * dt;

    stepRace(this.race, dt * RACE_SPEED);
    if (this.race.finished && !this.paid) {
      this.paid = true;
      this.payOut();
    }
    this.renderRace();
    this.renderEconomy();
    if (this.race.finished) {
      this.restartAt += delta;
      if (this.restartAt > 3000) this.startRace();
    }
  }
}
