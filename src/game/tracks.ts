import { Point, Track, buildTrack } from './track';

const p = (x: number, y: number): Point => ({ x, y });

// Simplified shapes loosely inspired by real circuits, one per race on the calendar.
const CIRCUITS: { name: string; control: Point[] }[] = [
  {
    name: 'Melbourne',
    control: [p(0.15, 0.5), p(0.12, 0.25), p(0.3, 0.1), p(0.55, 0.12), p(0.8, 0.1), p(0.9, 0.3), p(0.8, 0.5), p(0.88, 0.7), p(0.7, 0.9), p(0.4, 0.88), p(0.2, 0.8)],
  },
  {
    name: 'Shanghai',
    control: [p(0.1, 0.2), p(0.4, 0.1), p(0.7, 0.15), p(0.9, 0.3), p(0.75, 0.45), p(0.5, 0.4), p(0.35, 0.55), p(0.5, 0.7), p(0.8, 0.75), p(0.9, 0.9), p(0.4, 0.92), p(0.12, 0.75), p(0.08, 0.45)],
  },
  {
    name: 'Suzuka',
    control: [p(0.1, 0.55), p(0.15, 0.25), p(0.35, 0.1), p(0.55, 0.2), p(0.45, 0.4), p(0.65, 0.5), p(0.9, 0.4), p(0.92, 0.7), p(0.7, 0.9), p(0.4, 0.85), p(0.25, 0.7)],
  },
  {
    name: 'Bahrain',
    control: [p(0.1, 0.15), p(0.5, 0.1), p(0.9, 0.15), p(0.85, 0.4), p(0.6, 0.45), p(0.9, 0.6), p(0.85, 0.88), p(0.5, 0.85), p(0.3, 0.65), p(0.15, 0.85), p(0.08, 0.5)],
  },
  {
    name: 'Monaco',
    control: [p(0.15, 0.85), p(0.1, 0.6), p(0.25, 0.45), p(0.15, 0.25), p(0.35, 0.1), p(0.55, 0.2), p(0.5, 0.35), p(0.75, 0.3), p(0.9, 0.5), p(0.75, 0.65), p(0.8, 0.85), p(0.55, 0.9), p(0.4, 0.75), p(0.3, 0.9)],
  },
  {
    name: 'Silverstone',
    control: [p(0.2, 0.9), p(0.1, 0.65), p(0.18, 0.4), p(0.1, 0.2), p(0.35, 0.1), p(0.55, 0.25), p(0.75, 0.1), p(0.92, 0.3), p(0.8, 0.5), p(0.9, 0.7), p(0.7, 0.85), p(0.5, 0.7), p(0.4, 0.88)],
  },
  {
    name: 'Spa',
    control: [p(0.1, 0.7), p(0.2, 0.4), p(0.45, 0.25), p(0.7, 0.1), p(0.9, 0.2), p(0.85, 0.45), p(0.65, 0.55), p(0.8, 0.75), p(0.55, 0.9), p(0.3, 0.85)],
  },
  {
    name: 'Monza',
    control: [p(0.15, 0.85), p(0.1, 0.5), p(0.15, 0.15), p(0.5, 0.1), p(0.85, 0.15), p(0.9, 0.4), p(0.8, 0.55), p(0.9, 0.7), p(0.85, 0.88), p(0.5, 0.9)],
  },
  {
    name: 'Singapore',
    control: [p(0.1, 0.3), p(0.1, 0.1), p(0.45, 0.1), p(0.5, 0.3), p(0.8, 0.3), p(0.9, 0.5), p(0.7, 0.55), p(0.9, 0.75), p(0.6, 0.9), p(0.35, 0.85), p(0.3, 0.6), p(0.1, 0.65)],
  },
  {
    name: 'Interlagos',
    control: [p(0.2, 0.15), p(0.6, 0.1), p(0.9, 0.3), p(0.7, 0.5), p(0.9, 0.75), p(0.55, 0.92), p(0.25, 0.8), p(0.35, 0.55), p(0.1, 0.45)],
  },
];

export const CALENDAR: Track[] = CIRCUITS.map((c) => buildTrack(c.name, c.control));

// Race numbers are 1-based and the calendar repeats every season.
export function trackForRace(race: number): Track {
  return CALENDAR[(Math.max(1, race) - 1) % CALENDAR.length];
}
