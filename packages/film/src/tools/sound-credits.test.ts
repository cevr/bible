// A CC BY recording a film places owes its line: on the credit roll under a
// "Sound" head, in the whole film's video description with its pages linked,
// and `film check` fails the film whose roll does not give it.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { type Credit, creditRoll } from '../canvas/credits.ts';
import { layout } from '../core/layout.ts';
import type { Sound } from '../core/schema.ts';
import { type Library, defineLibrary, soundCredits } from '../core/sfx.ts';
import { measuredSounds } from '../core/testing.ts';
import { staticFindings } from './check.ts';
import { levelOf } from './findings.ts';
import { videoDescription } from './render-plan.ts';
import { testFilm } from './testing.ts';

const library: Library = defineLibrary({
  'amb.hall': {
    kind: 'recorded',
    licence: {
      id: 'CC-BY-4.0',
      title: 'M Murmer long loop.wav',
      author: 'Processaurus',
      authorUrl: 'https://freesound.org/people/Processaurus',
      source: 'https://freesound.org/people/Processaurus/sounds/440098',
      changed: true,
    },
    use: 'bed',
  },
  'amb.house': {
    kind: 'recorded',
    licence: {
      id: 'CC0-1.0',
      author: 'craigsmith',
      source: 'https://freesound.org/people/craigsmith/sounds/438369',
    },
    use: 'bed',
  },
});

const cue = { scene: 'cold', at: 'start' } as const;
const placing = (...beds: ReadonlyArray<string>): Sound => ({
  beds: beds.map((sound) => ({ sound, from: cue, to: cue })),
  effects: {},
});

const LINE = '"M Murmer long loop.wav" by Processaurus, CC BY 4.0, changed';

describe('the credit roll', () => {
  test('gives each CC BY recording the film places its line under a Sound head, last', () => {
    const roll = creditRoll('T', [], [], soundCredits(library, placing('amb.house', 'amb.hall')));
    const head = roll.findIndex((c) => c.text === 'Sound');
    expect(roll[head]?.kind).toBe('head');
    const items = roll.slice(head + 1);
    expect(items.every((c) => c.kind === 'item')).toBe(true);
    // Wrapped at the measure, as every line of the roll is.
    expect(items.map((c) => c.text).join(' ')).toBe(LINE);
    expect(items.length).toBeGreaterThan(1);
  });

  test('has no Sound head when the film owes no line', () => {
    const roll = creditRoll('T', [], [], soundCredits(library, placing('amb.house')));
    expect(roll.some((c) => c.text === 'Sound')).toBe(false);
  });
});

describe('film check', () => {
  const scenes = [{ id: 'cold', min: 2 }];
  const timings = { voice: '', scenes: {} };
  const placed = Result.getOrThrow(layout(scenes, timings));
  const sounds = measuredSounds(library, {}, '/sounds');
  /** What the static leg says of the film's credits, placing `sound` and rolling `credits`. */
  const creditsFound = (sound: Sound, credits: Option.Option<ReadonlyArray<Credit>>) =>
    staticFindings(
      { ...testFilm(scenes, timings), sound: Option.some(sound), sounds, credits },
      placed,
      {
        master: Option.none(),
        key: Option.none(),
        file: 'narration/full.wav',
      },
    ).filter((f) => f._tag === 'SoundCreditMissing');
  const sound = placing('amb.hall');

  test('fails a film whose roll does not give a CC BY line it owes', () => {
    const found = creditsFound(sound, Option.some(creditRoll('T', [], [])));
    expect(found).toMatchObject([{ _tag: 'SoundCreditMissing', line: LINE, roll: true }]);
    expect(found.map((f) => levelOf(f, { allowStale: true }))).toEqual(['error']);
    expect(creditsFound(sound, Option.none())).toMatchObject([
      { _tag: 'SoundCreditMissing', line: LINE, roll: false },
    ]);
  });

  test('passes a roll that gives the line, and a film that owes none', () => {
    const roll = creditRoll('T', [], [], soundCredits(library, sound));
    expect(creditsFound(sound, Option.some(roll))).toEqual([]);
    expect(creditsFound(placing('amb.house'), Option.none())).toEqual([]);
  });
});

describe('a CC BY recording kept as code from its fit', () => {
  const kept: Library = defineLibrary({
    ...library,
    'amb.hall': {
      kind: 'code',
      sound: { play: { _tag: 'Noise', color: 'pink', secs: 1 } },
      variants: 3,
      licence: {
        id: 'CC-BY-4.0',
        title: 'M Murmer long loop.wav',
        author: 'Processaurus',
        authorUrl: 'https://freesound.org/people/Processaurus',
        source: 'https://freesound.org/people/Processaurus/sounds/440098',
        changed: true,
      },
      use: 'bed',
    },
  });

  test('rolls the same line and gives the same description as the recording did', () => {
    const sound = placing('amb.house', 'amb.hall');
    expect(creditRoll('T', [], [], soundCredits(kept, sound))).toEqual(
      creditRoll('T', [], [], soundCredits(library, sound)),
    );
    expect(videoDescription(['0:00 Cold open'], soundCredits(kept, sound))).toEqual(
      videoDescription(['0:00 Cold open'], soundCredits(library, sound)),
    );
    expect(soundCredits(kept, sound)).toHaveLength(1);
  });
});

describe('videoDescription', () => {
  test('gives the chapters, then each credit owed with its pages linked', () => {
    expect(
      videoDescription(
        ['0:00 Cold open', '0:42 The law'],
        soundCredits(library, placing('amb.hall')),
      ),
    ).toEqual(
      Option.some(
        [
          '0:00 Cold open',
          '0:42 The law',
          '',
          'Sound:',
          '"M Murmer long loop.wav" (https://freesound.org/people/Processaurus/sounds/440098) by Processaurus (https://freesound.org/people/Processaurus), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), changed',
          '',
        ].join('\n'),
      ),
    );
  });

  test('is none when there are neither chapters nor credits', () => {
    expect(videoDescription([], soundCredits(library, placing('amb.house')))).toEqual(
      Option.none(),
    );
  });
});
