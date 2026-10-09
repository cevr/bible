// Fixture for film/one-clock-epsilon: each line marked RED fires the rule, and
// nothing else does.

declare const t: number;
declare const fps: number;
declare const from: number;

export const first = Math.ceil(t * fps - 1e-6); // RED film/one-clock-epsilon
export const slack = 0.5 / fps + 0.000001; // RED film/one-clock-epsilon
export const same = Math.abs(t - from) < 1e-9; // RED film/one-clock-epsilon
const NUDGE = 5e-5; // RED film/one-clock-epsilon
export const nudged = t + NUDGE;

// A millisecond, a frame and zero are lengths a file keeps, not noise.
export const ms = t - 1e-3;
export const frame = 1 / 30;
export const none = t + 0;
export const tenth = 0.1;
