import { Point, Track, buildTrack } from './track';
import { REAL_LAYOUTS } from './tracks.real';

function toPoints(flat: number[], scale: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i] / scale, y: flat[i + 1] / scale });
  return out;
}

export const CALENDAR: Track[] = REAL_LAYOUTS.map(([name, aspect, flat]) => buildTrack(name, toPoints(flat, 1000), 4, aspect));

// Random circuit for the next race, never the same one twice in a row.
export function pickTrack(rng: () => number = Math.random, excludeName?: string): Track {
  const pool = CALENDAR.filter((t) => t.name !== excludeName);
  return pool[Math.floor(rng() * pool.length) % pool.length];
}
