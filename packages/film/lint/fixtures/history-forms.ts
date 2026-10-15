// Fixture for effect/noHistoryComment under the repo's config (config.test.ts):
// each line marked RED fires the rule, and nothing else does.

// Fails under load (four times in passes 5 and 6). // RED effect/noHistoryComment
export const waits = 1;

/**
 * Counted over the film's frames (pass 6, each scene). // RED effect/noHistoryComment
 * Measured in the p4-sfx2 trials. // RED effect/noHistoryComment
 */
export const counted = 2;

// The two calls that differed (ab75a2a1). // RED effect/noHistoryComment
export const calls = 3;

// The gap a Monitor used to fall into. // RED effect/noHistoryComment
export const gap = 4;

// The stage says the frame landed (PA-11). // RED effect/noHistoryComment
// Read at the first screen only (UR2-17, the budget). // RED effect/noHistoryComment
// The message a rebind leaves stale, R3-film-lab-server-8. // RED effect/noHistoryComment
// Every page fits a phone (G8, `fitsPhone`). // RED effect/noHistoryComment
// The probe from the pass-2 guardrails. // RED effect/noHistoryComment
export const ledger = 6;

// Names that are not a ledger's pass: an FNV-1a hash, SHA-256, UTF-16, an MP3,
// an S3 bucket on R2, the F6 key, a scene's beat D2, a still A-01.jpg.

// Today's reason passes: a crossfade is used to hide the seam, and a mark is
// the time a word lands. Used to rank candidates before a person hears them.
// A colour is #a1b2c3 or 0x1f2e3d4c; a count is 1234567; a word is effaced.
// The second pass of the mix reads the first pass's peaks; a bypass 3 dB down.
export const today = 5;
