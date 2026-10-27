// First-run guide. `GameState.tutorial` is the current step; TUTORIAL_DONE means finished or skipped.
export const TUTORIAL_STEPS = ['tap', 'buy', 'strategy', 'goal', 'finish'] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];
export const TUTORIAL_DONE = 99;
export const TAPS_REQUIRED = 3;
export const TUTORIAL_REWARD = { gems: 25, clout: 25 };

export interface TutorialState {
  tutorial: number;
  // The reward is paid once, so replaying the guide from the Profile page can't farm it.
  tutorialRewarded: boolean;
  gems: number;
  clout: number;
}

export function tutorialStep(s: TutorialState): TutorialStep | null {
  return TUTORIAL_STEPS[s.tutorial] ?? null;
}

export function advanceTutorial(s: TutorialState): void {
  s.tutorial = s.tutorial + 1 < TUTORIAL_STEPS.length ? s.tutorial + 1 : TUTORIAL_DONE;
}

export function skipTutorial(s: TutorialState): void {
  s.tutorial = TUTORIAL_DONE;
}

export function restartTutorial(s: TutorialState): void {
  s.tutorial = 0;
}

// Pays the completion reward once; returns whether anything was paid.
export function claimTutorialReward(s: TutorialState): boolean {
  if (s.tutorialRewarded) return false;
  s.tutorialRewarded = true;
  s.gems += TUTORIAL_REWARD.gems;
  s.clout += TUTORIAL_REWARD.clout;
  return true;
}
