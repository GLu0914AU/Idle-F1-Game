import Phaser from 'phaser';
import { pickAutoBuy } from '../game/auto';
import { ENGINEER_REVIEW_SECONDS, reviewStrategy } from '../game/engineers';
import { autoPayWages, nextInstalment, owedInstalments, payInstalment, payrollReserve, staffEffects, totalPayroll, wagesOwed } from '../game/staff';
import {
  UPGRADE_DEFS,
  UpgradeDef,
  buyUpgrade,
  carRating,
  formatNumber,
  incomePerSecond,
  sponsorMultiplier,
  upgradeCost,
} from '../game/economy';
import { showRewardedAd } from '../game/monetization';
import { Race, createRace, standings, stepRace } from '../game/race';
import { FREE_LEVELS_PER_RESEARCH, buyResearch, canPrestige, effectiveUpgrades, pickAutoResearch, prestige, researchPointsFor } from '../game/prestige';
import { driverRating } from '../game/drivers';
import { TITLE_GEMS, settleRace } from '../game/settle';
import { describeWeather, idealClass, isDry, rollWeather } from '../game/weather';
import { GameState, loadGame, resetGame, saveGame } from '../game/save';
import { RACES_PER_SEASON, driversTable } from '../game/season';
import { packageDef } from '../game/development';
import { achievementDef, claimableCount, readyAchievements, recordEvent, recordRaceResult } from '../game/goals';
import { playSound, setEngine, syncAudio, unlockAudio } from '../game/audio';
import { GAME_H, GAME_W, RES } from '../resolution';
import {
  COMPOUNDS,
  Compound,
  PIT_HALF_LENGTH,
  Strategy,
  cycleMode,
  isPitting,
  newStrategy,
  selectCompound,
  stepStrategy,
  tap,
  togglePitRequest,
} from '../game/strategy';
import { offlineEarnings } from '../game/offline';
import { OfflineReport, applyOffline, simulateOffline } from '../game/offlineRaces';
import { Point, Track, pointAt } from '../game/track';
import { pickTrack } from '../game/tracks';
import { PanelHost, BOOST_SECONDS, TABS } from '../ui/panels';
import { askTeamName } from '../ui/teamName';
import { Tutorial } from '../ui/tutorial';
import { restartTutorial } from '../game/tutorial';
import { drawScenery, themeFor } from '../ui/scenery';
import { researchInfo, upgradeInfo } from '../game/upgradeInfo';
import { Button, COLORS, W, addBox, addButton, addSlant, addText, fillPoly } from '../ui/widgets';

const VIEW = { y: 70, h: 580, padX: 90, padTop: 30, padBottom: 80 };
const STRIP_H = 30;
const RACE_LAPS = 5;
// Game seconds per real second; ~90s laps would be too slow to watch.
const RACE_SPEED = 6;
// The pit lane runs alongside the start/finish straight; distances are fractions of a lap.
const PIT_OFFSET = 15;
// Car drawing is 10 units long at scale 1; 1.7 makes it about 17px.
const CAR_SCALE = 1.7;

// Sideways offset of the pit route at t (0 entrance .. 1 exit): ramps out, runs parallel, ramps back.
const pitOffset = (t: number) => PIT_OFFSET * Math.max(0, Math.min(1, t / 0.15, (1 - t) / 0.15));
const COMPOUND_COLORS: Record<Compound, number> = { soft: 0xe03b2c, medium: 0xe0b02c, hard: 0xd8dcea, intermediate: 0x2fbf5a, wet: 0x3b8bff };
const COMPOUND_LETTERS: Record<Compound, string> = { soft: 'S', medium: 'M', hard: 'H', intermediate: 'I', wet: 'W' };
const COMPOUND_SHORT: Record<Compound, string> = { soft: 'SOFT', medium: 'MEDIUM', hard: 'HARD', intermediate: 'INTER', wet: 'WET' };

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
  private engineerTimer = 0;

  private teamText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private wageText!: Phaser.GameObjects.Text;
  private gemText!: Phaser.GameObjects.Text;
  private rpText!: Phaser.GameObjects.Text;
  private cloutText!: Phaser.GameObjects.Text;
  private seasonText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private trackGfx!: Phaser.GameObjects.Graphics;
  private sceneryGfx!: Phaser.GameObjects.Graphics;
  private carGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;
  private compoundText!: Phaser.GameObjects.Text;
  private weatherText!: Phaser.GameObjects.Text;
  private goalsDot!: Phaser.GameObjects.Arc;
  private seenReady = new Set<string>();
  private seenReadyArmed = false;
  private awayPending: OfflineReport | null = null;
  private countedPits = new WeakSet<object>();
  private safetyCarText!: Phaser.GameObjects.Text;
  private gridText?: Phaser.GameObjects.Text;
  private wetShade!: Phaser.GameObjects.Rectangle;
  private rainGfx!: Phaser.GameObjects.Graphics;
  private towerRows: Phaser.GameObjects.Text[] = [];
  private towerPoints: Phaser.GameObjects.Text[] = [];
  private towerBtn!: Button;
  private towerFold!: Button;
  private towerBox!: Phaser.GameObjects.Rectangle;
  // The list shows this race's running order, or each driver's points this season.
  private towerMode: 'race' | 'season' = 'race';
  private tabHighlight!: Phaser.GameObjects.Rectangle;
  private safetyCarSounded = false;
  private resetting = false;
  private tutorial!: Tutorial;
  private stripChips: Phaser.GameObjects.Rectangle[] = [];
  private cards: { def: UpgradeDef; level: Phaser.GameObjects.Text; button: Button }[] = [];
  private info!: { box: Phaser.GameObjects.Container; title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text; key: string | null; research: boolean };
  private modeBtns: Button[] = [];
  private tyreBtns: Partial<Record<Compound, Button>>[] = [{}, {}];
  private pitBtns: Button[] = [];
  private speedBtn!: Button;
  private payBtn!: Button;
  private autoBtn!: Button;

  constructor() {
    super('Race');
  }

  create() {
    this.cameras.main.setZoom(RES).centerOn(GAME_W / 2, GAME_H / 2);
    this.state = loadGame();
    syncAudio(this.state.settings);
    this.input.on('pointerdown', () => unlockAudio());
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
      resetSave: () => {
        this.resetting = true;
        resetGame();
        window.location.reload();
      },
      recolour: () => this.applyIdentity(),
      incomePerSecond: () => incomePerSecond(carRating(this.eff()), sponsorMultiplier(this.state)),
      prestige: () => this.doPrestige(),
      save: () => this.persist(),
      onResearch: () => this.applyRating(),
      onDriversChanged: () => {
        this.applyIdentity();
        this.applyRating();
      },
      onInfo: (key) => this.openInfo(key, true),
      replayTutorial: () => {
        restartTutorial(this.state);
        this.persist();
      },
    });
    this.drawTabs();
    this.buildInfoPopup();
    this.startRace();
    const cardTop = VIEW.y + VIEW.h + 48;
    const stripTop = VIEW.y + VIEW.h - 2 * STRIP_H - 12;
    this.tutorial = new Tutorial(
      this,
      () => this.state,
      {
        track: { x: 0, y: VIEW.y, w: W, h: VIEW.h },
        card: { x: 12, y: cardTop, w: 168, h: 74 },
        strip: { x: 0, y: stripTop, w: W, h: 2 * STRIP_H + 6 },
        tabs: { x: 0, y: 880, w: W, h: 80 },
      },
      {
        prepare: (step) => {
          this.selectTab(0);
          this.panels.openProfile(false);
          this.panels.openAuto(false);
          this.panels.openGoals(false);
          // The first purchase must be affordable, or the guide could stall.
          if (step === 'buy') {
            const def = UPGRADE_DEFS[0];
            this.state.money = Math.max(this.state.money, upgradeCost(def, this.state.upgrades[def.key] ?? 0));
          }
        },
        onClaim: () => {
          playSound('claim');
          this.persist();
        },
      },
    );

    const report = simulateOffline(this.state, Date.now());
    if (report && report.races > 0) {
      this.showAway(report);
    } else {
      const away = offlineEarnings(this.state, Date.now());
      if (away.earned > 0) {
        this.state.money += away.earned;
        this.banner.setText(`Welcome back!\nEarned $${formatNumber(away.earned)}\nwhile away ${Math.round(away.seconds / 60)} min`).setVisible(true);
        this.time.delayedCall(4000, () => this.banner.setVisible(false));
      }
    }

    this.time.addEvent({ delay: 5000, loop: true, callback: () => this.persist() });
    window.addEventListener('beforeunload', () => this.persist());
    if (!this.state.teamNamed) void this.rename(false);
  }

  // Saves are held back while away results are waiting, so a refresh can't lose them.
  private persist() {
    if (!this.awayPending && !this.resetting) saveGame(this.state);
  }

  private showAway(report: OfflineReport) {
    this.awayPending = report;
    const c = this.add.container(0, 0).setDepth(2000);
    addBox(this, 0, 0, W, GAME_H, COLORS.bg, c).setStrokeStyle(0).setInteractive();
    c.add(this.add.rectangle(W / 2, 114, 120, 3, COLORS.red));
    c.add(addText(this, W / 2, 120, 'WHILE YOU WERE AWAY', 26).setOrigin(0.5, 0));
    const mins = Math.round(report.seconds / 60);
    const time = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
    c.add(addText(this, W / 2, 160, `Your team raced on for ${time}`, 14, '#9aa7d0').setOrigin(0.5, 0));
    const net = report.income + report.prizes - report.wages;
    const lines = [
      `${report.races} races played`,
      report.bestFinish === null ? '' : `Best finish: P${report.bestFinish}   ·   ${report.wins} wins, ${report.podiums} podiums`,
      report.endSeason > report.startSeason ? `Season ${report.startSeason} → Season ${report.endSeason}` : `Still in Season ${report.endSeason}`,
      '',
      `Income  +$${formatNumber(report.income)}`,
      `Prize money  +$${formatNumber(report.prizes)}`,
      `Wages  -$${formatNumber(report.wages)}`,
      `Net  ${net >= 0 ? '+' : '-'}$${formatNumber(Math.abs(net))}`,
    ];
    const { flop, solid, big } = report.devResults;
    if (flop + solid + big > 0) lines.push('', `Development: ${big} breakthrough, ${solid} solid, ${flop} flop`);
    if (report.quits.length > 0) lines.push('', `${report.quits.join(' & ')} quit: unpaid wages`);
    c.add(addText(this, W / 2, 210, lines.join('\n'), 18, '#ffffff').setOrigin(0.5, 0).setAlign('center').setLineSpacing(10));
    c.add(addText(this, W / 2, 590, 'Offline races use your race engineer only, and prize money is 15% lower than live play.', 12, '#9aa7d0').setOrigin(0.5, 0).setWordWrapWidth(W - 80).setAlign('center'));
    addButton(this, 70, 650, W - 140, 56, 'COLLECT', () => {
      applyOffline(this.state, report);
      this.awayPending = null;
      c.destroy();
      this.startRace();
      this.applyIdentity();
      this.applyRating();
      this.persist();
    }, { fill: COLORS.green, size: 22, parent: c });
  }

  // Pushes the player's driver names and colour into the live race and strategy strip.
  private applyIdentity() {
    this.race.cars.forEach((car) => {
      if (!car.isPlayer) return;
      car.driver = this.state.driverNames[car.id === 'player-0' ? 0 : 1];
      car.color = this.state.teamColor;
    });
    this.stripChips.forEach((chip) => chip.setFillStyle(this.state.teamColor));
  }

  // Long names shrink so they stay inside the red tag, beside the profile button.
  private fitTeamName() {
    this.teamText.setScale(1);
    const room = 222;
    if (this.teamText.width > room) this.teamText.setScale(room / this.teamText.width);
  }

  private async rename(cancellable: boolean) {
    const name = await askTeamName(this.state.teamName, cancellable);
    if (!name) return;
    this.state.teamName = name;
    this.state.teamNamed = true;
    this.teamText.setText(name.toUpperCase());
    this.fitTeamName();
    this.persist();
  }

  private drawHud() {
    addBox(this, 0, 0, W, 70, COLORS.bg).setStrokeStyle(0);
    // Broadcast-style header: red team tag on the left, gold money badge on the right.
    addSlant(this, -12, 6, 300, 36, COLORS.red, 18);
    addSlant(this, 282, 6, 6, 36, 0xffffff, 6);
    this.teamText = addText(this, 52, 10, this.state.teamName.toUpperCase(), 22);
    this.fitTeamName();
    const profileBtn = addButton(this, 10, 9, 34, 30, '', () => {
      unlockAudio();
      this.panels.openProfile(true);
    }, { fill: 0x1a0606, size: 12 });
    // A small person icon: head and shoulders.
    const pg = this.add.graphics();
    pg.fillStyle(0xffffff);
    pg.fillCircle(27, 19, 5);
    pg.fillEllipse(27, 33, 18, 10);
    profileBtn.rect.setStrokeStyle(2, 0xffffff, 0.5);
    this.seasonText = addText(this, 20, 46, '', 14, '#9aa7d0');
    addSlant(this, W - 240, 6, 250, 36, 0x1a2342, 18);
    addSlant(this, W - 240, 6, 6, 36, COLORS.gold, 6);
    this.moneyText = addText(this, W - 22, 10, '', 22, '#ffc933').setOrigin(1, 0);
    this.wageText = addText(this, W - 218, 9, '', 11, '#ff8a80').setLineSpacing(0);
    const g = this.add.graphics();
    // Gem (cyan diamond) and research point (purple hexagon) icons.
    const gx = W - 196;
    g.fillStyle(0x4de3ff);
    fillPoly(g, [{ x: gx + 6, y: 49 }, { x: gx + 12, y: 55 }, { x: gx + 6, y: 63 }, { x: gx, y: 55 }]);
    const hx = W - 146;
    const hex = Array.from({ length: 6 }, (_, i) => ({ x: hx + 6 + Math.cos((i * Math.PI) / 3) * 7, y: 56 + Math.sin((i * Math.PI) / 3) * 7 }));
    g.fillStyle(0xb48cff);
    fillPoly(g, hex);
    // Clout: an orange star.
    const cx = W - 84;
    const star = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 3.5 : 8;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      return { x: cx + 6 + Math.cos(a) * r, y: 56 + Math.sin(a) * r };
    });
    g.fillStyle(0xff9a3d);
    fillPoly(g, star);
    this.gemText = addText(this, gx + 18, 47, '', 14, '#cfe9ff');
    this.rpText = addText(this, hx + 18, 47, '', 14, '#e0ccff');
    this.cloutText = addText(this, cx + 18, 47, '', 14, '#ffc489');
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
    // Darkens the circuit as it gets wet; cars and the interface sit above it.
    this.wetShade = this.add.rectangle(0, VIEW.y, W, VIEW.h, 0x0a1428, 0).setOrigin(0);
    this.carGfx = this.add.graphics();
    this.rainGfx = this.add.graphics();
    this.barGfx = this.add.graphics();
    // The whole track view is a tap target; buttons added later sit on top of it.
    this.add
      .rectangle(0, VIEW.y, W, VIEW.h, 0x000000, 0)
      .setOrigin(0)
      .setInteractive()
      .on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));
    this.lapText = addText(this, W - 12, VIEW.y + 8, '', 14, '#9aa7d0').setOrigin(1, 0);
    this.towerBox = addBox(this, 4, VIEW.y + 3, 152, 355, 0x050914).setAlpha(0.85).setStrokeStyle(1, 0x2a365e);
    this.towerRows = Array.from({ length: 20 }, (_, i) => addText(this, 8, VIEW.y + 30 + i * 16, '', 11));
    this.towerPoints = Array.from({ length: 20 }, (_, i) => addText(this, 150, VIEW.y + 30 + i * 16, '', 11).setOrigin(1, 0));
    this.towerBtn = addButton(this, 8, VIEW.y + 6, 114, 20, '', () => (this.towerMode = this.towerMode === 'race' ? 'season' : 'race'), {
      fill: 0x1d2745,
      size: 10,
    });
    this.towerFold = addButton(this, 126, VIEW.y + 6, 24, 20, '', () => (this.state.towerCollapsed = !this.state.towerCollapsed), {
      fill: 0x1d2745,
      size: 10,
    });
    addText(this, W - 140, VIEW.y + 30, 'TYRES', 10, '#9aa7d0');
    addText(this, W - 140, VIEW.y + 66, 'BOOST', 10, '#9aa7d0');
    this.compoundText = addText(this, W - 12, VIEW.y + 30, '', 10, '#9aa7d0').setOrigin(1, 0);
    this.weatherText = addText(this, W - 12, VIEW.y + 96, '', 12, '#9aa7d0').setOrigin(1, 0).setStroke('#050914', 3);
    addButton(this, W - 108, VIEW.y + 118, 96, 24, 'GOALS', () => this.panels.openGoals(true), { fill: 0x1d2745, size: 12 });
    this.goalsDot = this.add.circle(W - 14, VIEW.y + 120, 6, COLORS.red).setStrokeStyle(2, 0xffffff).setVisible(false);
    this.safetyCarText = addText(this, W / 2, VIEW.y + 8, 'SAFETY CAR: incident, pitting is cheap', 20, '#ffd400').setOrigin(0.5, 0).setStroke('#050914', 4).setVisible(false);
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
    unlockAudio();
    playSound('tap');
    recordEvent(this.state, 'tap');
    this.tutorial.notify('tap');
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
        this.tyreBtns[i][c] = addButton(this, 152 + k * 33, y, 30, STRIP_H - 2, COMPOUND_LETTERS[c], () => selectCompound(s(), c), {
          fill: COMPOUND_COLORS[c],
          size: 14,
        });
      });
      this.pitBtns[i] = addButton(this, 318, y, 212, STRIP_H - 2, 'PIT', () => togglePitRequest(s()), { fill: 0xb8321f, size: 12 });
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
      playerDriverStats: this.state.drivers,
      weather: rollWeather(Math.random, RACE_LAPS),
      rivalDrift: this.state.development.rivalDrift,
      seed: Date.now() & 0x7fffffff,
    });
    this.strategies = [newStrategy(this.strategies[0]), newStrategy(this.strategies[1])];
    playSound('start');
    this.restartAt = 0;
    this.paid = false;
    this.banner?.setVisible(false);
    const slots = this.race.cars.filter((c) => c.isPlayer).map((c) => this.race.grid.indexOf(c.id) + 1).sort((a, b) => a - b);
    this.gridText?.destroy();
    this.gridText = addText(this, W / 2, VIEW.y + 34, `QUALIFIED P${slots[0]} & P${slots[1]}`, 16, '#ffffff').setOrigin(0.5, 0).setStroke('#050914', 4).setDepth(50);
    this.tweens.add({ targets: this.gridText, alpha: 0, delay: 4000, duration: 1500 });
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
        playSound('fail');
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
    const folded = this.state.towerCollapsed;
    this.towerBox.setSize(152, folded ? 28 : 355);
    this.towerRows.forEach((r) => r.setVisible(!folded));
    this.towerPoints.forEach((r) => r.setVisible(!folded));
    this.towerFold.setLabel(folded ? '▾' : '▴');
    this.towerBtn.setLabel(this.towerMode === 'race' ? 'RACE ▸ SEASON' : 'SEASON ▸ RACE');
    const lap = Math.min(RACE_LAPS, Math.floor(order[0].progress) + 1);
    this.lapText.setText(this.race.finished ? 'FINISHED' : `${this.track.name} · Lap ${lap}/${RACE_LAPS}`);
  }

  // Forecast badge, a darker track and falling rain that scale with how wet it is.
  private renderWeather() {
    const w = this.race.wetness;
    const lap = Math.max(...this.race.cars.map((c) => c.progress));
    const want = idealClass(w);
    this.weatherText.setText(describeWeather(this.race.weather, lap));
    this.weatherText.setColor(isDry(this.race.weather) ? '#ffd86b' : want === 'dry' ? '#9ec5ff' : '#4dc3ff');
    const sc = this.race.safetyCarActive;
    this.safetyCarText.setVisible(sc && !this.race.finished).setAlpha(0.65 + 0.35 * Math.sin(this.time.now / 200));
    this.wetShade.setAlpha(0.45 * w);
    this.rainGfx.clear();
    if (w <= 0.02) return;
    const drops = Math.round(220 * w);
    const t = this.time.now / 1000;
    this.rainGfx.lineStyle(1.5, 0xc4d8ff, 0.7);
    for (let i = 0; i < drops; i++) {
      const x = (i * 97.3 + t * 60) % W;
      const y = VIEW.y + ((i * 61.7 + t * 600) % VIEW.h);
      this.rainGfx.lineBetween(x, y, x - 4, y + 15);
    }
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
    this.renderWeather();

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
        pit.setLabel(`BOX THIS LAP: ${COMPOUND_SHORT[s.nextCompound]} (cancel)`);
      } else {
        pit.setLabel('PIT NEXT LAP');
      }
      pit.setState(!isPitting(s) && !this.race.finished, s.pitRequested ? 0xe08a1f : 0xb8321f);
    });
  }

  private drawStats() {
    const y = VIEW.y + VIEW.h + 6;
    this.incomeText = addText(this, 16, y + 10, '', 13);
    this.payBtn = addButton(
      this,
      206,
      y,
      92,
      34,
      '',
      () => {
        const paid = payInstalment(this.state);
        if (paid > 0) {
          playSound('buy');
          this.floatText(W - 90, 96, `-$${formatNumber(paid)} wages`, '#ff8a80');
        }
      },
      { size: 12, fill: COLORS.green },
    );
    this.speedBtn = addButton(
      this,
      304,
      y,
      100,
      34,
      '',
      async () => {
        if (this.state.boostSeconds <= 0 && (await showRewardedAd())) this.state.boostSeconds += BOOST_SECONDS;
      },
      { fill: COLORS.green, size: 14 },
    );
    this.autoBtn = addButton(
      this,
      410,
      y,
      120,
      34,
      '',
      () => {
        if (this.state.autoUnlocked) {
          this.state.autoBuy = !this.state.autoBuy;
          if (this.state.autoBuy) this.panels.openAuto(true);
        } else this.selectTab(TABS.indexOf('Shop'));
      },
      { fill: COLORS.bg, size: 14 },
    );
  }

  private drawUpgrades() {
    const top = VIEW.y + VIEW.h + 48;
    this.cards = UPGRADE_DEFS.map((def, i) => {
      const x = 12 + (i % 3) * 176;
      const y = top + Math.floor(i / 3) * 80;
      addBox(this, x, y, 168, 74);
      addBox(this, x, y, 5, 74, COLORS.red).setStrokeStyle(0);
      addText(this, x + 14, y + 4, def.name.toUpperCase(), 16);
      const level = addText(this, x + 14, y + 26, '', 12, '#9aa7d0');
      addButton(this, x + 168 - 30, y + 5, 24, 20, 'i', () => this.openInfo(def.key), { size: 13, fill: 0x1d2745 });
      const button = addButton(this, x + 14, y + 47, 144, 22, '', () => {
        if (buyUpgrade(this.state, def)) {
          playSound('buy');
          this.tutorial.notify('buy');
          this.applyRating();
          this.spawnBurst(x + 84, y + 57, [COLORS.gold, 0xffffff], 8);
        }
      }, { size: 12 });
      return { def, level, button };
    });
  }

  private buildInfoPopup() {
    const c = this.add.container(0, 0).setDepth(1000).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, 960, 0x000000, 0.6).setOrigin(0).setInteractive().on('pointerdown', () => this.closeInfo());
    c.add(dim);
    c.add(addBox(this, 30, 220, W - 60, 420, 0x0b1020).setStrokeStyle(2, COLORS.red));
    const title = addText(this, 48, 236, '', 24, '#ffffff', c);
    const body = addText(this, 48, 276, '', 14, '#cfd6ee', c).setWordWrapWidth(W - 96).setLineSpacing(6);
    addButton(this, W / 2 - 60, 582, 120, 40, 'CLOSE', () => this.closeInfo(), { size: 16, parent: c });
    this.info = { box: c, title, body, key: null, research: false };
  }

  private openInfo(key: string, research = false) {
    this.info.key = key;
    this.info.research = research;
    this.info.box.setVisible(true);
    this.renderInfo();
  }

  private closeInfo() {
    this.info.key = null;
    this.info.box.setVisible(false);
  }

  // Refreshed every frame while open, so the numbers follow purchases and auto-buy.
  private renderInfo() {
    if (!this.info.key) return;
    const s = this.state;
    const st = { upgrades: s.upgrades, research: s.research, sponsors: sponsorMultiplier(s), researchPoints: s.researchPoints };
    const data = this.info.research ? researchInfo(this.info.key, st, this.eff()) : upgradeInfo(this.info.key, st, this.eff());
    if (!data) return;
    this.info.title.setText(data.title.toUpperCase());
    this.info.body.setText([data.description, '', ...data.stats.map((t) => `• ${t}`)].join('\n'));
  }

  // Upgrade levels including free levels from research.
  private eff() {
    return effectiveUpgrades(this.state);
  }

  private applyRating() {
    const rating = carRating(this.eff());
    this.race.cars.forEach((car) => {
      if (!car.isPlayer) return;
      const d = this.state.drivers[car.id === 'player-0' ? 0 : 1];
      car.rating = driverRating(rating, d);
      car.raceCraft = d.raceCraft;
    });
  }

  private renderEconomy() {
    const s = this.state;
    const rating = carRating(this.eff());
    this.moneyText.setText(`$ ${formatNumber(s.money)}`);
    const wages = totalPayroll(s);
    const owed = wagesOwed(s);
    this.wageText.setText(wages > 0 ? (owed > 0 ? `WAGES OWED\n$${formatNumber(owed)}` : `WAGES\n$${formatNumber(nextInstalment(s))}/race`) : '');
    if (owedInstalments(s) > 0) this.payBtn.setLabel(`PAY $${formatNumber(nextInstalment(s))}`);
    else this.payBtn.setLabel(wages > 0 ? 'WAGES PAID' : 'NO WAGES');
    this.payBtn.setState(owedInstalments(s) > 0 && s.money >= nextInstalment(s), COLORS.green);
    this.gemText.setText(String(s.gems));
    this.rpText.setText(`${s.researchPoints} RP`);
    this.cloutText.setText(String(s.clout));
    this.seasonText.setText(`Season ${s.season} · Race ${s.race}/${RACES_PER_SEASON}`);
    this.incomeText.setText(`${formatNumber(incomePerSecond(rating, sponsorMultiplier(s)))} $/s · Rating ${Math.round(rating)}`);
    for (const { def, level, button } of this.cards) {
      const lv = s.upgrades[def.key] ?? 0;
      const free = (s.research[def.key] ?? 0) * FREE_LEVELS_PER_RESEARCH;
      const price = upgradeCost(def, lv);
      level.setText(`Lv ${lv + free}`);
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
    const { positions, payout, wagesPaid, quit, outcome, sponsorCash, development } = settleRace(this.state, order);
    recordRaceResult(this.state, positions, !isDry(this.race.weather));
    const best = Math.min(...positions);
    playSound(outcome.type === 'season-won' ? 'fanfare' : best === 1 ? 'win' : best <= 3 ? 'podium' : 'finish');
    if (development?.outcome === 'flop') playSound('fail');
    if (development?.outcome === 'big') recordEvent(this.state, 'breakthrough');
    if (development?.outcome === 'flop') recordEvent(this.state, 'flop');
    this.floatText(W - 90, 70, `+$${formatNumber(payout)}`, '#ffc933');
    if (development) {
      const def = packageDef(development.key);
      const gain = `${development.gain >= 0 ? '+' : ''}${(development.gain * 100).toFixed(1)}%`;
      const verdict = development.outcome === 'big' ? 'BREAKTHROUGH' : development.outcome === 'solid' ? 'solid gain' : 'flop';
      this.floatText(W / 2, 330, `${def?.name}: ${verdict} ${gain}`, development.outcome === 'flop' ? '#ff8a80' : '#7dffb2');
    }
    if (wagesPaid > 0) this.floatText(W - 90, 96, `-$${formatNumber(wagesPaid)} wages`, '#ff8a80');
    if (quit.length > 0) {
      this.applyIdentity();
      this.applyRating();
      this.floatText(W / 2, 300, `${quit.join(' & ')} quit: unpaid wages`, '#ff8a80');
    }
    if (outcome.type === 'season-won') {
      this.confetti();
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
    unlockAudio();
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
        const paid = autoPayWages(s);
        if (paid > 0) this.floatText(W - 90, 96, `-$${formatNumber(paid)} wages`, '#ff8a80');
        const def = pickAutoBuy(s.money, s.upgrades, payrollReserve(s), s.autoItems);
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
  }

  // The race engineer calls strategy for both cars; it works whether or not Auto is unlocked.
  private runEngineer(dt: number) {
    const e = this.state.engineer;
    if (!e || this.race.finished) return;
    this.engineerTimer += dt;
    if (this.engineerTimer < ENGINEER_REVIEW_SECONDS) return;
    this.engineerTimer = 0;
    this.strategies.forEach((st, i) => {
      const car = this.race.cars.find((c) => c.id === `player-${i}`)!;
      reviewStrategy(e, st, car.progress, RACE_LAPS, this.race.wetness, Math.random, this.race.safetyCarActive);
    });
  }

  // Dot on the Goals button, plus a one-off float when an achievement becomes ready.
  private updateGoalsDot() {
    this.goalsDot.setVisible(claimableCount(this.state) > 0);
    for (const a of readyAchievements(this.state)) {
      if (this.seenReady.has(a.id)) continue;
      this.seenReady.add(a.id);
      if (this.seenReadyArmed) {
        playSound('claim');
        this.floatText(W / 2, 270, `ACHIEVEMENT READY: ${achievementDef(a.id)?.name}`, '#ffd400');
      }
    }
    this.seenReadyArmed = true;
  }

  update(_time: number, delta: number) {
    if (this.awayPending) return;
    // Clamp so a backgrounded tab doesn't teleport the cars or the money.
    const dt = Math.min(delta, 100) / 1000;
    const s = this.state;
    const scale = s.boostSeconds > 0 ? 2 : 1;
    s.boostSeconds = Math.max(0, s.boostSeconds - dt);

    const eff = this.eff();
    const rating = carRating(eff);
    s.money += incomePerSecond(rating, sponsorMultiplier(s)) * dt * scale;

    this.runAutos(dt);
    this.runEngineer(dt);
    const gameDt = dt * RACE_SPEED * scale;
    const levels = {
      tapPower: eff.tapPower ?? 0,
      pitCrew: eff.pitCrew ?? 0,
      tyres: eff.tyres ?? 0,
      tyreScience: eff.tyreScience ?? 0,
      energyRecovery: eff.energyRecovery ?? 0,
      wetness: this.race.wetness,
    };
    const fx = staffEffects(this.state.staff);
    this.strategies.forEach((st, i) => stepStrategy(st, gameDt, { ...levels, driverTyre: this.state.drivers[i].tyreMgmt, tyreWearCut: fx.tyreWearCut }));
    stepRace(this.race, gameDt, 1, {
      strategies: this.strategies,
      pitCrew: eff.pitCrew ?? 0,
      pitTimeCut: fx.pitTimeCut,
      pitIssueCut: fx.pitIssueCut,
      handling: { topSpeed: eff.topSpeed ?? 0, cornering: eff.cornering ?? 0 },
    });
    for (const car of this.race.cars) {
      if (car.isPlayer && car.pit && !this.countedPits.has(car.pit)) {
        this.countedPits.add(car.pit);
        recordEvent(this.state, 'pit');
        playSound('pit');
      }
    }
    if (this.race.safetyCarActive && !this.safetyCarSounded) playSound('safety');
    this.safetyCarSounded = this.race.safetyCarActive;
    syncAudio(this.state.settings);
    const running = this.race.cars.some((c) => c.isPlayer && !c.dnf && c.finishTime === null);
    const pitting = this.race.cars.filter((c) => c.isPlayer && c.pit).length;
    setEngine(!running || this.race.finished ? 0 : pitting >= 2 ? 0.3 : 1, scale);
    if (this.race.finished && !this.paid) {
      this.paid = true;
      this.finishRace();
    }
    this.updateGoalsDot();
    this.renderRace();
    this.renderStrategy();
    this.renderEconomy();
    this.renderInfo();
    this.panels.render();
    if (this.state.teamNamed) this.tutorial.sync();
    if (this.race.finished) {
      this.restartAt += delta;
      if (this.restartAt > this.restartDelay) this.startRace();
    }
  }
}
