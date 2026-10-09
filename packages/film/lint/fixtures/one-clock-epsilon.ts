// Fixture for film/one-clock-epsilon: each line marked RED fires the rule, and
// nothing else does.

declare const t: number;
declare const fps: number;
declare const from: number;
declare const CLOCK_EPSILON: number;
declare const words: ReadonlyArray<{ readonly start: number }>;

export const first = Math.ceil(t * fps - 1e-6); // RED film/one-clock-epsilon
export const slack = 0.5 / fps + 0.000001; // RED film/one-clock-epsilon
export const same = Math.abs(t - from) < 1e-9; // RED film/one-clock-epsilon
const NUDGE = 5e-5; // RED film/one-clock-epsilon
export const nudged = t + NUDGE;

// A millisecond taken from a time by hand, in a comparison and in a step.
export const heard = words.filter((w) => w.start >= from - 1e-3); // RED film/one-clock-epsilon
export const stepped = t + 0.001; // RED film/one-clock-epsilon
// CLOCK_EPSILON as the nudge of a rounding is a grid nudge, not a judgement of two times.
export const rounded = Math.ceil(t / 0.5 - CLOCK_EPSILON); // RED film/one-clock-epsilon
export const floored = Math.floor(CLOCK_EPSILON + t); // RED film/one-clock-epsilon

// A millisecond, a frame and zero are lengths a file keeps, not noise.
export const ms = 1e-3;
export const frame = 1 / 30;
export const none = t + 0;
export const tenth = 0.1;
export const longer = t + 0.01;
// CLOCK_EPSILON judges two times one.
export const one = Math.abs(t - from) < CLOCK_EPSILON;
export const sum = t + CLOCK_EPSILON;

// The same step on the left, as a quotient, or named by a module const.
const HALF_MS = 0.0005;
export const onTheLeft = 1e-3 + t; // RED film/one-clock-epsilon
export const quotient = t - 1 / 1000; // RED film/one-clock-epsilon
export const named = t + HALF_MS; // RED film/one-clock-epsilon
export const reversed = HALF_MS - t;
export const frameStep = t + 1 / 30;
export const secondsMinus = 1 - t;
