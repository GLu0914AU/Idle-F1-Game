import Phaser from 'phaser';

export const W = 540;
export const COLORS = { bg: 0x0b1020, panel: 0x151c33, border: 0x2a3558, accent: 0x2f6bff, disabled: 0x2a3350, green: 0x14b87a };

export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size = 18,
  color = '#ffffff',
  parent?: Phaser.GameObjects.Container,
) {
  const t = scene.add.text(x, y, s, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, color });
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
  const rect = addBox(scene, x, y, w, h, fill, parent).setInteractive({ useHandCursor: true });
  const text = addText(scene, x + w / 2, y + h / 2, label, size, '#ffffff', parent).setOrigin(0.5);
  rect.on('pointerdown', () => {
    if (enabled) onClick();
  });
  return {
    rect,
    label: text,
    setLabel: (s) => void text.setText(s),
    setState: (on, color = fill) => {
      enabled = on;
      rect.setFillStyle(on ? color : COLORS.disabled);
      text.setColor(on ? '#ffffff' : '#8591b8');
    },
  };
}
