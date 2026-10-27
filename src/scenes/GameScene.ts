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
import { FREE_LEVELS_PER_RESEARCH, buyResearch, canPrestige, effectiveUpgrades, pickAutoResearch, prestige, researchPointsFor } from '../game/prestige';
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
import { Point, Track, pointAt } from '../game/track';
import { pickTrack } from '../game/tracks';
import { PanelHost, BOOST_SECONDS, TABS } from '../ui/panels';
import { askTeamName, askText } from '../ui/teamName';
import { drawScenery, themeFor } from '../ui/scenery';
import { recordRace, recordSeason } from '../game/career';
import { Button, COLORS, W, addBox, addButton, addSlant, addText, fillPoly } from '../ui/widgets';

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
  private rpText!: Phaser.GameObjects.Text;
  private seasonText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private trackGfx!: Phaser.GameObjects.Graphics;
  private sceneryGfx!: Phaser.GameObjects.Graphics;
  private carGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;
  private compoundText!: Phaser.GameObjects.Text;
  private towerRows: Phaser.GameObjects.Text[] = [];
  private towerPoints: Phaser.GameObjects.Text[] = [];
  private towerBtn!: Button;
  // The list shows this race's running order, or each driver's points this season.
  private towerMode: 'race' | 'season' = 'race';
  private tabHighlight!: Phaser.GameObjects.Rectangle;
  private stripChips: Phaser.GameObjects.Rectangle[] = [];
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
      renameDriver: (i) => void this.renameDriver(i),
      recolour: () => this.applyIdentity(),
      incomePerSecond: () => incomePerSecond(carRating(this.eff()), sponsorMultiplier(this.state)),
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

  private async renameDriver(index: number) {
    const name = await askText(`Driver ${index + 1} name`, this.state.driverNames[index], true);
    if (!name) return;
    this.state.driverNames[index] = name;
    this.applyIdentity();
    saveGame(this.state);
  }

  // Pushes the player's chosen driver names and colour into the live race and strategy strip.
  private applyIdentity() {
    this.race.cars.forEach((car) => {
      if (!car.isPlayer) return;
      car.driver = this.state.driverNames[car.id === 'player-0' ? 0 : 1];
      car.color = this.state.teamColor;
    });
    this.stripChips.forEach((chip) => chip.setFillStyle(this.state.teamColor));
  }

  private async rename(cancellable: boolean) {
    const name = await askTeamName(this.state.teamName, cancellable);
    if (!name) return;
    this.state.teamName = name;
    this.state.teamNamed = true;
    this.teamText.setText(name.toUpperCase());
    saveGame(this.state);
  }

  private drawHud() {
    addBox(this, 0, 0, W, 70, COLORS.bg).setStrokeStyle(0);
    // Broadcast-style header: red team tag on the left, gold money badge on the right.
    addSlant(this, -12, 6, 300, 36, COLORS.red, 18);
    addSlant(this, 282, 6, 6, 36, 0xffffff, 6);
    this.teamText = addText(this, 20, 10, this.state.teamName.toUpperCase(), 22).setFixedSize(250, 0);
    this.seasonText = addText(this, 20, 46, '', 14, '#9aa7d0');
    addSlant(this, W - 190, 6, 200, 36, 0x1a2342, 18);
    addSlant(this, W - 190, 6, 6, 36, COLORS.gold, 6);
    this.moneyText = addText(this, W - 22, 10, '', 22, '#ffc933').setOrigin(1, 0);
    const g = this.add.graphics();
    // Gem (cyan diamond) and research point (purple hexagon) icons.
    const gx = W - 196;
    g.fillStyle(0x4de3ff);
    fillPoly(g, [{ x: gx + 6, y: 49 }, { x: gx + 12, y: 55 }, { x: gx + 6, y: 63 }, { x: gx, y: 55 }]);
    const hx = W - 96;
    const hex = Array.from({ length: 6 }, (_, i) => ({ x: hx + 6 + Math.cos((i * Math.PI) / 3) * 7, y: 56 + Math.sin((i * Math.PI) / 3) * 7 }));
    g.fillStyle(0xb48cff);
    fillPoly(g, hex);
    this.gemText = addText(this, gx + 18, 47, '', 14, '#cfe9ff');
    this.rpText = addText(this, hx + 18, 47, '', 14, '#e0ccff');
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
    addBox(this, 0, VIEW.y, W, VIEW.h, 0x0c1f15).setStrokeStyle(0);
    this.sceneryGfx = this.add.graphics();
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
    addBox(this, 4, VIEW.y + 3, 152, 355, 0x050914).setAlpha(0.85).setStrokeStyle(1, 0x2a365e);
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
    // Pit lane: branches off at the entrance, runs beside the straight, and rejoins at the exit.
    const len = this.track.length;
    const lane: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const p = this.trackPos(len * (-PIT_HALF_LENGTH + 2 * PIT_HALF_LENGTH * t), pitOffset(t));
      lane.push(new Phaser.Math.Vector2(p.x, p.y));
    }

    this.sceneryGfx.clear();
    drawScenery(this.sceneryGfx, { name: this.track.name, road: pts, lane, rect: { x: 0, y: VIEW.y, w: W, h: VIEW.h } });
    const theme = themeFor(this.track.name);

    this.trackGfx.clear();
    // Shadowed edge, gravel runoff, red/white kerbs, then asphalt with a racing line.
    this.trackGfx.lineStyle(34, theme.edge, 0.55).strokePoints(pts, true, true);
    this.trackGfx.lineStyle(26, 0x3d3a2c).strokePoints(pts, true, true);
    const seg = 160;
    for (let i = 0; i < seg; i++) {
      const a = this.trackPos((i / seg) * this.track.length);
      const b = this.trackPos(((i + 1.2) / seg) * this.track.length);
      this.trackGfx.lineStyle(18, i % 2 ? 0xf2f2f2 : COLORS.red).lineBetween(a.x, a.y, b.x, b.y);
    }
    this.trackGfx.lineStyle(13, 0x30343f).strokePoints(pts, true, true);
    this.trackGfx.lineStyle(1, 0x5a6075, 0.6).strokePoints(pts, true, true);
    this.trackGfx.lineStyle(9, 0x262b3a).strokePoints(lane, false, false);
    this.trackGfx.lineStyle(1, 0xf2c94c, 0.9).strokePoints(lane, false, false);

    // Chequered start/finish line across the track.
    for (let k = 0; k < 4; k++) {
      const a = this.trackPos(0, -6 + k * 3);
      const b = this.trackPos(0, -3 + k * 3);
      this.trackGfx.lineStyle(3, k % 2 ? 0x111111 : 0xffffff).lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  private onTap(x: number, y: number) {
    this.tapBoth();
    this.spawnBurst(x, y, [0xffffff, COLORS.gold, COLORS.red], 6);
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
      this.stripChips[i] = addBox(this, 10, y, 22, STRIP_H - 2, this.state.teamColor);
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
      playerDrivers: this.state.driverNames,
      playerColor: this.state.teamColor,
      playerReliability: this.eff().reliability ?? 0,
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
    for (const car of this.race.cars) {
      if (car.isPlayer && car.fault?.started && !car.fault.announced) {
        car.fault.announced = true;
        this.floatText(W / 2, VIEW.y + 250, car.fault.dnf ? `${car.driver}: ENGINE FAILURE, OUT!` : `${car.driver}: BREAKDOWN!`, '#ff5a4a');
      }
    }
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
        const tyre = car.dnf ? 'X' : car.fault?.started && car.fault.remaining > 0 ? '!' : compound ? COMPOUND_LETTERS[compound] : ' ';
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
        const issue = this.race.cars.find((c) => c.id === `player-${i}`)?.pit?.issue;
        const t = (s.pitRemaining / RACE_SPEED).toFixed(1);
        pit.setLabel(issue ? `${issue}! TAP! ${t}s` : `IN PITS: TAP! ${t}s`);
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
      addBox(this, x, y, 5, 74, COLORS.red).setStrokeStyle(0);
      addText(this, x + 14, y + 6, def.name.toUpperCase(), 16);
      const level = addText(this, x + 14, y + 27, '', 12, '#9aa7d0');
      const button = addButton(this, x + 14, y + 46, 144, 22, '', () => {
        if (buyUpgrade(this.state, def)) {
          this.applyRating();
          this.spawnBurst(x + 84, y + 57, [COLORS.gold, 0xffffff], 8);
        }
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
    this.gemText.setText(String(s.gems));
    this.rpText.setText(`${s.researchPoints} RP`);
    this.seasonText.setText(`Season ${s.season} · Race ${s.race}/${RACES_PER_SEASON}`);
    this.incomeText.setText(`${formatNumber(incomePerSecond(rating, sponsorMultiplier(s)))} $/s · Rating ${Math.round(rating)}`);
    for (const { def, level, button } of this.cards) {
      const lv = s.upgrades[def.key] ?? 0;
      const free = (s.research[def.key] ?? 0) * FREE_LEVELS_PER_RESEARCH;
      const price = upgradeCost(def, lv);
      level.setText(`Lv ${lv + free}${free ? ` (+${free} R&D)` : ''} · +${def.ratingPerLevel}/lvl`);
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
    const payout = racePayout(positions, this.state.season, sponsorMultiplier(this.state));
    this.state.money += payout;
    this.floatText(W - 90, 70, `+$${formatNumber(payout)}`, '#ffc933');
    awardPoints(this.state, order);
    recordRace(this.state, order[0].isPlayer);

    const outcome = advanceSeason(this.state);
    recordSeason(this.state, outcome);
    if (outcome.type === 'season-won') {
      this.confetti();
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
    addBox(this, 0, y, W, 80, COLORS.bg).setStrokeStyle(0);
    this.add.rectangle(0, y, W, 3, COLORS.red).setOrigin(0);
    const w = W / TABS.length;
    this.tabHighlight = addBox(this, 6, y + 8, w - 12, 64, COLORS.panel).setStrokeStyle(2, COLORS.accent);
    const g = this.add.graphics();
    TABS.forEach((t, i) => {
      this.drawTabIcon(g, t, i * w + w / 2, y + 28);
      addText(this, i * w + w / 2, y + 54, t.toUpperCase(), 13).setOrigin(0.5);
      this.add
        .rectangle(i * w, y, w, 80, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.selectTab(i));
    });
  }

  private drawTabIcon(g: Phaser.GameObjects.Graphics, tab: string, cx: number, cy: number) {
    const white = 0xffffff;
    if (tab === 'Race') {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.fillStyle((r + c) % 2 ? 0x333a55 : white).fillRect(cx - 12 + c * 6, cy - 9 + r * 6, 6, 6);
    } else if (tab === 'Team') {
      g.fillStyle(white).fillCircle(cx - 6, cy - 4, 5).fillCircle(cx + 7, cy - 2, 4);
      g.fillRect(cx - 12, cy + 3, 12, 7).fillRect(cx + 2, cy + 4, 10, 6);
    } else if (tab === 'Sponsors') {
      g.fillStyle(COLORS.gold).fillCircle(cx, cy, 11);
      g.fillStyle(0x0b1020).fillRect(cx - 1, cy - 7, 2, 14).fillRect(cx - 5, cy - 4, 10, 2).fillRect(cx - 5, cy + 2, 10, 2);
    } else if (tab === 'Prestige') {
      g.fillStyle(0xb48cff);
      fillPoly(g, [{ x: cx, y: cy - 11 }, { x: cx + 11, y: cy + 1 }, { x: cx + 4, y: cy + 1 }, { x: cx + 4, y: cy + 10 }, { x: cx - 4, y: cy + 10 }, { x: cx - 4, y: cy + 1 }, { x: cx - 11, y: cy + 1 }]);
    } else {
      g.fillStyle(0x4de3ff);
      fillPoly(g, [{ x: cx - 10, y: cy - 4 }, { x: cx - 5, y: cy - 10 }, { x: cx + 5, y: cy - 10 }, { x: cx + 10, y: cy - 4 }, { x: cx, y: cy + 10 }]);
    }
  }

  private selectTab(index: number) {
    this.panels.show(TABS[index]);
    this.tweens.add({ targets: this.tabHighlight, x: index * (W / TABS.length) + 6, duration: 140, ease: 'Cubic.easeOut' });
  }

  // Small burst of particles, used for taps, purchases and wins.
  private spawnBurst(x: number, y: number, colors: number[], count: number) {
    for (let i = 0; i < count; i++) {
      const p = this.add.rectangle(x, y, 4, 4, colors[i % colors.length]).setDepth(50);
      const ang = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 30;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        angle: 180,
        duration: 400,
        onComplete: () => p.destroy(),
      });
    }
  }

  private floatText(x: number, y: number, s: string, color: string) {
    const t = addText(this, x, y, s, 20, color).setOrigin(0.5).setDepth(50).setStroke('#000000', 4);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  private confetti() {
    const colors = [COLORS.red, COLORS.gold, 0xffffff, 0x4de3ff, 0xb48cff];
    for (let i = 0; i < 70; i++) {
      const p = this.add.rectangle(Math.random() * W, VIEW.y - 10, 6, 10, colors[i % colors.length]).setDepth(50);
      this.tweens.add({
        targets: p,
        y: VIEW.y + VIEW.h,
        x: p.x + (Math.random() - 0.5) * 80,
        angle: 360 * (Math.random() < 0.5 ? 1 : -1),
        duration: 1500 + Math.random() * 1500,
        delay: Math.random() * 600,
        onComplete: () => p.destroy(),
      });
    }
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
    if (s.autoResearch) {
      const def = pickAutoResearch(s);
      if (def && buyResearch(s, def)) this.applyRating();
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
