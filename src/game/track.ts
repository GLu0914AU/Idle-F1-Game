export interface Point {
  x: number;
  y: number;
}

export interface Track {
  name: string;
  // Dense closed polyline in the 0..1 unit square.
  points: Point[];
  // Cumulative length at each point; last entry is the full lap length.
  cumulative: number[];
  length: number;
}

// Hand-placed control points for a simplified circuit.
const CONTROL: Point[] = [
  { x: 0.12, y: 0.55 },
  { x: 0.1, y: 0.3 },
  { x: 0.25, y: 0.12 },
  { x: 0.45, y: 0.15 },
  { x: 0.55, y: 0.3 },
  { x: 0.72, y: 0.12 },
  { x: 0.9, y: 0.25 },
  { x: 0.88, y: 0.5 },
  { x: 0.7, y: 0.6 },
  { x: 0.82, y: 0.8 },
  { x: 0.6, y: 0.9 },
  { x: 0.4, y: 0.75 },
  { x: 0.25, y: 0.88 },
  { x: 0.1, y: 0.8 },
];

function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

export function buildTrack(name: string, control: Point[] = CONTROL, steps = 24): Track {
  const n = control.length;
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = control[(i - 1 + n) % n];
    const p1 = control[i];
    const p2 = control[(i + 1) % n];
    const p3 = control[(i + 2) % n];
    for (let s = 0; s < steps; s++) points.push(catmullRom(p0, p1, p2, p3, s / steps));
  }
  const cumulative: number[] = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1];
    const b = points[i % points.length];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { name, points, cumulative, length: cumulative[cumulative.length - 1] };
}

// Position on the lap for a distance along the track (wraps each lap).
export function pointAt(track: Track, distance: number): Point {
  const d = ((distance % track.length) + track.length) % track.length;
  let lo = 0;
  let hi = track.cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track.cumulative[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = track.points[lo];
  const b = track.points[(lo + 1) % track.points.length];
  const seg = track.cumulative[lo + 1] - track.cumulative[lo];
  const t = seg === 0 ? 0 : (d - track.cumulative[lo]) / seg;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export const DEFAULT_TRACK = buildTrack('Simplified Circuit');
