// The audit's rules read in order, each word as itself (each prompt read as
// one generated sound's, as `sfx audit` reads a library), and its verdicts on
// the app's own library: the 39 generated sounds' (10 code can make for
// sure, 3 worth a try, 26 that need realism), pinned so that a new rule or a
// reworded prompt shows which verdict it moved.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { library } from '../../../../apps/animations/sounds/library.ts';
import { auditLibrary } from './sfx-audit.ts';
import { Library } from './sfx.ts';

/** `prompt`'s verdict, as the audit reads a library holding one generated sound that asks for it. */
const auditPrompt = (prompt: string) =>
  auditLibrary(
    Schema.decodeSync(Library)({
      'a.sound': {
        kind: 'generated',
        prompt,
        why: 'a test sound',
        secs: 1,
        candidates: 1,
        use: 'one-shot',
      },
    }),
  )[0]?.audited;

describe('a prompt audited', () => {
  test('voices decide before a shape: a crowd in the rain needs realism', () => {
    expect(auditPrompt('a crowd waiting in the rain')).toEqual({
      verdict: 'realism',
      reason: 'voices, creatures or life far off',
      words: ['crowd'],
    });
  });

  test('a handled texture decides before a shape: a flag flapping in the wind', () => {
    expect(auditPrompt('a flag flapping in the wind')?.words).toEqual(['flapping']);
    expect(auditPrompt('a flag flapping in the wind')?.verdict).toBe('realism');
  });

  test('a creak is worth a try before the wind that moves it', () => {
    expect(auditPrompt('a door creaking in the wind')).toEqual({
      verdict: 'code-try',
      reason: 'a borderline texture',
      words: ['creaking'],
    });
  });

  test('a shape decides before its material: a paper cutout swept past is a whoosh', () => {
    expect(auditPrompt('a paper cutout swept quickly past, soft whoosh')).toEqual({
      verdict: 'code-sure',
      reason: 'a shape code makes',
      words: ['swept', 'whoosh'],
    });
    expect(auditPrompt('a stack of paper dropped on a desk')).toEqual({
      verdict: 'realism',
      reason: 'a handled material',
      words: ['paper'],
    });
  });

  test('a word reads only as itself, whatever its case and the marks around it', () => {
    expect(auditPrompt('a tapestry hung on the wall')?.verdict).toBe('code-try');
    expect(auditPrompt('Rain, steady; RAIN again')?.words).toEqual(['rain']);
  });

  test('a prompt no rule holds is worth a try, with no words', () => {
    expect(auditPrompt('a quiet empty room')).toEqual({
      verdict: 'code-try',
      reason: 'no rule matched',
      words: [],
    });
  });
});

/** The app library's verdicts, as `sfx audit` reads them (design 6.1). */
const VERDICTS = {
  'code-sure': [
    'amb.desert',
    'amb.rain',
    'wood.gavel',
    'stamp.press',
    'stones.dust',
    'tablet.set',
    'paper.whoosh',
    'stain.hiss',
    'snake.hiss',
    'book.close',
  ],
  'code-try': ['rope.creak', 'stone.roll', 'pole.creak'],
  realism: [
    'amb.court',
    'amb.hall',
    'amb.house',
    'amb.town',
    'amb.garden',
    'amb.roof',
    'amb.dawn',
    'paper.stack',
    'paper.slide',
    'paper.flip',
    'crowd.swell',
    'roof.tiles',
    'wings.pass',
    'cloth.banner',
    'mat.roll',
    'steps.dirt',
    'dust.writing',
    'tape.measure',
    'needle.thread',
    'leaves.rustle',
    'glass.scrub',
    'paper.tear',
    'cloth.lift',
    'loom.weave',
    'cloth.settle',
    'coins.clatter',
  ],
} as const;

describe("the app library's verdicts", () => {
  const audited = auditLibrary(library);
  const named = (verdict: keyof typeof VERDICTS) =>
    audited.filter((sound) => sound.audited.verdict === verdict).map((sound) => sound.name);

  test('every generated sound is audited, and nothing else', () => {
    expect(audited.length).toBe(39);
    expect(audited.every((sound) => sound.entry.kind === 'generated')).toBe(true);
  });

  test('ten are sounds code can make for sure: the first round of code trials', () => {
    expect(named('code-sure').toSorted()).toEqual([...VERDICTS['code-sure']].toSorted());
  });

  test('three are worth a try: the creaks and the rolled stone', () => {
    expect(named('code-try').toSorted()).toEqual([...VERDICTS['code-try']].toSorted());
  });

  test('twenty-six need realism and stay generated', () => {
    expect(named('realism').toSorted()).toEqual([...VERDICTS.realism].toSorted());
  });
});
