import Phaser from 'phaser';
import { pickAutoBuy, shouldAutoPit } from '../game/auto';
import {
  UPGRADE_DEFS,
  UpgradeDef,
  buyUpgrade,
  carRating,
  formatNumber,
  incomePerSecond,
  racePayout,
  sponsorMultiplier,
  upgradeCost,
} from '../game/economy';
import { showRewardedAd } from '../game/monetization';
import { Race, createRace, standings, stepRace } from '../game/race';
import { GameState, loadGame, saveGame } from '../game/save';
import { RACES_PER_SEASON, advanceSeason, awardPoints } from '../game/season';
import {
  Strategy,
  cycleCompound,
  cycleMode,
  isPitting,
  newStrategy,
  paceFactor,
  setMode,
  startPit,
  stepStrategy,
  tap,
} from '../game/strategy';
import { offlineEarnings } from '../game/offline';
import { Point, Track, pointAt } from '../game/track';
import { pickTrack } from '../game/tracks';
import { PanelHost, BOOST_SECONDS, TABS } from '../ui/panels';
import { askTeamName } from '../ui/teamName';
import { Button, COLORS, W, addBox, addButton, addText } from '../ui/widgets';

const VIEW = { y: 70, h: 400, padX: 90, padY: 30 };
const RACE_LAPS = 5;
// Game seconds per real second; ~90s laps would be too slow to watch.
const RACE_SPEED = 6;
const TITLE_GEMS = 5;

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private race!: Race;
  private strategy: Strategy = newStrategy();
  private track: Track = pickTrack();
  private panels!: PanelHost;

  private paid = false;
  private restartAt = 0;
  private restartDelay = 3000;
  private autoBuyTimer = 0;
  private autoTapTimer = 0;

  private teamText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private gemText!: Phaser.GameObjects.Text;
  private seasonText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private trackGfx!: Phaser.GameObjects.Graphics;
  private carGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;
  private compoundText!: Phaser.GameObjects.Text;
  private towerRows: Phaser.GameObjects.Text[] = [];
  private tabHighlight!: Phaser.GameObjects.Rectangle;
  private cards: { def: UpgradeDef; level: Phaser.GameObjects.Text; button: Button }[] = [];
  private modeBtn!: Button;
  private tyreBtn!: Button;
  private pitBtn!: Button;
  private speedBtn!: Button;
  private autoBtn!: Button;

  constructor() {
    super('Race');
  }

  create() {
    this.state = loadGame();
    this.drawHud();
    this.drawTrack();
    this.drawStrategyStrip();
    this.drawStats();
    this.drawUpgrades();
    this.banner = addText(this, W / 2 + 40, VIEW.y + VIEW.h / 2 - 20, '', 26)
      .setOrigin(0.5)
      .setAlign('center')
      .setBackgroundColor('#0b1020cc')
      .setPadding(14)
      .setVisible(false);
    this.panels = new PanelHost(this, () => this.state, { rename: () => void this.rename(true) });
    this.drawTabs();
    this.startRace();

    const away = offlineEarnings(this.state, Date.now());
    if (away.earned > 0) {
      this.state.money += away.earned;
      this.banner.setText(`Welcome back!\nEarned $${formatNumber(away.earned)}\nwhile away ${Math.round(away.seconds / 60)} min`).setVisible(true);
      this.time.delayedCall(4000, () => this.banner.setVisible(false));
    }

    this.time.addEvent({ delay: 5000, loop: true, callback: () => saveGame(this.state) });
    window.addEventListener('beforeunload', () => saveGame(this.state));
    if (!this.state.teamNamed) void this.rename(false);
  }

  private async rename(cancellable: boolean) {
    const name = await askTeamName(this.state.teamName, cancellable);
    if (!name) return;
    this.state.teamName = name;
    this.state.teamNamed = true;
    this.teamText.setText(name);
    saveGame(this.state);
  }

  private drawHud() {
    addBox(this, 0, 0, W, 70, COLORS.bg);
    this.teamText = addText(this, 16, 12, this.state.teamName, 22);
    this.seasonText = addText(this, 16, 40, '', 14, '#9aa7d0');
    this.moneyText = addText(this, W - 16, 12, '', 22).setOrigin(1, 0);
    this.gemText = addText(this, W - 16, 40, '', 14, '#9aa7d0').setOrigin(1, 0);
  }

  private toView(p: Point): Point {
    const areaW = W - VIEW.padX * 2;
    const areaH = VIEW.h - VIEW.padY * 2;
    const aspect = this.track.aspect;
    let w = areaW;
    let h = areaH;
    if (aspect !== undefined) {
      w = Math.min(areaW, areaH * aspect);
      h = w / aspect;
    }
    return { x: VIEW.padX + (areaW - w) / 2 + p.x * w, y: VIEW.y + VIEW.padY + (areaH - h) / 2 + p.y * h };
  }

  private drawTrack() {
    addBox(this, 0, VIEW.y, W, VIEW.h, 0x070a14);
    this.trackGfx = this.add.graphics();
    this.carGfx = this.add.graphics();
    this.barGfx = this.add.graphics();
    this.lapText = addText(this, W - 12, VIEW.y + 8, '', 14, '#9aa7d0').setOrigin(1, 0);
    this.towerRows = Array.from({ length: 20 }, (_, i) => addText(this, 8, VIEW.y + 6 + i * 17, '', 11));
    addText(this, W - 140, VIEW.y + 30, 'TYRES', 10, '#9aa7d0');
    addText(this, W - 140, VIEW.y + 58, 'BOOST', 10, '#9aa7d0');
    this.compoundText = addText(this, W - 12, VIEW.y + 30, '', 10, '#9aa7d0').setOrigin(1, 0);

    // The whole track view is a tap target; buttons added later sit on top of it.
    this.add
      .rectangle(0, VIEW.y, W, VIEW.h, 0x000000, 0)
      .setOrigin(0)
      .setInteractive()
      .on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));
  }

  private drawCircuit() {
    const pts = this.track.points.map((p) => {
      const v = this.toView(p);
      return new Phaser.Math.Vector2(v.x, v.y);
    });
    this.trackGfx.clear();
    this.trackGfx.lineStyle(15, 0xc9d1f0).strokePoints(pts, true, true);
    this.trackGfx.lineStyle(11, 0x2b3350).strokePoints(pts, true, true);
    this.trackGfx.lineStyle(1, 0x4a5580, 0.8).strokePoints(pts, true, true);

    // Start/finish line across the track at the first point.
    const a = pts[0];
    const b = pts[Math.min(3, pts.length - 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    this.trackGfx.lineStyle(3, 0xffffff).lineBetween(a.x - nx * 9, a.y - ny * 9, a.x + nx * 9, a.y + ny * 9);
  }

  private onTap(x: number, y: number) {
    tap(this.strategy, this.state.upgrades.tapPower ?? 0);
    const ring = this.add.circle(x, y, 8, 0xffffff, 0.35);
    this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
  }

  private drawStrategyStrip() {
    const y = VIEW.y + VIEW.h - 40;
    this.modeBtn = addButton(this, 10, y, 170, 34, '', () => cycleMode(this.strategy), { fill: 0x1d2745 });
    this.tyreBtn = addButton(this, 190, y, 170, 34, '', () => cycleCompound(this.strategy), { fill: 0x1d2745 });
    this.pitBtn = addButton(this, 370, y, 160, 34, 'PIT', () => startPit(this.strategy, this.state.upgrades.pitCrew ?? 0), {
      fill: 0xb8321f,
    });
  }

  private startRace() {
    this.track = pickTrack(Math.random, this.track.name);
    this.drawCircuit();
    this.race = createRace({
      track: this.track,
      laps: RACE_LAPS,
      season: this.state.season,
      playerRating: carRating(this.state.upgrades),
      playerTeamName: this.state.teamName,
      seed: Date.now() & 0x7fffffff,
    });
    this.strategy = newStrategy(this.strategy);
    this.restartAt = 0;
    this.paid = false;
    this.banner?.setVisible(false);
  }

  private renderRace() {
    const order = standings(this.race);
    this.carGfx.clear();
    for (const car of [...this.race.cars].reverse()) {
      const p = this.toView(pointAt(this.track, car.progress * this.track.length));
      this.carGfx.fillStyle(car.color).fillCircle(p.x, p.y, car.isPlayer ? 7 : 5);
      if (car.isPlayer) this.carGfx.lineStyle(2, 0xffffff).strokeCircle(p.x, p.y, 8);
    }
    order.forEach((car, i) => {
      const row = this.towerRows[i];
      row.setText(`${String(i + 1).padStart(2)} ${car.isPlayer ? car.driver : car.driver.split(' ').pop()?.slice(0, 10)}`);
      row.setColor(car.isPlayer ? '#ffd400' : '#cfd6ee');
    });
    const lap = Math.min(RACE_LAPS, Math.floor(order[0].progress) + 1);
    this.lapText.setText(this.race.finished ? 'FINISHED' : `${this.track.name} · Lap ${lap}/${RACE_LAPS}`);
  }

  private renderStrategy() {
    const s = this.strategy;
    const bar = (y: number, value: number, color: number) => {
      this.barGfx.fillStyle(0x1d2745).fillRect(W - 140, y, 128, 8);
      this.barGfx.fillStyle(color).fillRect(W - 140, y, 128 * value, 8);
    };
    this.barGfx.clear();
    bar(VIEW.y + 44, 1 - s.wear, s.wear > 0.7 ? 0xe03b2c : s.wear > 0.4 ? 0xe0b02c : 0x2cc07a);
    bar(VIEW.y + 72, s.boost, 0x2f6bff);
    this.compoundText.setText(s.compound.toUpperCase());

    this.modeBtn.setLabel(`MODE: ${s.mode.toUpperCase()}${s.modeCooldown > 0 ? ` (${Math.ceil(s.modeCooldown / RACE_SPEED)}s)` : ''}`);
    this.modeBtn.setState(s.modeCooldown <= 0, 0x1d2745);
    this.tyreBtn.setLabel(`NEXT TYRE: ${s.nextCompound.toUpperCase()}`);
    this.tyreBtn.setState(true, 0x1d2745);
    this.pitBtn.setLabel(isPitting(s) ? `PITTING... TAP! ${(s.pitRemaining / RACE_SPEED).toFixed(1)}s` : 'PIT');
    this.pitBtn.setState(!isPitting(s) && !this.race.finished, 0xb8321f);
  }

  private drawStats() {
    this.incomeText = addText(this, 16, 486, '', 18);
    this.speedBtn = addButton(
      this,
      300,
      478,
      110,
      44,
      '',
      async () => {
        if (this.state.boostSeconds <= 0 && (await showRewardedAd())) this.state.boostSeconds += BOOST_SECONDS;
      },
      { fill: COLORS.green },
    );
    this.autoBtn = addButton(
      this,
      420,
      478,
      110,
      44,
      '',
      () => {
        if (this.state.autoUnlocked) this.state.autoBuy = !this.state.autoBuy;
        else this.selectTab(TABS.indexOf('Shop'));
      },
      { fill: COLORS.bg },
    );
  }

  private drawUpgrades() {
    this.cards = UPGRADE_DEFS.map((def, i) => {
      const x = 12 + (i % 2) * 264;
      const y = 540 + Math.floor(i / 2) * 106;
      addBox(this, x, y, 252, 96);
      addText(this, x + 12, y + 10, def.name, 18);
      const level = addText(this, x + 12, y + 38, '', 14, '#9aa7d0');
      const button = addButton(this, x + 12, y + 62, 228, 26, '', () => {
        if (buyUpgrade(this.state, def)) this.applyRating();
      });
      return { def, level, button };
    });
  }

  private applyRating() {
    const rating = carRating(this.state.upgrades);
    for (const car of this.race.cars) if (car.isPlayer) car.rating = rating;
  }

  private renderEconomy() {
    const s = this.state;
    const rating = carRating(s.upgrades);
    this.moneyText.setText(`$ ${formatNumber(s.money)}`);
    this.gemText.setText(`Gems ${s.gems}`);
    this.seasonText.setText(`Season ${s.season} · Race ${s.race}/${RACES_PER_SEASON}`);
    this.incomeText.setText(`${formatNumber(incomePerSecond(rating, sponsorMultiplier(s)))} $/s · Rating ${Math.round(rating)}`);
    for (const { def, level, button } of this.cards) {
      const lv = s.upgrades[def.key] ?? 0;
      const price = upgradeCost(def, lv);
      level.setText(`Lv ${lv} · +${def.ratingPerLevel} rating`);
      button.setLabel(`UPGRADE  $${formatNumber(price)}`);
      button.setState(s.money >= price);
    }
    this.speedBtn.setLabel(s.boostSeconds > 0 ? `2X  ${Math.ceil(s.boostSeconds)}s` : '2X SPEED');
    this.autoBtn.setLabel(s.autoUnlocked ? `AUTO BUY ${s.autoBuy ? 'ON' : 'OFF'}` : 'AUTO BUY');
    this.autoBtn.setState(true, s.autoUnlocked && s.autoBuy ? COLORS.green : COLORS.bg);
    this.autoBtn.rect.setStrokeStyle(2, COLORS.accent);
  }

  private finishRace() {
    const order = standings(this.race);
    const positions = order.flatMap((c, i) => (c.isPlayer ? [i + 1] : []));
    this.state.money += racePayout(positions, this.state.season, sponsorMultiplier(this.state));
    awardPoints(this.state, order);

    const outcome = advanceSeason(this.state);
    if (outcome.type === 'season-won') {
      this.state.gems += TITLE_GEMS;
      this.banner.setText(`CHAMPIONS!\nSeason ${outcome.newSeason} unlocked\n+${TITLE_GEMS} gems`);
      this.restartDelay = 5000;
    } else if (outcome.type === 'season-lost') {
      this.banner.setText('Season over: not champions.\nReplaying the season');
      this.restartDelay = 5000;
    } else {
      this.banner.setText(`Race finished\nBest finish: P${positions[0]}`);
      this.restartDelay = 3000;
    }
    this.banner.setVisible(true);
    saveGame(this.state);
  }

  private drawTabs() {
    const y = 880;
    addBox(this, 0, y, W, 80, COLORS.bg);
    const w = W / TABS.length;
    this.tabHighlight = addBox(this, 6, y + 8, w - 12, 64, COLORS.panel).setStrokeStyle(2, COLORS.accent);
    TABS.forEach((t, i) => {
      addText(this, i * w + w / 2, y + 40, t, 14).setOrigin(0.5);
      this.add
        .rectangle(i * w, y, w, 80, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.selectTab(i));
    });
  }

  private selectTab(index: number) {
    this.panels.show(TABS[index]);
    this.tabHighlight.setX(index * (W / TABS.length) + 6);
  }

  private runAutos(dt: number) {
    const s = this.state;
    if (!s.autoUnlocked) return;
    if (s.autoBuy) {
      this.autoBuyTimer += dt;
      if (this.autoBuyTimer >= 0.5) {
        this.autoBuyTimer = 0;
        const def = pickAutoBuy(s.money, s.upgrades);
        if (def && buyUpgrade(s, def)) this.applyRating();
      }
    }
    if (s.autoTap) {
      this.autoTapTimer += dt;
      while (this.autoTapTimer >= 0.4) {
        this.autoTapTimer -= 0.4;
        tap(this.strategy, s.upgrades.tapPower ?? 0);
      }
    }
    if (s.autoStrategy && !this.race.finished) {
      const lead = Math.max(...this.race.cars.filter((c) => c.isPlayer).map((c) => c.progress));
      if (shouldAutoPit(this.strategy, lead, RACE_LAPS)) startPit(this.strategy, s.upgrades.pitCrew ?? 0);
      if (this.strategy.wear < 0.35 && this.strategy.mode !== 'push') setMode(this.strategy, 'push');
      else if (this.strategy.wear > 0.6 && this.strategy.mode === 'push') setMode(this.strategy, 'normal');
    }
  }

  update(_time: number, delta: number) {
    // Clamp so a backgrounded tab doesn't teleport the cars or the money.
    const dt = Math.min(delta, 100) / 1000;
    const s = this.state;
    const scale = s.boostSeconds > 0 ? 2 : 1;
    s.boostSeconds = Math.max(0, s.boostSeconds - dt);

    const rating = carRating(s.upgrades);
    s.money += incomePerSecond(rating, sponsorMultiplier(s)) * dt * scale;

    this.runAutos(dt);
    const gameDt = dt * RACE_SPEED * scale;
    stepStrategy(this.strategy, gameDt, {
      tapPower: s.upgrades.tapPower ?? 0,
      pitCrew: s.upgrades.pitCrew ?? 0,
      tyres: s.upgrades.tyres ?? 0,
    });
    stepRace(this.race, gameDt, paceFactor(this.strategy));

    if (this.race.finished && !this.paid) {
      this.paid = true;
      this.finishRace();
    }
    this.renderRace();
    this.renderStrategy();
    this.renderEconomy();
    this.panels.render();
    if (this.race.finished) {
      this.restartAt += delta;
      if (this.restartAt > this.restartDelay) this.startRace();
    }
  }
}
