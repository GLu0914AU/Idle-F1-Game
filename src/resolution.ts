export const GAME_W = 540;
export const GAME_H = 960;

// The canvas is rendered at this multiple of the logical size, then fitted to the screen, so text and lines stay sharp.
export const RES = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
