import { describe, expect, it } from 'vitest';
import { newGame, loadGame, SAVE_KEY } from './save';
import { advanceTutorial, claimTutorialReward, restartTutorial, skipTutorial, tutorialStep, TUTORIAL_DONE, TUTORIAL_REWARD, TUTORIAL_STEPS } from './tutorial';

const store = (data: object | null) => ({
  getItem: () => (data ? JSON.stringify(data) : null),
  setItem: () => {},
  removeItem: () => {},
});

describe('tutorial', () => {
  it('starts on the first step for a new game with no starting clout', () => {
    const s = newGame();
    expect(tutorialStep(s)).toBe('tap');
    expect(s.clout).toBe(0);
    expect(s.tutorialRewarded).toBe(false);
  });

  it('walks through every step then finishes', () => {
    const s = newGame();
    for (let i = 1; i < TUTORIAL_STEPS.length; i++) {
      advanceTutorial(s);
      expect(tutorialStep(s)).toBe(TUTORIAL_STEPS[i]);
    }
    advanceTutorial(s);
    expect(s.tutorial).toBe(TUTORIAL_DONE);
    expect(tutorialStep(s)).toBeNull();
  });

  it('pays the reward only once, even after a replay', () => {
    const s = newGame();
    expect(claimTutorialReward(s)).toBe(true);
    expect(s.gems).toBe(TUTORIAL_REWARD.gems);
    expect(s.clout).toBe(TUTORIAL_REWARD.clout);
    restartTutorial(s);
    expect(tutorialStep(s)).toBe('tap');
    expect(claimTutorialReward(s)).toBe(false);
    expect(s.gems).toBe(TUTORIAL_REWARD.gems);
  });

  it('skipping ends the guide without paying', () => {
    const s = newGame();
    skipTutorial(s);
    expect(s.tutorial).toBe(TUTORIAL_DONE);
    expect(s.gems).toBe(0);
  });

  it('does not show the guide for saves from before it existed', () => {
    const old = { ...newGame(), clout: 4 } as Partial<ReturnType<typeof newGame>>;
    delete old.tutorial;
    delete old.tutorialRewarded;
    const s = loadGame(store(old));
    expect(s.tutorial).toBe(TUTORIAL_DONE);
    expect(s.tutorialRewarded).toBe(true);
    expect(s.clout).toBe(4);
    expect(SAVE_KEY).toBeTruthy();
  });

  it('keeps an in-progress guide when reloading', () => {
    const mid = { ...newGame(), tutorial: 2 };
    expect(loadGame(store(mid)).tutorial).toBe(2);
  });
});
