export interface Point {
  x: number;
  y: number;
}

export interface Track {
  name: string;
  // Dense closed polyline in the 0..1 unit square.
  points: Point[];
  // Width/height of the real circuit. The unit square is drawn at this aspect. Omitted = fill the view.
  aspect?: number;
  // Cumulative length at each point; last entry is the full lap length.
  cumulative: number[];
  length: number;
}

function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

export function buildTrack(name: string, control: Point[], steps = 24, aspect?: number): Track {
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
    cumulative.push(cumulative[i - 1] + Math.hypot((b.x - a.x) * (aspect ?? 1), b.y - a.y));
  }
  return { name, points, aspect, cumulative, length: cumulative[cumulative.length - 1] };
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

const PROFILE_SAMPLES = 400;
// Heading change (radians) across the sampling window that counts as a full corner.
const FULL_CORNER_ANGLE = 0.6;
const profiles = new WeakMap<Track, number[]>();

// How cornery each point of the lap is: 0 = straight, 1 = tight corner. Cached per track.
function cornerProfile(track: Track): number[] {
  const cached = profiles.get(track);
  if (cached) return cached;
  const w = track.length * 0.015;
  const sx = track.aspect ?? 1;
  const at = (d: number) => {
    const p = pointAt(track, d);
    return { x: p.x * sx, y: p.y };
  };
  const out: number[] = [];
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const d = (i / PROFILE_SAMPLES) * track.length;
    const a = at(d - w);
    const b = at(d);
    const c = at(d + w);
    const v1 = { x: b.x - a.x, y: b.y - a.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const angle = Math.abs(Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y));
    out.push(Math.min(1, angle / FULL_CORNER_ANGLE));
  }
  profiles.set(track, out);
  return out;
}

// Cornerness (0..1) at a race progress value in laps.
export function cornerness(track: Track, progress: number): number {
  const prof = cornerProfile(track);
  const f = (progress - Math.floor(progress)) * PROFILE_SAMPLES;
  const i = Math.floor(f);
  const t = f - i;
  return prof[i % PROFILE_SAMPLES] * (1 - t) + prof[(i + 1) % PROFILE_SAMPLES] * t;
}

// Share of the lap that is corner rather than straight, 0..1.
export function cornerShare(track: Track): number {
  const prof = cornerProfile(track);
  return prof.reduce((a, b) => a + b, 0) / prof.length;
}
