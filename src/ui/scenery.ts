import Phaser from 'phaser';
import { mulberry32 } from '../game/race';
import { fillPoly } from './widgets';

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ThemeName = 'grass' | 'desert' | 'city';
export interface Theme {
  name: ThemeName;
  base: number;
  stripe: number;
  // Colour of the shadowed band just outside the gravel.
  edge: number;
  coast: boolean;
}

const CITY = new Set(['Monaco MON', 'Singapore SIN', 'USA LV', 'Azerbaijan BAK', 'USA MIA', 'Saudi Arabia JED', 'Spain MAD']);
const DESERT = new Set(['Bahrain SKH', 'Qatar LUS', 'UAE AD', 'South Africa KYA']);
const COAST = new Set(['Monaco MON', 'Azerbaijan BAK', 'Saudi Arabia JED', 'Singapore SIN', 'USA MIA', 'UAE AD']);

export function themeFor(name: string): Theme {
  const coast = COAST.has(name);
  if (CITY.has(name)) return { name: 'city', base: 0x2a2f3c, stripe: 0x2e3443, edge: 0x1c202b, coast };
  if (DESERT.has(name)) return { name: 'desert', base: 0x4a3f2a, stripe: 0x524630, edge: 0x30291b, coast };
  return { name: 'grass', base: 0x1a4427, stripe: 0x1e4e2d, edge: 0x10301c, coast };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function drawScenery(g: Phaser.GameObjects.Graphics, input: { name: string; road: Pt[]; lane: Pt[]; rect: Rect }) {
  const { name, lane, rect } = input;
  const theme = themeFor(name);
  const rng = mulberry32(hash(name));
  const rnd = (a: number, b: number) => a + (b - a) * rng();
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rng() * items.length) % items.length];

  // Densify the closed road so distance checks are accurate.
  const dense: Pt[] = [];
  input.road.forEach((a, i) => {
    const b = input.road[(i + 1) % input.road.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
    for (let k = 0; k < n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  });
  const distTo = (pts: Pt[], x: number, y: number) => {
    let m = Infinity;
    for (const p of pts) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  };
  const everything = [...dense, ...lane];
  const roadDist = (x: number, y: number) => distTo(everything, x, y);

  const usable: Rect = { x: rect.x + 8, y: rect.y + 8, w: rect.w - 16, h: rect.h - 8 - 74 };
  const solids: { x: number; y: number; r: number }[] = [];
  let water: Rect | null = null;
  const free = (x: number, y: number, r: number) => {
    if (x - r < usable.x || x + r > usable.x + usable.w || y - r < usable.y || y + r > usable.y + usable.h) return false;
    if (water && x + r > water.x && x - r < water.x + water.w && y + r > water.y && y - r < water.y + water.h) return false;
    return solids.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + r);
  };
  const open = (x: number, y: number, r: number, clear: number) => free(x, y, r) && roadDist(x, y) >= r + clear;

  // Ground, with mown stripes.
  g.fillStyle(theme.base).fillRect(rect.x, rect.y, rect.w, rect.h);
  g.fillStyle(theme.stripe);
  for (let x = rect.x + 22; x < rect.x + rect.w; x += 44) g.fillRect(x, rect.y, Math.min(22, rect.x + rect.w - x), rect.h);
  if (theme.name === 'desert') {
    g.fillStyle(0x000000, 0.1);
    for (let i = 0; i < 9; i++) g.fillEllipse(rnd(rect.x, rect.x + rect.w), rnd(rect.y, rect.y + rect.h), rnd(80, 160), rnd(24, 46));
  }

  // Sea along the emptiest edge of the map, for coastal circuits.
  if (theme.coast) {
    const xs = everything.map((p) => p.x);
    const ys = everything.map((p) => p.y);
    const bottom = usable.y + usable.h;
    const room = {
      left: Math.min(...xs) - rect.x,
      right: rect.x + rect.w - Math.max(...xs),
      top: Math.min(...ys) - rect.y,
      bottom: bottom - Math.max(...ys),
    };
    const side = (Object.keys(room) as (keyof typeof room)[]).sort((a, b) => room[b] - room[a])[0];
    const depth = Math.min(95, room[side] - 30);
    if (depth >= 28) {
      const horizontal = side === 'left' || side === 'right';
      const len = horizontal ? rect.h : rect.w;
      // Sea depth is measured from the view edge; the bottom sea also covers the strategy strip.
      const inset = side === 'bottom' ? 74 : 0;
      const at = (t: number, d: number): Pt => {
        const dd = d + inset;
        if (side === 'left') return { x: rect.x + dd, y: rect.y + t };
        if (side === 'right') return { x: rect.x + rect.w - dd, y: rect.y + t };
        if (side === 'top') return { x: rect.x + t, y: rect.y + dd };
        return { x: rect.x + t, y: rect.y + rect.h - dd };
      };
      const shore = (extra: number) => {
        const pts: Pt[] = [];
        const p1 = rnd(0, 6);
        const p2 = rnd(0, 6);
        for (let t = 0; t <= len; t += 8) pts.push(at(t, depth + extra + Math.sin(t * 0.04 + p1) * 5 + Math.sin(t * 0.11 + p2) * 3));
        return [...pts, at(len, -inset), at(0, -inset)];
      };
      g.fillStyle(theme.name === 'city' ? 0x59607a : 0xd9c58a, 0.55);
      fillPoly(g, shore(7));
      g.fillStyle(0x1d5d8a);
      fillPoly(g, shore(0));
      g.fillStyle(0x2a78a8, 0.5);
      fillPoly(g, shore(-depth * 0.45));
      g.lineStyle(1, 0xffffff, 0.15);
      for (let i = 0; i < 14; i++) {
        const p = at(rnd(10, len - 10), rnd(8, depth - 12));
        g.lineBetween(p.x, p.y, p.x + (horizontal ? 0 : 14), p.y + (horizontal ? 14 : 0));
      }
      if (theme.name === 'city') {
        for (let i = 0; i < 3; i++) {
          const p = at(rnd(40, len - 40), rnd(depth * 0.3, depth * 0.8));
          g.fillStyle(0xffffff, 0.9).fillEllipse(p.x, p.y, horizontal ? 5 : 14, horizontal ? 14 : 5);
          g.fillStyle(0xffffff, 0.2).fillEllipse(p.x, p.y + (horizontal ? 10 : 0), horizontal ? 3 : 18, horizontal ? 18 : 3);
        }
      }
      const d = depth + 14 + inset;
      water =
        side === 'left'
          ? { x: rect.x, y: rect.y, w: d, h: rect.h }
          : side === 'right'
            ? { x: rect.x + rect.w - d, y: rect.y, w: d, h: rect.h }
            : side === 'top'
              ? { x: rect.x, y: rect.y, w: rect.w, h: d }
              : { x: rect.x, y: rect.y + rect.h - d, w: rect.w, h: d };
    }
  }

  // Ponds on inland grass circuits.
  const blob = (cx: number, cy: number, r: number, scale: number) => {
    const p1 = rnd(0, 6);
    const p2 = rnd(0, 6);
    const pts = Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      const rad = r * scale * (1 + 0.16 * Math.sin(3 * a + p1) + 0.1 * Math.sin(5 * a + p2));
      return { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad };
    });
    fillPoly(g, pts);
  };
  if (theme.name === 'grass') {
    const ponds = rng() < 0.75 ? (rng() < 0.4 ? 2 : 1) : 0;
    for (let n = 0, placed = 0; n < 40 && placed < ponds; n++) {
      const r = rnd(20, 36);
      const cx = rnd(usable.x, usable.x + usable.w);
      const cy = rnd(usable.y, usable.y + usable.h);
      if (!open(cx, cy, r * 1.3, 24)) continue;
      g.fillStyle(0x2c6a3a, 0.8);
      blob(cx, cy, r, 1.12);
      g.fillStyle(0x1d5d8a);
      blob(cx, cy, r, 1);
      g.fillStyle(0x2a78a8, 0.55);
      blob(cx - r * 0.12, cy - r * 0.12, r, 0.55);
      solids.push({ x: cx, y: cy, r: r * 1.3 });
      placed++;
    }
  }

  // Grandstands: both sides at the start/finish straight, plus a few around the lap.
  const tangentAt = (i: number) => {
    const a = dense[(i - 1 + dense.length) % dense.length];
    const b = dense[(i + 1) % dense.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  };
  const roofColors = [0xe10600, 0x2f6bff, 0xf2f2f2, 0xffc933];
  const stand = (i: number, side: number, L: number) => {
    const p = dense[i];
    const t = tangentAt(i);
    const n = { x: -t.y, y: t.x };
    const D = 9;
    const cx = p.x + n.x * side * 24;
    const cy = p.y + n.y * side * 24;
    const ends = [-L / 2, L / 2].map((s) => ({ x: cx + t.x * s, y: cy + t.y * s }));
    if (!free(cx, cy, L / 2) || roadDist(cx, cy) < 21.5 || ends.some((e) => roadDist(e.x, e.y) < 19)) return false;
    const box = (along: number, across: number, ox = 0, oy = 0) => [
      { x: cx + ox + t.x * -along + n.x * -across, y: cy + oy + t.y * -along + n.y * -across },
      { x: cx + ox + t.x * along + n.x * -across, y: cy + oy + t.y * along + n.y * -across },
      { x: cx + ox + t.x * along + n.x * across, y: cy + oy + t.y * along + n.y * across },
      { x: cx + ox + t.x * -along + n.x * across, y: cy + oy + t.y * -along + n.y * across },
    ];
    g.fillStyle(0x000000, 0.3);
    fillPoly(g, box(L / 2, D / 2, 2, 3));
    g.fillStyle(0x12141d);
    fillPoly(g, box(L / 2 + 1, D / 2 + 1));
    const color = pick(roofColors);
    for (let row = 0; row < 3; row++) {
      const across0 = -D / 2 + (row * D) / 3;
      const rowPts = [
        { x: cx + t.x * -L / 2 + n.x * across0, y: cy + t.y * -L / 2 + n.y * across0 },
        { x: cx + t.x * L / 2 + n.x * across0, y: cy + t.y * L / 2 + n.y * across0 },
        { x: cx + t.x * L / 2 + n.x * (across0 + D / 3), y: cy + t.y * L / 2 + n.y * (across0 + D / 3) },
        { x: cx + t.x * -L / 2 + n.x * (across0 + D / 3), y: cy + t.y * -L / 2 + n.y * (across0 + D / 3) },
      ];
      g.fillStyle(row % 2 ? 0x3a4057 : color, row % 2 ? 1 : 0.75);
      fillPoly(g, rowPts);
      for (let s = -L / 2 + 2; s < L / 2 - 1; s += 3) {
        g.fillStyle(pick([0xf2f2f2, 0xe10600, 0x2f6bff, 0xffc933, 0x15171f]), 0.9);
        g.fillCircle(cx + t.x * s + n.x * (across0 + D / 6), cy + t.y * s + n.y * (across0 + D / 6), 0.9);
      }
    }
    const fx = -side * n.x * (D / 2 + 1.5);
    const fy = -side * n.y * (D / 2 + 1.5);
    g.lineStyle(1, 0xcfd6ee, 0.7).lineBetween(ends[0].x + fx, ends[0].y + fy, ends[1].x + fx, ends[1].y + fy);
    solids.push({ x: cx, y: cy, r: (L / 2) * 0.9 });
    return true;
  };
  stand(0, 1, 44);
  stand(0, -1, 44);
  for (const f of [0.2, 0.4, 0.6, 0.8]) {
    const i = Math.floor(dense.length * f);
    if (!stand(i, 1, 30)) stand(i, -1, 30);
  }

  // Pit buildings, on the side of the pit lane away from the track.
  if (lane.length > 20) {
    const normalAt = (i: number) => {
      const a = lane[Math.max(0, i - 1)];
      const b = lane[Math.min(lane.length - 1, i + 1)];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: -(b.y - a.y) / d, y: (b.x - a.x) / d };
    };
    const mid = Math.floor(lane.length / 2);
    const nm = normalAt(mid);
    const farther = (s: number) => distTo(dense, lane[mid].x + nm.x * s * 13, lane[mid].y + nm.y * s * 13);
    const s = farther(1) >= farther(-1) ? 1 : -1;
    const from = Math.floor(lane.length * 0.12);
    const to = Math.floor(lane.length * 0.88);
    const line: Phaser.Math.Vector2[] = [];
    for (let i = from; i <= to; i++) {
      const n = normalAt(i);
      line.push(new Phaser.Math.Vector2(lane[i].x + n.x * s * 13, lane[i].y + n.y * s * 13));
    }
    g.lineStyle(10, 0x000000, 0.3).strokePoints(line.map((v) => new Phaser.Math.Vector2(v.x + 2, v.y + 2)), false, false);
    g.lineStyle(8, 0x8a91a8).strokePoints(line, false, false);
    g.lineStyle(2, 0xc5cbe0, 0.6).strokePoints(line, false, false);
    for (let i = 0; i + 1 < line.length; i += 2) {
      g.lineStyle(3, 0x2a2f44, 0.9).lineBetween(line[i].x, line[i].y, line[i + 1].x, line[i + 1].y);
      if (i % 6 === 0) solids.push({ x: line[i].x, y: line[i].y, r: 8 });
    }
  }

  // Paddock: a car park and team trucks.
  for (let n = 0; n < 50; n++) {
    const cx = rnd(usable.x, usable.x + usable.w);
    const cy = rnd(usable.y, usable.y + usable.h);
    if (!open(cx, cy, 26, 18)) continue;
    g.fillStyle(0x000000, 0.25).fillRect(cx - 23, cy - 11, 48, 28);
    g.fillStyle(0x2c3040).fillRect(cx - 25, cy - 13, 50, 26);
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 7; k++) {
        g.fillStyle(pick([0xe10600, 0xf2f2f2, 0x2f6bff, 0x9aa0b5, 0xffc933, 0x15171f])).fillRect(cx - 22 + k * 6.4, cy - 9 + row * 12, 4, 7);
      }
    }
    g.lineStyle(1, 0xf2f2f2, 0.35).strokeRect(cx - 25, cy - 13, 50, 26);
    solids.push({ x: cx, y: cy, r: 27 });
    break;
  }

  // Tyre walls on the outside of the tightest corners.
  let lastWall = -999;
  for (let i = 10; i < dense.length - 10; i += 3) {
    const p = dense[i];
    const a1 = Math.atan2(p.y - dense[i - 10].y, p.x - dense[i - 10].x);
    const a2 = Math.atan2(dense[i + 10].y - p.y, dense[i + 10].x - p.x);
    let turn = a2 - a1;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) < 0.55 || i - lastWall < 40) continue;
    lastWall = i;
    const out = turn > 0 ? -1 : 1;
    for (let k = i - 8; k <= i + 8; k += 2) {
      const q = dense[Math.max(0, Math.min(dense.length - 1, k))];
      const t = tangentAt(Math.max(0, Math.min(dense.length - 1, k)));
      const x = q.x + -t.y * out * 19.5;
      const y = q.y + t.x * out * 19.5;
      if (roadDist(x, y) < 18 || !free(x, y, 2)) continue;
      g.fillStyle(Math.floor(k / 3) % 2 ? 0xd8dbe6 : 0x15171f).fillCircle(x, y, 2);
      g.lineStyle(1, 0x000000, 0.5).strokeCircle(x, y, 2);
    }
  }

  // City blocks.
  if (theme.name === 'city') {
    const greys = [0x4a5166, 0x5a6178, 0x3d4358, 0x6a7088];
    for (let n = 0, placed = 0; n < 260 && placed < 30; n++) {
      const w = rnd(14, 34);
      const h = rnd(12, 30);
      const cx = rnd(usable.x, usable.x + usable.w);
      const cy = rnd(usable.y, usable.y + usable.h);
      const r = Math.hypot(w, h) / 2;
      if (!open(cx, cy, r, 16)) continue;
      g.fillStyle(0x000000, 0.35).fillRect(cx - w / 2 + 3, cy - h / 2 + 3, w, h);
      g.fillStyle(pick(greys)).fillRect(cx - w / 2, cy - h / 2, w, h);
      g.fillStyle(0xffffff, 0.12).fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4);
      g.fillStyle(0x15171f, 0.6).fillRect(cx - 3, cy - 2, 5, 4);
      g.lineStyle(1, 0x000000, 0.4).strokeRect(cx - w / 2, cy - h / 2, w, h);
      solids.push({ x: cx, y: cy, r });
      placed++;
    }
  }

  // Trees, bushes and palms.
  const tree = (x: number, y: number, r: number) => {
    g.fillStyle(0x000000, 0.28).fillCircle(x + 1.5, y + 1.5, r);
    g.fillStyle(pick([0x1f5a2c, 0x246632, 0x1b5028])).fillCircle(x, y, r);
    g.fillStyle(0x4a9a4f, 0.75).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.5);
  };
  const palm = (x: number, y: number) => {
    g.lineStyle(2, 0x2e7a3a);
    for (let k = 0; k < 6; k++) g.lineBetween(x, y, x + Math.cos((k * Math.PI) / 3) * 5, y + Math.sin((k * Math.PI) / 3) * 5);
    g.fillStyle(0x6b4a2a).fillCircle(x, y, 1.4);
  };
  if (theme.name === 'grass') {
    for (let c = 0, made = 0; c < 80 && made < 14; c++) {
      const cx = rnd(usable.x, usable.x + usable.w);
      const cy = rnd(usable.y, usable.y + usable.h);
      if (!open(cx, cy, 4, 20)) continue;
      made++;
      for (let k = 0, count = Math.floor(rnd(6, 13)); k < count; k++) {
        const a = rnd(0, Math.PI * 2);
        const d = rnd(0, 20);
        const x = cx + Math.cos(a) * d;
        const y = cy + Math.sin(a) * d;
        const r = rnd(3, 5.5);
        if (open(x, y, r, 19)) tree(x, y, r);
      }
    }
  }
  const singles = theme.name === 'grass' ? 40 : theme.name === 'city' ? 18 : 0;
  for (let n = 0, placed = 0; n < 300 && placed < singles; n++) {
    const x = rnd(usable.x, usable.x + usable.w);
    const y = rnd(usable.y, usable.y + usable.h);
    const r = rnd(3, 5);
    if (open(x, y, r, 19)) {
      tree(x, y, r);
      placed++;
    }
  }
  if (theme.name === 'desert') {
    for (let n = 0, placed = 0; n < 300 && placed < 40; n++) {
      const x = rnd(usable.x, usable.x + usable.w);
      const y = rnd(usable.y, usable.y + usable.h);
      if (!open(x, y, 5, 19)) continue;
      placed++;
      if (placed % 3 === 0) palm(x, y);
      else if (placed % 3 === 1) g.fillStyle(0x5b6b3a).fillCircle(x, y, rnd(2, 3.5));
      else g.fillStyle(0x7a6a50).fillCircle(x, y, rnd(1.8, 3));
    }
  }
}
