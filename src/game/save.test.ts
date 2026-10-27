import { describe, expect, it } from 'vitest';
import { SAVE_KEY, loadGame, newGame, resetGame, saveGame } from './save';

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('save', () => {
  it('returns a new game when nothing is saved', () => {
    expect(loadGame(memoryStore(), 1).season).toBe(1);
  });

  it('round-trips state', () => {
    const s = memoryStore();
    const g = newGame();
    g.money = 123;
    g.upgrades.engine = 4;
    saveGame(g, s, 99);
    const loaded = loadGame(s);
    expect(loaded.money).toBe(123);
    expect(loaded.upgrades.engine).toBe(4);
    expect(loaded.lastSavedAt).toBe(99);
  });

  it('fills missing fields from older saves', () => {
    const s = memoryStore();
    s.setItem(SAVE_KEY, JSON.stringify({ money: 5, upgrades: { engine: 2 } }));
    const g = loadGame(s);
    expect(g.money).toBe(5);
    expect(g.upgrades.aero).toBe(0);
    expect(g.upgrades.engine).toBe(2);
  });

  it('survives corrupt data', () => {
    const s = memoryStore();
    s.setItem(SAVE_KEY, '{nope');
    expect(loadGame(s).money).toBe(0);
  });

  it('resets', () => {
    const s = memoryStore();
    saveGame(newGame(), s);
    resetGame(s);
    expect(s.getItem(SAVE_KEY)).toBeNull();
  });
});
