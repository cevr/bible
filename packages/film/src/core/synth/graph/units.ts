// The sound graph's units and limits: the one sample rate, the peak a render
// is made at, the longest a code sound may be and the most work it may take,
// and seconds as whole frames.

/** Every made sound is at the mix's rate, so it never resamples. */
export const SYNTH_RATE = 44100;

/** The peak every made sound is levelled to, in dBFS: the mix levels it by loudness after. */
export const SYNTH_PEAK = -1;

/** How long a code sound may be, in seconds, at the longest its draws allow. */
export const MAX_CODE_SECS = 120;

/**
 * The most a code sound's render may write, in seconds of frames summed over
 * its nodes and their repetitions, at the most its draws allow: a repeat of
 * repeats cannot ask for hours of samples.
 */
export const MAX_CODE_WORK = 3600;

/** How often a filter recomputes its coefficients, in frames. */
export const CONTROL = 32;

/** `secs` as whole frames at `SYNTH_RATE`: rounded once, so positions add as integers. */
export const framesOf = (secs: number): number => Math.max(0, Math.round(secs * SYNTH_RATE));

/**
 * The most onsets a Poisson repeat places: twice its mean and 16 more, which
 * a Poisson count passes with a chance under one in ten billion (the worst,
 * 4.6e-11, at a mean of 11).
 */
export const poissonCap = (rate: number, secs: number): number => Math.ceil(2 * rate * secs) + 16;
