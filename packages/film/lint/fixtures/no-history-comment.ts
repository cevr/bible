// Fixture for film/no-history-comment: each line marked RED fires the rule, and
// nothing else does.

// Fails under load (four times in passes 5 and 6). // RED film/no-history-comment
export const waits = 1;

/**
 * Counted over the film's frames (pass 6, each scene). // RED film/no-history-comment
 * Measured in the p4-sfx2 trials. // RED film/no-history-comment
 */
export const counted = 2;

// The two calls that differed (ab75a2a1). // RED film/no-history-comment
export const calls = 3;

// The stage says the frame landed (PA-11). // RED film/no-history-comment
// Read at the first screen only (UR2-17, the budget). // RED film/no-history-comment
// The message a rebind leaves stale, R3-film-lab-server-8. // RED film/no-history-comment
// Every page fits a phone (G8, `fitsPhone`). // RED film/no-history-comment
// The probe from the pass-2 guardrails. // RED film/no-history-comment
// The guard the sweep named GUARDS6-4. // RED film/no-history-comment
// Read through the address bar, as URL6-6 found. // RED film/no-history-comment
// One edit at a time (EDIT6-8). // RED film/no-history-comment
// A case the sweep added, NEW6-8. // RED film/no-history-comment
export const ledger = 6;

// Names that are not a ledger's pass: an FNV-1a hash, SHA-256, UTF-16, an MP3,
// an S3 bucket on R2, the F6 key, a scene's beat D2, a still A-01.jpg.

// Today's reason passes: a crossfade is used to hide the seam, and a mark is
// the time a word lands. Used to rank candidates before a person hears them.
// A colour is #a1b2c3 or 0x1f2e3d4c; a count is 1234567; a word is effaced.
// The second pass of the mix reads the first pass's peaks; a bypass 3 dB down.
// History told in words is the reviewer's to find: the gap a Monitor used to
// fall into is not a form the rule can read.
export const today = 5;

// A value the code reads is not history: Hex.encode("hello") is "68656c6c6f",
// and a head is checked out as 'ab75a2a1'. A pinned source is a link:
// https://github.com/nodejs/node/blob/e77694631f1642c302f664703197b5aabc65b482/lib/errors.js
// A code span is code: `G1 ∪ G2`, `ab75a2a1`. A class is not an id: /[^a-zA-Z0-9-]+/.
export const values = 7;
