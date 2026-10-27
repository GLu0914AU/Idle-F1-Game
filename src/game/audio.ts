// Everything is synthesized with the Web Audio API, so there are no asset files and it works offline. Browsers keep audio locked until
// the first tap, so nothing plays before unlockAudio() runs; every call is a safe no-op without audio support.
export interface AudioSettings {
  sound: boolean;
  engine: boolean;
  music: boolean;
  haptics: boolean;
  // 0..1
  volume: number;
}

export const newAudioSettings = (): AudioSettings => ({ sound: true, engine: true, music: true, haptics: true, volume: 0.6 });

export function mergeAudioSettings(saved: Partial<AudioSettings> | undefined): AudioSettings {
  const base = newAudioSettings();
  const v = saved?.volume;
  return {
    sound: saved?.sound ?? base.sound,
    engine: saved?.engine ?? base.engine,
    music: saved?.music ?? base.music,
    haptics: saved?.haptics ?? base.haptics,
    volume: typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : base.volume,
  };
}

export type SoundName = 'tap' | 'pit' | 'start' | 'finish' | 'podium' | 'win' | 'safety' | 'fail' | 'buy' | 'claim' | 'fanfare';

// Minimum seconds between two plays of the same sound, so fast taps and a busy race can't flood the audio.
export const MIN_GAP: Record<SoundName, number> = { tap: 0.06, pit: 0.4, start: 1, finish: 1, podium: 1, win: 1, safety: 2, fail: 0.5, buy: 0.05, claim: 0.15, fanfare: 2 };

const lastPlayed = new Map<SoundName, number>();
export function shouldPlay(name: SoundName, now: number): boolean {
  const last = lastPlayed.get(name);
  if (last !== undefined && now - last < MIN_GAP[name]) return false;
  lastPlayed.set(name, now);
  return true;
}
export const resetRateLimit = () => lastPlayed.clear();

const HAPTICS: Partial<Record<SoundName, number | number[]>> = { tap: 8, pit: 25, start: 20, podium: [40, 60, 40], win: [50, 60, 50, 60, 90], fanfare: [60, 60, 60, 60, 120], safety: [60, 40, 60], fail: [90], claim: 15 };

let settings: AudioSettings = newAudioSettings();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let engineBus: GainNode | null = null;
let engineOsc: OscillatorNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let signature = '';
// Vibration is blocked until the user has tapped at least once.
let gestured = false;

const MUSIC_VOLUME = 0.22;
const ENGINE_VOLUME = 0.05;

function applyGains() {
  if (!ctx || !master || !sfxBus || !musicBus || !engineBus) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.volume, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.sound ? 1 : 0, t, 0.03);
  musicBus.gain.setTargetAtTime(settings.music ? MUSIC_VOLUME : 0, t, 0.2);
  if (!settings.engine) engineBus.gain.setTargetAtTime(0, t, 0.1);
}

// Call every frame with the live settings; it only does work when something changed.
export function syncAudio(next: AudioSettings): void {
  settings = next;
  const sig = `${next.sound}${next.engine}${next.music}${next.volume}`;
  if (sig === signature) return;
  signature = sig;
  applyGains();
}

export function audioReady(): boolean {
  return ctx !== null && ctx.state === 'running';
}

// Must be called from a user gesture (tap). Safe to call repeatedly.
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  gestured = true;
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    ctx = new Ctor();
  } catch {
    return;
  }
  master = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  engineBus = ctx.createGain();
  engineBus.gain.value = 0;
  sfxBus.connect(master);
  musicBus.connect(master);
  engineBus.connect(master);
  master.connect(ctx.destination);
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 60;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  engineOsc.connect(lp).connect(engineBus);
  engineOsc.start();
  signature = '';
  applyGains();
  startMusic();
  void ctx.resume();
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number, bus: GainNode | null = sfxBus) {
  if (!ctx || !bus) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filterFreq: number, delay = 0) {
  if (!ctx || !sfxBus) return;
  const t = ctx.currentTime + delay;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
}

const SOUNDS: Record<SoundName, () => void> = {
  tap: () => tone(620, 0.07, 'square', 0.12, 0, 900),
  pit: () => {
    noise(0.12, 0.5, 2400);
    noise(0.12, 0.5, 2400, 0.18);
    tone(180, 0.15, 'square', 0.1, 0.3);
  },
  start: () => {
    for (let i = 0; i < 3; i++) tone(440, 0.12, 'square', 0.14, i * 0.28);
    tone(880, 0.45, 'square', 0.16, 0.84);
  },
  finish: () => {
    tone(523, 0.14, 'triangle', 0.2);
    tone(392, 0.2, 'triangle', 0.2, 0.14);
  },
  podium: () => [523, 659, 784].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.12)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.24, i * 0.12)),
  safety: () => {
    tone(880, 0.18, 'square', 0.12);
    tone(660, 0.18, 'square', 0.12, 0.2);
    tone(880, 0.18, 'square', 0.12, 0.4);
  },
  fail: () => {
    tone(140, 0.3, 'sawtooth', 0.22, 0, 60);
    noise(0.25, 0.3, 300);
  },
  buy: () => {
    tone(700, 0.05, 'square', 0.1);
    tone(1050, 0.08, 'square', 0.1, 0.05);
  },
  claim: () => [1047, 1319, 1568].forEach((f, i) => tone(f, 0.18, 'sine', 0.18, i * 0.07)),
  fanfare: () => {
    [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 7 ? 0.7 : 0.18, 'triangle', 0.24, i * 0.15));
  },
};

export function playSound(name: SoundName): void {
  const now = typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000;
  if (!shouldPlay(name, now)) return;
  vibrate(name);
  if (!settings.sound || !audioReady()) return;
  SOUNDS[name]();
}

function vibrate(name: SoundName): void {
  const pattern = HAPTICS[name];
  if (!pattern || !gestured || !settings.haptics || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when vibration isn't allowed yet.
  }
}

// level 0 silences the hum (race over, nobody on track); 1 is full pace. `speed` raises the pitch (2 while boosted).
export function setEngine(level: number, speed = 1): void {
  if (!ctx || !engineBus || !engineOsc) return;
  const t = ctx.currentTime;
  engineBus.gain.setTargetAtTime(settings.engine ? ENGINE_VOLUME * level : 0, t, 0.15);
  engineOsc.frequency.setTargetAtTime(48 + 55 * level * speed, t, 0.2);
}

// A gentle A-minor arpeggio loop (Am, F, C, G), scheduled slightly ahead of the clock.
const CHORDS: { root: number; third: number }[] = [
  { root: 110, third: 3 },
  { root: 87.31, third: 4 },
  { root: 130.81, third: 4 },
  { root: 98, third: 4 },
];
const STEP_SECONDS = 0.3;

function startMusic() {
  if (!ctx || musicTimer) return;
  let next = ctx.currentTime + 0.1;
  let step = 0;
  const schedule = () => {
    if (!ctx || !musicBus || ctx.state !== 'running') return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.1;
    while (next < ctx.currentTime + 0.6) {
      const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
      const i = step % 8;
      const semis = [0, chord.third, 7, 12, 7, chord.third, 12, 7][i];
      if (i === 0 || i === 4) tone(chord.root, STEP_SECONDS * 3.5, 'triangle', 0.5, next - ctx.currentTime, undefined, musicBus);
      tone(chord.root * 2 * 2 ** (semis / 12), STEP_SECONDS * 0.9, 'sine', 0.35, next - ctx.currentTime, undefined, musicBus);
      next += STEP_SECONDS;
      step += 1;
    }
  };
  musicTimer = setInterval(schedule, 200);
}
