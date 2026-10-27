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

// Every circuit that has hosted a World Championship Grand Prix (through the 2026 calendar).
// Circuits without a hand-made shape above get a stable shape generated from their name.
const OTHER_CIRCUITS = [
  'Adelaide', 'Aintree', 'Anderstorp', 'Austin', 'Avus', 'Baku', 'Brands Hatch', 'Bremgarten',
  'Buddh', 'Buenos Aires', 'Barcelona', 'Casablanca', 'Charade', 'Dallas', 'Detroit', 'Dijon-Prenois',
  'Donington Park', 'East London', 'Estoril', 'Fuji', 'Hockenheim', 'Hungaroring', 'Imola', 'Indianapolis',
  'Istanbul', 'Jarama', 'Jeddah', 'Jerez', 'Kyalami', 'Las Vegas', 'Le Mans', 'Long Beach', 'Lusail',
  'Madrid', 'Magny-Cours', 'Mexico City', 'Miami', 'Monsanto', 'Montjuic', 'Montreal', 'Mont-Tremblant',
  'Mosport', 'Mugello', 'Nivelles', 'Nurburgring', 'Okayama', 'Osterreichring', 'Paul Ricard', 'Pedralbes',
  'Pescara', 'Phoenix', 'Porto', 'Red Bull Ring', 'Reims', 'Riverside', 'Rouen-Les-Essarts', 'Sebring',
  'Sepang', 'Sochi', 'Valencia', 'Watkins Glen', 'Yas Marina', 'Yeongam', 'Zandvoort', 'Zeltweg', 'Zolder',
];

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Star-shaped loop around the centre, so it never crosses itself.
export function generateControl(name: string): Point[] {
  let s = hashName(name) || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const n = 10 + Math.floor(rnd() * 5);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const angle = ((i + (rnd() - 0.5) * 0.4) / n) * Math.PI * 2;
    const r = 0.28 + rnd() * 0.17;
    out.push(p(0.5 + Math.cos(angle) * r, 0.5 + Math.sin(angle) * r * 1.05));
  }
  return out;
}

export const CALENDAR: Track[] = [
  ...CIRCUITS.map((c) => buildTrack(c.name, c.control)),
  ...OTHER_CIRCUITS.map((name) => buildTrack(name, generateControl(name))),
];

// Random circuit for the next race, never the same one twice in a row.
export function pickTrack(rng: () => number = Math.random, excludeName?: string): Track {
  const pool = CALENDAR.filter((t) => t.name !== excludeName);
  return pool[Math.floor(rng() * pool.length) % pool.length];
}
