import { Point, Track, buildTrack } from './track';
import { REAL_LAYOUTS } from './tracks.real';

function toPoints(flat: number[], scale: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i] / scale, y: flat[i + 1] / scale });
  return out;
}

// Circuits are shown as country plus city initials (first three letters for one-word cities).
const CIRCUIT_LABELS: Record<string, string> = {
  Melbourne: 'Australia MEL',
  Bahrain: 'Bahrain SKH',
  Shanghai: 'China SHA',
  Barcelona: 'Spain BAR',
  Monaco: 'Monaco MON',
  Montreal: 'Canada MTL',
  'Paul Ricard': 'France LC',
  'Red Bull Ring': 'Austria SPI',
  Silverstone: 'UK SIL',
  Hockenheim: 'Germany HOC',
  Hungaroring: 'Hungary MOG',
  Spa: 'Belgium SPA',
  Monza: 'Italy MNZ',
  Singapore: 'Singapore SIN',
  Sochi: 'Russia SOC',
  Suzuka: 'Japan SUZ',
  Austin: 'USA AUS',
  'Mexico City': 'Mexico MC',
  Interlagos: 'Brazil SP',
  'Yas Marina': 'UAE AD',
  Imola: 'Italy IMO',
  Nurburgring: 'Germany NUR',
  Portimao: 'Portugal POR',
  Mugello: 'Italy MUG',
  Sepang: 'Malaysia SEP',
  Istanbul: 'Turkey IST',
  Zandvoort: 'Netherlands ZAN',
  'Magny-Cours': 'France MC',
  Estoril: 'Portugal EST',
  Jacarepagua: 'Brazil RIO',
  Jeddah: 'Saudi Arabia JED',
  Miami: 'USA MIA',
  Lusail: 'Qatar LUS',
  Madrid: 'Spain MAD',
  Baku: 'Azerbaijan BAK',
  'Las Vegas': 'USA LV',
  Indianapolis: 'USA IND',
  'Buenos Aires': 'Argentina BA',
  Kyalami: 'South Africa KYA',
  'Watkins Glen': 'USA WG',
};

export const CALENDAR: Track[] = REAL_LAYOUTS.map(([name, aspect, flat]) =>
  buildTrack(CIRCUIT_LABELS[name] ?? name, toPoints(flat, 1000), 4, aspect),
);

// Random circuit for the next race, never the same one twice in a row.
export function pickTrack(rng: () => number = Math.random, excludeName?: string): Track {
  const pool = CALENDAR.filter((t) => t.name !== excludeName);
  return pool[Math.floor(rng() * pool.length) % pool.length];
}
