import { beforeEach, describe, expect, it } from 'vitest';
import { MIN_GAP, mergeAudioSettings, newAudioSettings, playSound, resetRateLimit, setEngine, shouldPlay, syncAudio, unlockAudio } from './audio';
import { loadGame, newGame } from './save';

describe('audio settings', () => {
  it('start with everything on', () => {
    expect(newAudioSettings()).toMatchObject({ sound: true, engine: true, music: true, haptics: true });
    expect(newGame().settings).toEqual(newAudioSettings());
  });

  it('merge fills gaps, keeps choices and clamps the volume', () => {
    expect(mergeAudioSettings(undefined)).toEqual(newAudioSettings());
    expect(mergeAudioSettings({ music: false, volume: 5 })).toMatchObject({ music: false, sound: true, volume: 1 });
    expect(mergeAudioSettings({ volume: -2 }).volume).toBe(0);
    expect(mergeAudioSettings({ volume: Number.NaN }).volume).toBe(newAudioSettings().volume);
  });

  it('are saved and old saves load with defaults', () => {
    const s = newGame();
    s.settings.music = false;
    const store = { getItem: () => JSON.stringify(s), setItem: () => {}, removeItem: () => {} };
    expect(loadGame(store).settings.music).toBe(false);
    const old = { getItem: () => JSON.stringify({ gems: 1 }), setItem: () => {}, removeItem: () => {} };
    expect(loadGame(old).settings).toEqual(newAudioSettings());
  });
});

describe('sound rate limit', () => {
  beforeEach(() => resetRateLimit());

  it('blocks a repeat inside the gap and allows it after', () => {
    expect(shouldPlay('tap', 10)).toBe(true);
    expect(shouldPlay('tap', 10 + MIN_GAP.tap / 2)).toBe(false);
    expect(shouldPlay('tap', 10 + MIN_GAP.tap + 0.01)).toBe(true);
  });

  it('limits each sound separately', () => {
    expect(shouldPlay('pit', 5)).toBe(true);
    expect(shouldPlay('safety', 5)).toBe(true);
  });
});

describe('without audio support', () => {
  it('every call is a safe no-op', () => {
    expect(() => {
      unlockAudio();
      syncAudio(newAudioSettings());
      setEngine(1, 2);
      playSound('win');
      playSound('tap');
    }).not.toThrow();
  });
});
