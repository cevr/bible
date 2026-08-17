/** The one Strong's decoder, at the one place both seams read it (should-fix 5).
 *
 *  `StrongsNumber` is the whole payload of `v1.study.strongs.get` and the whole
 *  argument of `bible study strongs`. Before this it was *also* two different
 *  contracts: the CLI uppercased its argument before decoding and the RPC did
 *  not, so `h8548` was a valid invocation of one seam and a rejected request at
 *  the other — a divergence neither side's tests could see, because each tested
 *  only what it accepted.
 *
 *  The assertions below are the contract itself rather than a sample of it, and
 *  `packages/cli/test/commands/study.test.ts` runs the real command against the
 *  same inputs, so the claim "both seams agree" is checked at both seams and not
 *  asserted here about one.
 */

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { StrongsNumber } from './model.js';

const decode = Schema.decodeUnknownExit(StrongsNumber);

const accepts = (input: string): string => {
  const outcome = decode(input);
  expect(outcome._tag).toBe('Success');
  if (outcome._tag !== 'Success') return '';
  return outcome.value;
};

const rejects = (input: string): void => {
  expect(decode(input)._tag).toBe('Failure');
};

describe('StrongsNumber', () => {
  test('accepts the corpus spelling unchanged', () => {
    expect(accepts('H8548')).toBe('H8548');
    expect(accepts('G1')).toBe('G1');
  });

  test('normalizes case rather than rejecting it', () => {
    // `bible.db`'s `strongs.number` column stores the uppercase form, so
    // `h8548` names a row that exists and the only open question is who
    // spells it. The schema answers that once, for both seams.
    expect(accepts('h8548')).toBe('H8548');
    expect(accepts('g1')).toBe('G1');
  });

  test('rejects a leading zero, which the corpus never stores', () => {
    // `H0001` is not a lexicon row. Accepting the form would return an empty
    // result for an input that looks answered; refusing it at the boundary is
    // where the caller can still be told.
    rejects('H0001');
    rejects('h0001');
    rejects('G0001');
    rejects('H0');
  });

  test('rejects everything that is not a Strong’s number', () => {
    rejects('8548');
    rejects('X8548');
    rejects('H');
    rejects('H8548a');
    rejects(' H8548');
    rejects('H8548 ');
    rejects('');
  });

  test('encodes back to the stored spelling', () => {
    // The brand rides on the normalized value, so encoding has nothing to
    // undo — which is what lets the CLI’s `--json` and the RPC wire carry
    // the same string for the same number.
    const encode = Schema.encodeUnknownExit(StrongsNumber);
    const outcome = encode('H8548');
    expect(outcome._tag).toBe('Success');
    if (outcome._tag !== 'Success') return;
    expect(outcome.value).toBe('H8548');
  });
});
