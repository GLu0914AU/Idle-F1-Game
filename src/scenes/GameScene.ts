import Phaser from 'phaser';
import { autoSelectCompound, pickAutoBuy, shouldAutoPit } from '../game/auto';
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
import { canPrestige, effectiveUpgrades, prestige, researchPointsFor } from '../game/prestige';
import { sponsorIncome } from '../game/sponsors';
import { GameState, loadGame, saveGame } from '../game/save';
import { RACES_PER_SEASON, advanceSeason, awardPoints, driversTable } from '../game/season';
import {
  COMPOUNDS,
  Compound,
  PIT_HALF_LENGTH,
  Strategy,
  cycleMode,
  isPitting,
  newStrategy,
  selectCompound,
  setMode,
  stepStrategy,
  tap,
  togglePitRequest,
} from '../game/strategy';
import { offlineEarnings } from '../game/offline';
import { PLAYER_COLOR } from '../game/teams';
import { Point, Track, pointAt } from '../game/track';
import { pickTrack } from '../game/tracks';
import { PanelHost, BOOST_SECONDS, TABS } from '../ui/panels';
import { askTeamName } from '../ui/teamName';
import { Button, COLORS, W, addBox, addButton, addText } from '../ui/widgets';

const VIEW = { y: 70, h: 580, padX: 90, padTop: 30, padBottom: 80 };
const STRIP_H = 30;
const RACE_LAPS = 5;
// Game seconds per real second; ~90s laps would be too slow to watch.
const RACE_SPEED = 6;
const TITLE_GEMS = 5;
// The pit lane runs alongside the start/finish straight; distances are fractions of a lap.
const PIT_OFFSET = 15;
// Car drawing is 10 units long at scale 1; 1.7 makes it about 17px.
const CAR_SCALE = 1.7;

// Sideways offset of the pit route at t (0 entrance .. 1 exit): ramps out, runs parallel, ramps back.
const pitOffset = (t: number) => PIT_OFFSET * Math.max(0, Math.min(1, t / 0.15, (1 - t) / 0.15));
const COMPOUND_COLORS: Record<Compound, number> = { soft: 0xe03b2c, medium: 0xe0b02c, hard: 0xd8dcea };
const COMPOUND_LETTERS: Record<Compound, string> = { soft: 'S', medium: 'M', hard: 'H' };

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private race!: Race;
  private strategies: [Strategy, Strategy] = [newStrategy(), newStrategy()];
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
  private towerPoints: Phaser.GameObjects.Text[] = [];
  private towerBtn!: Button;
  // The list shows this race's running order, or each driver's points this season.
  private towerMode: 'race' | 'season' = 'race';
  private tabHighlight!: Phaser.GameObjects.Rectangle;
  private cards: { def: UpgradeDef; level: Phaser.GameObjects.Text; button: Button }[] = [];
  private modeBtns: Button[] = [];
  private tyreBtns: Partial<Record<Compound, Button>>[] = [{}, {}];
  private pitBtns: Button[] = [];
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
    this.panels = new PanelHost(this, () => this.state, {
      rename: () => void this.rename(true),
      prestige: () => this.doPrestige(),
      save: () => saveGame(this.state),
      onResearch: () => this.applyRating(),
    });
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
    const areaH = VIEW.h - VIEW.padTop - VIEW.padBottom;
    const aspect = this.track.aspect;
    let w = areaW;
    let h = areaH;
    if (aspect !== undefined) {
      w = Math.min(areaW, areaH * aspect);
      h = w / aspect;
    }
    return { x: VIEW.padX + (areaW - w) / 2 + p.x * w, y: VIEW.y + VIEW.padTop + (areaH - h) / 2 + p.y * h };
  }

  private drawTrack() {
    addBox(this, 0, VIEW.y, W, VIEW.h, 0x070a14);
    this.trackGfx = this.add.graphics();
    this.carGfx = this.add.graphics();
    this.barGfx = this.add.graphics();
    // The whole track view is a tap target; buttons added later sit on top of it.
    this.add
      .rectangle(0, VIEW.y, W, VIEW.h, 0x000000, 0)
      .setOrigin(0)
      .setInteractive()
      .on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));
    this.lapText = addText(this, W - 12, VIEW.y + 8, '', 14, '#9aa7d0').setOrigin(1, 0);
    this.towerRows = Array.from({ length: 20 }, (_, i) => addText(this, 8, VIEW.y + 30 + i * 16, '', 11));
    this.towerPoints = Array.from({ length: 20 }, (_, i) => addText(this, 150, VIEW.y + 30 + i * 16, '', 11).setOrigin(1, 0));
    this.towerBtn = addButton(this, 8, VIEW.y + 6, 142, 20, '', () => (this.towerMode = this.towerMode === 'race' ? 'season' : 'race'), {
      fill: 0x1d2745,
      size: 10,
    });
    addText(this, W - 140, VIEW.y + 30, 'TYRES', 10, '#9aa7d0');
    addText(this, W - 140, VIEW.y + 66, 'BOOST', 10, '#9aa7d0');
    this.compoundText = addText(this, W - 12, VIEW.y + 30, '', 10, '#9aa7d0').setOrigin(1, 0);
  }

  // View position at a distance along the lap, optionally shifted sideways (used for the pit lane).
  private trackPos(distance: number, offset = 0): Point {
    const len = this.track.length;
    const a = this.toView(pointAt(this.track, distance));
    if (offset === 0) return a;
    const b = this.toView(pointAt(this.track, distance + len * 0.002));
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x - ((b.y - a.y) / d) * offset, y: a.y + ((b.x - a.x) / d) * offset };
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

    // Pit lane: branches off at the entrance, runs beside the straight, and rejoins at the exit.
    const len = this.track.length;
    const lane: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const p = this.trackPos(len * (-PIT_HALF_LENGTH + 2 * PIT_HALF_LENGTH * t), pitOffset(t));
      lane.push(new Phaser.Math.Vector2(p.x, p.y));
    }
    this.trackGfx.lineStyle(9, 0x1d2540).strokePoints(lane, false, false);
    this.trackGfx.lineStyle(1, 0x6b78a8, 0.9).strokePoints(lane, false, false);

    // Start/finish line across the track.
    const a = this.trackPos(0, -6);
    const b = this.trackPos(0, 6);
    this.trackGfx.lineStyle(3, 0xffffff).lineBetween(a.x, a.y, b.x, b.y);
  }

  private onTap(x: number, y: number) {
    this.tapBoth();
    const ring = this.add.circle(x, y, 8, 0xffffff, 0.35);
    this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
  }

  // A tap charges both cars' boost, or speeds up whichever of them is in the pits.
  private tapBoth() {
    const power = this.eff().tapPower ?? 0;
    for (const s of this.strategies) tap(s, power);
  }

  // One row of controls per car: mode, next tyre compound, and the pit call.
  private drawStrategyStrip() {
    for (let i = 0; i < 2; i++) {
      const y = VIEW.y + VIEW.h - 2 * STRIP_H - 10 + i * (STRIP_H + 2);
      const s = () => this.strategies[i];
      addBox(this, 10, y, 22, STRIP_H - 2, PLAYER_COLOR);
      addText(this, 21, y + (STRIP_H - 2) / 2, String(i + 1), 14, '#0b1020').setOrigin(0.5);
      this.modeBtns[i] = addButton(this, 36, y, 112, STRIP_H - 2, '', () => cycleMode(s()), { fill: 0x1d2745, size: 12 });
      COMPOUNDS.forEach((c, k) => {
        this.tyreBtns[i][c] = addButton(this, 152 + k * 42, y, 38, STRIP_H - 2, COMPOUND_LETTERS[c], () => selectCompound(s(), c), {
          fill: COMPOUND_COLORS[c],
          size: 15,
        });
      });
      this.pitBtns[i] = addButton(this, 282, y, 248, STRIP_H - 2, 'PIT', () => togglePitRequest(s()), { fill: 0xb8321f, size: 12 });
    }
  }

  private startRace() {
    this.track = pickTrack(Math.random, this.track.name);
    this.drawCircuit();
    this.race = createRace({
      track: this.track,
      laps: RACE_LAPS,
      season: this.state.season,
      playerRating: carRating(this.eff()),
      playerTeamName: this.state.teamName,
      seed: Date.now() & 0x7fffffff,
    });
    this.strategies = [newStrategy(this.strategies[0]), newStrategy(this.strategies[1])];
    this.restartAt = 0;
    this.paid = false;
    this.banner?.setVisible(false);
  }

  // Top-down F1 car about 10px long (the road is 11px wide), nose pointing along `angle`.
  private drawCar(x: number, y: number, angle: number, color: number, isPlayer: boolean) {
    const g = this.carGfx;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Local coords: +u forward, +v to the right of travel.
    const rect = (u0: number, u1: number, v0: number, v1: number, fill: number) => {
      const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(
        ([u, v]) => new Phaser.Math.Vector2(x + (u * cos - v * sin) * CAR_SCALE, y + (u * sin + v * cos) * CAR_SCALE),
      );
      g.fillStyle(fill).fillPoints(corners, true);
    };
    if (isPlayer) g.lineStyle(1.5, 0xffffff, 0.9).strokeCircle(x, y, 6.5 * CAR_SCALE);
    const dark = 0x10131f;
    rect(-1.8, -0.2, -2.3, -1.2, dark); // rear wheels
    rect(-1.8, -0.2, 1.2, 2.3, dark);
    rect(2.2, 3.4, -2.2, -1.3, dark); // front wheels
    rect(2.2, 3.4, 1.3, 2.2, dark);
    rect(-5, -4, -2.3, 2.3, color); // rear wing
    rect(4, 5, -2.5, 2.5, color); // front wing
    rect(-4, 4.2, -0.9, 0.9, color); // body
    rect(-0.8, 0.6, -1.5, 1.5, color); // sidepods
    rect(-0.6, 0.8, -0.5, 0.5, dark); // cockpit
  }

  private renderRace() {
    const order = standings(this.race);
    this.carGfx.clear();
    for (const car of [...this.race.cars].reverse()) {
      const dist = car.progress * this.track.length;
      const t = car.pit ? (car.progress - car.pit.start) / (2 * PIT_HALF_LENGTH) : 0;
      const p = this.trackPos(dist, car.pit ? pitOffset(t) : 0);
      const ahead = this.trackPos(dist + this.track.length * 0.002, car.pit ? pitOffset(t) : 0);
      const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x);
      this.drawCar(p.x, p.y, angle, car.color, car.isPlayer);
    }
    const shortName = (isPlayer: boolean, name: string) => (isPlayer ? name : name.split(' ').pop()?.slice(0, 10) ?? name);
    if (this.towerMode === 'race') {
      order.forEach((car, i) => {
        const row = this.towerRows[i];
        const compound = car.isPlayer ? this.strategies[car.id === 'player-0' ? 0 : 1].compound : car.tyres?.compound;
        const tyre = compound ? COMPOUND_LETTERS[compound] : ' ';
        row.setText(`${String(i + 1).padStart(2)} ${tyre} ${shortName(car.isPlayer, car.driver)}`);
        row.setColor(car.isPlayer ? '#ffd400' : '#cfd6ee');
        this.towerPoints[i].setText('');
      });
    } else {
      driversTable(this.state).forEach((d, i) => {
        this.towerRows[i].setText(`${String(i + 1).padStart(2)} ${shortName(d.isPlayer, d.name)}`);
        this.towerRows[i].setColor(d.isPlayer ? '#ffd400' : '#cfd6ee');
        this.towerPoints[i].setText(String(d.points)).setColor(d.isPlayer ? '#ffd400' : '#cfd6ee');
      });
    }
    this.towerBtn.setLabel(this.towerMode === 'race' ? 'RACE ▸ SEASON' : 'SEASON ▸ RACE');
    const lap = Math.min(RACE_LAPS, Math.floor(order[0].progress) + 1);
    this.lapText.setText(this.race.finished ? 'FINISHED' : `${this.track.name} · Lap ${lap}/${RACE_LAPS}`);
  }

  private renderStrategy() {
    const bar = (y: number, h: number, value: number, color: number) => {
      this.barGfx.fillStyle(0x1d2745).fillRect(W - 140, y, 128, h);
      this.barGfx.fillStyle(color).fillRect(W - 140, y, 128 * value, h);
    };
    this.barGfx.clear();
    this.strategies.forEach((s, i) => bar(VIEW.y + 44 + i * 9, 6, 1 - s.wear, s.wear > 0.7 ? 0xe03b2c : s.wear > 0.4 ? 0xe0b02c : 0x2cc07a));
    bar(VIEW.y + 78, 8, Math.max(...this.strategies.map((s) => s.boost)), 0x2f6bff);
    this.compoundText.setText(this.strategies.map((s) => s.compound[0].toUpperCase()).join(' '));

    this.strategies.forEach((s, i) => {
      this.modeBtns[i].setLabel(`${s.mode.toUpperCase()}${s.modeCooldown > 0 ? ` (${Math.ceil(s.modeCooldown / RACE_SPEED)}s)` : ''}`);
      this.modeBtns[i].setState(s.modeCooldown <= 0, 0x1d2745);
      COMPOUNDS.forEach((c) => {
        const btn = this.tyreBtns[i][c];
        if (!btn) return;
        btn.rect.setStrokeStyle(c === s.nextCompound ? 4 : 2, c === s.nextCompound ? 0xffffff : COLORS.border);
        btn.label.setColor('#0b1020');
      });
      const pit = this.pitBtns[i];
      if (isPitting(s)) {
        pit.setLabel(`IN PITS: TAP! ${(s.pitRemaining / RACE_SPEED).toFixed(1)}s`);
      } else if (s.pitRequested) {
        pit.setLabel(`BOX THIS LAP: ${s.nextCompound.toUpperCase()} (cancel)`);
      } else {
        pit.setLabel('PIT NEXT LAP');
      }
      pit.setState(!isPitting(s) && !this.race.finished, s.pitRequested ? 0xe08a1f : 0xb8321f);
    });
  }

  private drawStats() {
    const y = VIEW.y + VIEW.h + 6;
    this.incomeText = addText(this, 16, y + 8, '', 16);
    this.speedBtn = addButton(
      this,
      300,
      y,
      110,
      34,
      '',
      async () => {
        if (this.state.boostSeconds <= 0 && (await showRewardedAd())) this.state.boostSeconds += BOOST_SECONDS;
      },
      { fill: COLORS.green },
    );
    this.autoBtn = addButton(
      this,
      420,
      y,
      110,
      34,
      '',
      () => {
        if (this.state.autoUnlocked) this.state.autoBuy = !this.state.autoBuy;
        else this.selectTab(TABS.indexOf('Shop'));
      },
      { fill: COLORS.bg },
    );
  }

  private drawUpgrades() {
    const top = VIEW.y + VIEW.h + 48;
    this.cards = UPGRADE_DEFS.map((def, i) => {
      const x = 12 + (i % 3) * 176;
      const y = top + Math.floor(i / 3) * 80;
      addBox(this, x, y, 168, 74);
      addText(this, x + 10, y + 6, def.name, 16);
      const level = addText(this, x + 10, y + 27, '', 12, '#9aa7d0');
      const button = addButton(this, x + 10, y + 46, 148, 22, '', () => {
        if (buyUpgrade(this.state, def)) this.applyRating();
      }, { size: 12 });
      return { def, level, button };
    });
  }

  // Upgrade levels including free levels from research.
  private eff() {
    return effectiveUpgrades(this.state);
  }

  private applyRating() {
    const rating = carRating(this.eff());
    for (const car of this.race.cars) if (car.isPlayer) car.rating = rating;
  }

  private renderEconomy() {
    const s = this.state;
    const rating = carRating(this.eff());
    this.moneyText.setText(`$ ${formatNumber(s.money)}`);
    this.gemText.setText(`Gems ${s.gems} · RP ${s.researchPoints}`);
    this.seasonText.setText(`Season ${s.season} · Race ${s.race}/${RACES_PER_SEASON}`);
    this.incomeText.setText(`${formatNumber(incomePerSecond(rating, sponsorMultiplier(s)))} $/s · Rating ${Math.round(rating)}`);
    for (const { def, level, button } of this.cards) {
      const lv = s.upgrades[def.key] ?? 0;
      const price = upgradeCost(def, lv);
      level.setText(`Lv ${lv} · +${def.ratingPerLevel} rating`);
      button.setLabel(`$${formatNumber(price)}`);
      button.setState(s.money >= price);
    }
    this.speedBtn.setLabel(s.boostSeconds > 0 ? `2X  ${Math.ceil(s.boostSeconds)}s` : '2X SPEED');
    this.autoBtn.setLabel(s.autoUnlocked ? `AUTO BUY ${s.autoBuy ? 'ON' : 'OFF'}` : 'AUTO BUY');
    this.autoBtn.setState(true, s.autoUnlocked && s.autoBuy ? COLORS.green : COLORS.bg);
    this.autoBtn.rect.setStrokeStyle(2, COLORS.accent);
  }

  private doPrestige() {
    if (!canPrestige(this.state)) return;
    const from = this.state.season;
    const earned = prestige(this.state);
    this.startRace();
    this.banner.setText(`Prestiged from Season ${from}\n+${earned} research points\nBack to Season 1`).setVisible(true);
    this.time.delayedCall(4000, () => this.banner.setVisible(false));
    saveGame(this.state);
  }

  private finishRace() {
    const order = standings(this.race);
    const positions = order.flatMap((c, i) => (c.isPlayer ? [i + 1] : []));
    this.state.money += racePayout(positions, this.state.season, sponsorMultiplier(this.state));
    awardPoints(this.state, order);

    const outcome = advanceSeason(this.state);
    if (outcome.type === 'season-won') {
      this.state.gems += TITLE_GEMS;
      const sponsorCash = sponsorIncome(this.state);
      this.state.money += sponsorCash;
      const title = outcome.oneTwo
        ? "DRIVERS' 1-2 + CONSTRUCTORS!\nSkipping 2 seasons"
        : outcome.constructors
          ? "DRIVERS' + CONSTRUCTORS!\nSkipping a season"
          : "DRIVERS' CHAMPION!";
      this.banner.setText(
        `${title}\nSeason ${outcome.newSeason} unlocked\n+${TITLE_GEMS} gems${sponsorCash > 0 ? `\nSponsors pay $${formatNumber(sponsorCash)}` : ''}`,
      );
      this.restartDelay = 5000;
    } else if (outcome.type === 'season-lost') {
      const rp = researchPointsFor(this.state.season);
      this.banner.setText(
        `Season over: no drivers' title.\nReplaying the season${rp > 0 ? `\nOr prestige for ${rp} RP (Prestige tab)` : ''}`,
      );
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
        this.tapBoth();
      }
    }
    if (s.autoStrategy && !this.race.finished) {
      this.strategies.forEach((st, i) => {
        const car = this.race.cars.find((c) => c.id === `player-${i}`)!;
        if (shouldAutoPit(st, car.progress, RACE_LAPS)) {
          // The player's own tyre choice always wins over Auto's.
          autoSelectCompound(st, car.progress, RACE_LAPS);
          togglePitRequest(st);
        }
        if (st.wear < 0.35 && st.mode !== 'push') setMode(st, 'push');
        else if (st.wear > 0.6 && st.mode === 'push') setMode(st, 'normal');
      });
    }
  }

  update(_time: number, delta: number) {
    // Clamp so a backgrounded tab doesn't teleport the cars or the money.
    const dt = Math.min(delta, 100) / 1000;
    const s = this.state;
    const scale = s.boostSeconds > 0 ? 2 : 1;
    s.boostSeconds = Math.max(0, s.boostSeconds - dt);

    const eff = this.eff();
    const rating = carRating(eff);
    s.money += incomePerSecond(rating, sponsorMultiplier(s)) * dt * scale;

    this.runAutos(dt);
    const gameDt = dt * RACE_SPEED * scale;
    const levels = {
      tapPower: eff.tapPower ?? 0,
      pitCrew: eff.pitCrew ?? 0,
      tyres: eff.tyres ?? 0,
      tyreScience: eff.tyreScience ?? 0,
      energyRecovery: eff.energyRecovery ?? 0,
    };
    for (const st of this.strategies) stepStrategy(st, gameDt, levels);
    stepRace(this.race, gameDt, 1, {
      strategies: this.strategies,
      pitCrew: eff.pitCrew ?? 0,
      handling: { topSpeed: eff.topSpeed ?? 0, cornering: eff.cornering ?? 0 },
    });
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
