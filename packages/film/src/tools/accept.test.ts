// `--accept-mismatch`: the beats whose mismatched take is kept, named, or the
// `--only` beats when it goes bare; and the command line read so a bare flag
// stays bare.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { acceptedBeats, bareAcceptMismatch } from './accept.ts';

const known = ['a', 'b', 'c'];
const only = (...ids: ReadonlyArray<string>) => Option.some(new Set(ids));

describe('acceptedBeats', () => {
  test('none without the flag', () => {
    expect(Result.getOrThrow(acceptedBeats(Option.none(), Option.none(), known))).toEqual(
      new Set(),
    );
  });

  test('the beats it names', () => {
    expect(Result.getOrThrow(acceptedBeats(Option.some('a,c'), Option.none(), known))).toEqual(
      new Set(['a', 'c']),
    );
  });

  test('bare, the --only beats; bare without --only names nothing and fails', () => {
    expect(Result.getOrThrow(acceptedBeats(Option.some(''), only('b'), known))).toEqual(
      new Set(['b']),
    );
    const bare = acceptedBeats(Option.some(''), Option.none(), known);
    expect(Result.isFailure(bare) && bare.failure).toMatchObject({ _tag: 'AcceptMismatchUnnamed' });
  });

  test('a beat the film does not have fails, naming it', () => {
    const typo = acceptedBeats(Option.some('a,nope'), Option.none(), known);
    expect(Result.isFailure(typo) && typo.failure).toMatchObject({
      _tag: 'UnknownScene',
      scene: 'nope',
    });
  });
});

describe('bareAcceptMismatch', () => {
  test('a bare flag, last or before another flag, is given an empty value', () => {
    expect(bareAcceptMismatch(['takes', 'import', 'f', 'rec', '--accept-mismatch'])).toEqual([
      'takes',
      'import',
      'f',
      'rec',
      '--accept-mismatch=',
    ]);
    expect(bareAcceptMismatch(['narrate', 'f', '--accept-mismatch', '--only', 'b'])).toEqual([
      'narrate',
      'f',
      '--accept-mismatch=',
      '--only',
      'b',
    ]);
  });

  test('a flag with its beats, or its value inline, is left as it is', () => {
    const named = ['narrate', 'f', '--accept-mismatch', 'a,b'];
    expect(bareAcceptMismatch(named)).toEqual(named);
    const inline = ['narrate', 'f', '--accept-mismatch=a'];
    expect(bareAcceptMismatch(inline)).toEqual(inline);
  });
});
