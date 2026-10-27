import Phaser from 'phaser';
import { advanceTutorial, skipTutorial, tutorialStep, TAPS_REQUIRED, TUTORIAL_REWARD, claimTutorialReward, TutorialStep } from '../game/tutorial';
import type { GameState } from '../game/save';
import { addBox, addButton, addText, COLORS, W } from './widgets';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TutorialTargets {
  track: Rect;
  card: Rect;
  strip: Rect;
  tabs: Rect;
}

export interface TutorialHooks {
  // Brings the player back to the Race tab and makes sure the first purchase is affordable.
  prepare(step: TutorialStep): void;
  onClaim(): void;
}

const COPY: Record<TutorialStep, { title: string; body: string; y: number }> = {
  tap: { title: 'TAP TO BOOST', body: 'Tap the track to charge your boost. Boosted cars go faster, and tapping also speeds up pit stops.', y: 700 },
  buy: { title: 'UPGRADE YOUR CAR', body: 'Money comes in while your cars race. Spend it here: a faster car means better results.', y: 480 },
  strategy: {
    title: 'CALL THE STRATEGY',
    body: 'Each car has its own row: push or conserve, the next tyre (soft, medium, hard, intermediate, wet) and a pit call. Watch the weather forecast.',
    y: 340,
  },
  goal: {
    title: 'WIN THE DRIVERS\' TITLE',
    body: 'Finish top of the Drivers\' standings to advance a season. Later seasons unlock drivers, engineers, sponsors and more.',
    y: 660,
  },
  finish: { title: "YOU'RE READY", body: '', y: 330 },
};

const CAPTION_H = 170;

// Dims everything except one highlighted area; taps inside the highlight still reach the game.
export class Tutorial {
  private container: Phaser.GameObjects.Container;
  private shown: TutorialStep | null = null;
  private tapText?: Phaser.GameObjects.Text;
  private taps = 0;
  private pulse?: Phaser.Tweens.Tween;

  constructor(
    private scene: Phaser.Scene,
    private state: () => GameState,
    private targets: TutorialTargets,
    private hooks: TutorialHooks,
  ) {
    this.container = scene.add.container(0, 0).setDepth(1500);
  }

  get active() {
    return tutorialStep(this.state()) !== null;
  }

  // Call every frame: rebuilds the overlay when the step changes.
  sync() {
    const step = tutorialStep(this.state());
    if (step === this.shown) return;
    this.shown = step;
    this.taps = 0;
    this.clear();
    if (step) {
      this.hooks.prepare(step);
      this.build(step);
    }
  }

  notify(event: 'tap' | 'buy') {
    const step = tutorialStep(this.state());
    if (step === 'tap' && event === 'tap') {
      this.taps++;
      this.tapText?.setText(`${Math.min(this.taps, TAPS_REQUIRED)} / ${TAPS_REQUIRED}`);
      if (this.taps >= TAPS_REQUIRED) advanceTutorial(this.state());
    } else if (step === 'buy' && event === 'buy') {
      advanceTutorial(this.state());
    }
  }

  private clear() {
    this.pulse?.stop();
    this.pulse = undefined;
    this.tapText = undefined;
    this.container.removeAll(true);
  }

  private holeFor(step: TutorialStep): Rect | null {
    if (step === 'tap') return this.targets.track;
    if (step === 'buy') return this.targets.card;
    if (step === 'strategy') return this.targets.strip;
    if (step === 'goal') return this.targets.tabs;
    return null;
  }

  private build(step: TutorialStep) {
    const c = this.container;
    const hole = this.holeFor(step);
    const dim = (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      c.add(this.scene.add.rectangle(x, y, w, h, 0x000000, 0.7).setOrigin(0).setInteractive());
    };
    if (hole) {
      dim(0, 0, W, hole.y);
      dim(0, hole.y + hole.h, W, 960 - hole.y - hole.h);
      dim(0, hole.y, hole.x, hole.h);
      dim(hole.x + hole.w, hole.y, W - hole.x - hole.w, hole.h);
      const ring = this.scene.add.rectangle(hole.x, hole.y, hole.w, hole.h).setOrigin(0).setStrokeStyle(3, COLORS.gold);
      c.add(ring);
      this.pulse = this.scene.tweens.add({ targets: ring, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });
    } else {
      dim(0, 0, W, 960);
    }

    const copy = COPY[step];
    const y = copy.y;
    c.add(addBox(this.scene, 20, y, W - 40, CAPTION_H, COLORS.bg).setStrokeStyle(2, COLORS.red));
    addText(this.scene, 36, y + 12, copy.title, 22, '#ffd400', c);
    const stepNo = Math.min(['tap', 'buy', 'strategy', 'goal', 'finish'].indexOf(step) + 1, 5);
    addText(this.scene, W - 36, y + 16, `${stepNo} / 5`, 13, '#9aa7d0', c).setOrigin(1, 0);

    if (step === 'finish') {
      const gems = TUTORIAL_REWARD.gems;
      const clout = TUTORIAL_REWARD.clout;
      const rewarded = this.state().tutorialRewarded;
      const body = rewarded
        ? 'That is everything you need. Go and win a title.'
        : `That is everything you need. Here is a starter gift: ${gems} gems and ${clout} clout. Clout opens driver and engineer meetings once they unlock.`;
      addText(this.scene, 36, y + 46, body, 14, '#cfd6ee', c).setWordWrapWidth(W - 72).setLineSpacing(4);
      addButton(this.scene, 36, y + CAPTION_H - 56, W - 72, 44, rewarded ? 'LET\'S RACE' : 'CLAIM GIFT', () => {
        claimTutorialReward(this.state());
        advanceTutorial(this.state());
        this.hooks.onClaim();
      }, { fill: COLORS.green, size: 18, parent: c });
      return;
    }

    addText(this.scene, 36, y + 46, copy.body, 14, '#cfd6ee', c).setWordWrapWidth(W - 72).setLineSpacing(4);
    addButton(this.scene, 36, y + CAPTION_H - 44, 100, 34, 'SKIP', () => skipTutorial(this.state()), { fill: 0x1d2745, size: 14, parent: c });
    if (step === 'tap') {
      this.tapText = addText(this.scene, W - 36, y + CAPTION_H - 40, `0 / ${TAPS_REQUIRED}`, 20, '#ffffff', c).setOrigin(1, 0);
    } else if (step === 'buy') {
      addText(this.scene, W - 36, y + CAPTION_H - 38, 'Tap Engine to buy', 14, '#ffd400', c).setOrigin(1, 0);
    } else {
      addButton(this.scene, W - 136, y + CAPTION_H - 44, 100, 34, 'NEXT', () => advanceTutorial(this.state()), { size: 14, parent: c });
    }
  }
}
