import Phaser from 'phaser';
import { RES } from '../resolution';

export const W = 540;
export const COLORS = {
  bg: 0x0b1020,
  panel: 0x151c33,
  border: 0x2a3558,
  accent: 0x2f6bff,
  disabled: 0x2a3350,
  green: 0x14b87a,
  red: 0xe10600,
  gold: 0xffc933,
};

// The player's team colour; every COLORS.green button is drawn in it.
export const THEME = { team: COLORS.green };

export const resolveFill = (c: number): number => (c === COLORS.green ? THEME.team : c);

const isLight = (c: number): boolean => ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114 > 160;

export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size = 18,
  color = '#ffffff',
  parent?: Phaser.GameObjects.Container,
) {
  const fontFamily = size >= 14 ? 'Impact, "Arial Narrow", system-ui, sans-serif' : 'system-ui, sans-serif';
  const t = scene.add.text(x, y, s, { fontFamily, fontSize: `${size}px`, color, resolution: RES });
  parent?.add(t);
  return t;
}

export function addBox(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number = COLORS.panel,
  parent?: Phaser.GameObjects.Container,
) {
  const r = scene.add.rectangle(x, y, w, h, fill).setOrigin(0).setStrokeStyle(2, COLORS.border);
  parent?.add(r);
  return r;
}

export function fillPoly(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
  g.fillPoints(
    pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
    true,
  );
}

// Parallelogram in the style of TV graphics; `slant` is the horizontal lean in pixels.
export function addSlant(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  slant = 12,
  parent?: Phaser.GameObjects.Container,
) {
  const g = scene.add.graphics();
  g.fillStyle(fill);
  fillPoly(g, [
    { x: x + slant, y },
    { x: x + w, y },
    { x: x + w - slant, y: y + h },
    { x, y: y + h },
  ]);
  parent?.add(g);
  return g;
}

export interface Button {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  setLabel(s: string): void;
  setState(enabled: boolean, fill?: number): void;
}

export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: { fill?: number; size?: number; parent?: Phaser.GameObjects.Container } = {},
): Button {
  const { fill = COLORS.accent, size = 14, parent } = opts;
  let enabled = true;
  const rect = addBox(scene, x, y, w, h, resolveFill(fill), parent).setInteractive({ useHandCursor: true });
  const text = addText(scene, x + w / 2, y + h / 2, label, size, '#ffffff', parent).setOrigin(0.5).setAlign('center');
  rect.on('pointerdown', () => {
    if (!enabled) return;
    scene.tweens.add({ targets: text, scale: 0.88, duration: 70, yoyo: true });
    scene.tweens.add({ targets: rect, alpha: 0.6, duration: 70, yoyo: true });
    onClick();
  });
  rect.on('pointerover', () => enabled && rect.setStrokeStyle(2, 0xffffff, 0.7));
  rect.on('pointerout', () => rect.setStrokeStyle(2, COLORS.border));
  return {
    rect,
    label: text,
    setLabel: (s) => void text.setText(s),
    setState: (on, color = fill) => {
      enabled = on;
      const shade = resolveFill(color);
      rect.setFillStyle(on ? shade : COLORS.disabled);
      text.setColor(!on ? '#8591b8' : isLight(shade) ? '#0b1020' : '#ffffff');
    },
  };
}
