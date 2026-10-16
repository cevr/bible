import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import {
  DEFAULT_JITTER,
  Library,
  LibraryEntry,
  type Lock,
  LockJson,
  type Variant,
  SILENT,
  VOICE_LEVEL,
  candidatesOf,
  creditsOf,
  influenceOf,
  defineLibrary,
  gainFor,
  heardSource,
  jitterOf,
  levelOf,
  lockLoudness,
  pendingOf,
  playPlacings,
  requestKey,
  resolveSound,
  resolveUse,
  seedSources,
  soundState,
  sourceLabel,
  trialSources,
} from './sfx.ts';
import type { Recipe } from './synth/recipes.ts';
import { resolveCode } from './synth/resolve.ts';
import { measuredSounds } from './testing.ts';

const library = defineLibrary({
  'paper.slide': {
    kind: 'generated',
    prompt: 'a sheet of paper slides across a desk',
    why: 'a test sound',
    secs: 1,
    use: 'one-shot',
  },
  'paper.tear': {
    kind: 'generated',
    prompt: 'paper tears',
    why: 'a test sound',
    secs: 0.8,
    use: 'one-shot',
  },
  'amb.court': {
    kind: 'generated',
    prompt: 'a quiet stone courtroom',
    why: 'a test sound',
    secs: 20,
    loop: true,
    use: 'bed',
  },
  'tone.chime': {
    kind: 'procedural',
    recipe: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 2 },
    variants: 5,
    use: 'one-shot',
  },
  'room.paper': {
    kind: 'procedural',
    recipe: { recipe: 'room', secs: 20 },
    variants: 1,
    use: 'bed',
    level: -36,
    duck: false,
  },
}) satisfies Library;

const loud = (integrated: number, momentaryMax: number) => ({ integrated, momentaryMax, peak: -1 });

describe('requestKey', () => {
  test('changes with what changes the audio, and only that', () => {
    const slide = library['paper.slide'];
    expect(requestKey({ ...slide, level: -4 })).toBe(requestKey(slide));
    expect(requestKey({ ...slide, jitter: { pitch: 0, gain: 0 } })).toBe(requestKey(slide));
    // Why it is generated is not what it sounds like: its takes stay current.
    expect(requestKey({ ...slide, why: 'another' })).toBe(requestKey(slide));
    expect(requestKey({ ...slide, prompt: 'another' })).not.toBe(requestKey(slide));
    expect(requestKey({ ...slide, secs: 2 })).not.toBe(requestKey(slide));
    expect(requestKey({ ...slide, influence: 0.9 })).not.toBe(requestKey(slide));
    // The default influence for its use is the same request as naming it.
    expect(requestKey({ ...slide, influence: 0.7 })).toBe(requestKey(slide));
    const court = library['amb.court'];
    expect(requestKey({ ...court, influence: 0.3 })).toBe(requestKey(court));
  });

  // The sweet-spot trials: a one-shot followed its prompt closely only
  // from 0.7 up (a gavel at 0.5 came out 20–30 dB quieter and boomy); a bed
  // keeps the model's own air. About a third of the takes were usable, so a
  // one-shot is made as 6 and a bed as 3.
  test('a one-shot defaults to influence 0.7 and 6 candidates, a bed to 0.3 and 3', () => {
    expect(influenceOf(library['paper.slide'])).toBe(0.7);
    expect(influenceOf(library['amb.court'])).toBe(0.3);
    expect(influenceOf({ ...library['paper.slide'], influence: 0.5 })).toBe(0.5);
    expect(candidatesOf(library['paper.slide'])).toBe(6);
    expect(candidatesOf(library['amb.court'])).toBe(3);
  });

  test('a recipe is its request', () => {
    const chime = library['tone.chime'];
    expect(requestKey({ ...chime, variants: 3 })).toBe(requestKey(chime));
    expect(requestKey({ ...chime, recipe: { ...chime.recipe, root: 'E5' } })).not.toBe(
      requestKey(chime),
    );
  });
});

describe('a procedural sound', () => {
  const decode = Schema.decodeResult(Library);
  /** A recipe as an entry writes it, before its entry checks it. */
  type Written = typeof Recipe.Encoded;
  /** A library of one procedural sound, `name`, made by `recipe`. */
  const procedural = (name: string, recipe: Written): typeof Library.Encoded => ({
    [name]: { kind: 'procedural', recipe, variants: 3, use: 'one-shot' },
  });
  /** Why `library` is refused, or none when it decodes. */
  const refusal = (library: typeof Library.Encoded) =>
    Result.match(decode(library), {
      onFailure: (error) => Option.some(error.message),
      onSuccess: () => Option.none<string>(),
    });

  test('is refused at its entry, by name, when its code trial would pass what a render may', () => {
    // Room tone's port is made a second longer to loop: 119.5 s ports to 120.5 s.
    const room = Option.getOrThrow(
      refusal(procedural('room.long', { recipe: 'room', secs: 119.5 })),
    );
    expect(room).toContain('room.long');
    expect(room).toContain('120.5 s');
    // Twelve notes up `G8`'s scale climb to `E10`, past the graph's top octave, 8.
    const high: Written = { recipe: 'notes', root: 'G8', count: 12, secs: 1 };
    const notes = Option.getOrThrow(refusal(procedural('notes.high', high)));
    expect(notes).toContain('notes.high');
    expect(notes).toContain('D9');
    // Twelve plinks of 103 s each write more than an hour of frames.
    const long: Written = { recipe: 'notes', root: 'C4', count: 12, secs: 103 };
    const work = Option.getOrThrow(refusal(procedural('notes.long', long)));
    expect(work).toContain('notes.long');
    expect(work).toContain('3600 s');
  });

  test('every recipe its entry takes loads: its code trial never fails the walk', () => {
    const SECS = [8, 102, 103, 119, 119.5, 120, 120.5];
    const ROOTS = ['G4', 'D7', 'D#7', 'D8', 'D#8', 'A8', 'A#8'];
    const recipes = SECS.flatMap((secs): ReadonlyArray<Written> => [
      { recipe: 'room', secs },
      { recipe: 'wind', secs },
      { recipe: 'rain', secs },
      ...ROOTS.flatMap((root): ReadonlyArray<Written> => [
        { recipe: 'bell', root, partials: 'glass', secs },
        { recipe: 'drone', root, secs },
        { recipe: 'drain', from: root, to: 'C2', secs },
        { recipe: 'drain', from: 'C2', to: root, secs },
        { recipe: 'bloom', root, secs },
        { recipe: 'notes', root, count: 12, secs },
        { recipe: 'notes', root, count: 1, secs },
      ]),
    ]);
    const taken = recipes.flatMap((recipe) =>
      Result.match(decode(procedural('tone.made', recipe)), {
        onFailure: () => [],
        onSuccess: (library) => [{ recipe, walked: resolveCode(library) }],
      }),
    );
    expect(taken.filter(({ walked }) => Result.isFailure(walked))).toEqual([]);
    // Both sides are reached: the sweep crosses every limit.
    expect(taken.length).toBeGreaterThan(0);
    expect(taken.length).toBeLessThan(recipes.length);
  });
});

describe('a generated sound', () => {
  test('says why it needs realism: one with no why, or an empty one, is refused', () => {
    const decode = Schema.decodeUnknownResult(LibraryEntry);
    const { why: _why, ...unsaid } = library['paper.slide'];
    expect(Result.isSuccess(decode(library['paper.slide']))).toBe(true);
    expect(Result.isFailure(decode(unsaid))).toBe(true);
    expect(Result.isFailure(decode({ ...unsaid, why: '' }))).toBe(true);
  });
});

describe('resolveSound', () => {
  test('a typo fails naming the family', () => {
    const missing = resolveSound(library, 'paper.slid');
    expect(Result.isFailure(missing)).toBe(true);
    Result.match(missing, {
      onSuccess: () => expect.unreachable(),
      onFailure: (e) => expect(e.known).toEqual(['paper.slide', 'paper.tear']),
    });
  });

  test('an unknown family lists every name', () => {
    Result.match(resolveSound(library, 'gong.big'), {
      onSuccess: () => expect.unreachable(),
      onFailure: (e) => expect(e.known).toHaveLength(Object.keys(library).length),
    });
  });

  test('a bed placed as a one-shot is refused', () => {
    Result.match(resolveUse(library, 'amb.court', 'one-shot'), {
      onSuccess: () => expect.unreachable(),
      onFailure: (e) => expect(e._tag).toBe('SoundUseMismatch'),
    });
    expect(Result.isSuccess(resolveUse(library, 'amb.court', 'bed'))).toBe(true);
  });
});

describe('levels', () => {
  test('the film names a level, else the library, else the use', () => {
    expect(levelOf(library['paper.slide'], Option.some(-8))).toBe(-8);
    expect(levelOf(library['paper.slide'], Option.none())).toBe(-10);
    expect(levelOf(library['room.paper'], Option.none())).toBe(-36);
    expect(levelOf(library['amb.court'], Option.none())).toBe(-28);
  });

  test('a one-shot is levelled by its momentary max, a bed by its integrated loudness', () => {
    // -8 under a voice at -17.1 is -25.1; a -20 LUFS peak comes down 5.1 dB.
    expect(20 * Math.log10(gainFor(-8, loud(-30, -20), 'one-shot'))).toBeCloseTo(
      VOICE_LEVEL - 8 + 20,
      6,
    );
    expect(20 * Math.log10(gainFor(-28, loud(-30, -20), 'bed'))).toBeCloseTo(
      VOICE_LEVEL - 28 + 30,
      6,
    );
  });

  test('silence is never lifted', () => {
    expect(gainFor(-8, loud(SILENT, SILENT), 'one-shot')).toBe(0);
  });

  test('the lock writes silence as its floor, to one decimal', () => {
    expect(
      lockLoudness({ integrated: Number.NEGATIVE_INFINITY, momentaryMax: -19.66, peak: -3.14 }),
    ).toEqual({ integrated: SILENT, momentaryMax: -19.7, peak: -3.1 });
  });
});

describe('jitter', () => {
  test('generated one-shots spread by default; tonal and bed sounds do not', () => {
    expect(jitterOf(library['paper.slide'])).toEqual(Option.some(DEFAULT_JITTER));
    expect(jitterOf(library['tone.chime'])).toEqual(Option.none());
    expect(jitterOf(library['amb.court'])).toEqual(Option.none());
    expect(jitterOf({ ...library['tone.chime'], jitter: { pitch: 0, gain: 1 } })).toEqual(
      Option.some({ pitch: 0, gain: 1 }),
    );
  });
});

describe('playPlacings', () => {
  const counts = new Map([
    ['paper.slide', 3],
    ['tone.chime', 5],
    ['paper.tear', 1],
  ]);
  const variants = (sound: string) =>
    Option.getOrElse(Option.fromUndefinedOr(counts.get(sound)), () => 1);
  const spread = (sound: string) =>
    Result.match(resolveSound(library, sound), {
      onSuccess: jitterOf,
      onFailure: () => Option.none(),
    });
  const placings = [
    { effect: 'slide', sound: 'paper.slide', at: 1 },
    { effect: 'card', sound: 'paper.slide', at: 2 },
    { effect: 'slide', sound: 'paper.slide', at: 3 },
    { effect: 'card', sound: 'paper.slide', at: 4 },
    { effect: 'slide', sound: 'paper.slide', at: 5 },
    { effect: 'lit', sound: 'tone.chime', at: 6 },
    { effect: 'tear', sound: 'paper.tear', at: 7 },
    { effect: 'tear', sound: 'paper.tear', at: 8 },
  ];

  test('never plays the variant the same sound played last, while it has another', () => {
    const played = playPlacings('film', placings, variants, spread);
    const slides = played.slice(0, 5).map((p) => p.variant);
    for (let i = 1; i < slides.length; i++) expect(slides[i]).not.toBe(slides[i - 1]);
    expect(played[6]?.variant).toBe(0);
    expect(played[7]?.variant).toBe(0);
  });

  test('is a pure function of the film and its placements, whatever order they come in', () => {
    const once = playPlacings('film', placings, variants, spread);
    const reversed = playPlacings('film', [...placings].reverse(), variants, spread);
    expect([...reversed].reverse()).toEqual([...once]);
    expect(playPlacings('other', placings, variants, spread)).not.toEqual(once);
  });

  test('jitter stays inside its spread; an unspread sound plays as made', () => {
    const played = playPlacings('film', placings, variants, spread);
    for (const p of played.slice(0, 5)) {
      expect(Math.abs(p.pitch)).toBeLessThanOrEqual(DEFAULT_JITTER.pitch);
      expect(Math.abs(p.gain)).toBeLessThanOrEqual(DEFAULT_JITTER.gain);
      expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.delay).toBeLessThanOrEqual(0.015);
    }
    expect(played[5]).toMatchObject({ pitch: 0, gain: 0, delay: 0 });
  });
});

describe('soundState', () => {
  const slide = library['paper.slide'];
  const made = (request: string): Variant => ({
    request,
    file: `files/paper.slide/${request}.flac`,
    sha256: request,
    made: '2026-09-29T12:00:00Z',
    model: 'eleven_text_to_sound_v2',
    format: 'pcm_44100',
    secs: 1,
    loudness: { integrated: -24, momentaryMax: -19.6, peak: -3.1 },
    licence: 'elevenlabs-paid-sfx',
    credits: 40,
  });

  test('nothing kept is missing; a procedural sound is derived', () => {
    expect(soundState(slide, Option.none())._tag).toBe('Missing');
    expect(soundState(library['tone.chime'], Option.none())).toEqual({
      _tag: 'Derived',
      variants: 5,
    });
  });

  test('kept variants for an older request are stale and still play', () => {
    const lock = Option.some({
      variants: [made('old')],
      candidates: [made(requestKey(slide))],
      rejected: [],
    });
    expect(soundState(slide, lock)).toEqual({ _tag: 'Stale', variants: 1, candidates: 1 });
    expect(pendingOf({ ...slide, prompt: 'else' }, lock)).toHaveLength(0);
  });

  test('kept variants for this request are current', () => {
    const lock = Option.some({ variants: [made(requestKey(slide))], candidates: [], rejected: [] });
    expect(soundState(slide, lock)).toEqual({ _tag: 'Current', variants: 1, candidates: 0 });
  });
});

describe('heardSource', () => {
  const tick = (pitch: string) =>
    ({ play: { _tag: 'Partials', pitch, set: 'glass', secs: 0.1 } }) as const;
  const heard = defineLibrary({
    'tone.tick': { kind: 'code', sound: tick('E5'), variants: 2, use: 'one-shot' },
    'tone.chime': {
      kind: 'generated',
      prompt: 'a chime',
      why: 'a test sound',
      secs: 1,
      use: 'one-shot',
      code: { sound: tick('A4'), variants: 3 },
    },
  });
  const sounds = measuredSounds(heard, {}, '');
  const own = seedSources(sounds, 'tone.tick', heard['tone.tick']);
  const trial = trialSources(sounds, 'tone.chime');

  test("finds a seed by its source's label: a code sound's own, a code trial's", () => {
    expect([own.length, trial.length]).toEqual([2, 3]);
    expect(trialSources(sounds, 'tone.tick')).toEqual([]);
    expect(heardSource(sounds, 'tone.tick', sourceLabel(own[1]!))).toEqual(Option.some(own[1]!));
    expect(heardSource(sounds, 'tone.chime', sourceLabel(trial[2]!))).toEqual(
      Option.some(trial[2]!),
    );
  });

  test("never another sound's seed, a seed past its own, or a take's sha256", () => {
    expect(heardSource(sounds, 'tone.chime', sourceLabel(own[0]!))).toEqual(Option.none());
    const past = sourceLabel({ ...own[1]!, seed: 3 });
    expect(heardSource(sounds, 'tone.tick', past)).toEqual(Option.none());
    expect(heardSource(sounds, 'paper.slide', '7e41c0a9d2f3aa')).toEqual(Option.none());
  });
});

describe('the lock file', () => {
  test('round-trips byte for byte', () => {
    const lock: Lock = {
      'paper.slide': {
        variants: [
          {
            request: requestKey(library['paper.slide']),
            file: 'files/paper.slide/7e41c0a9d2f3.flac',
            sha256: '7e41c0a9d2f3aa',
            made: '2026-09-29T12:00:00Z',
            model: 'eleven_text_to_sound_v2',
            format: 'pcm_44100',
            secs: 1,
            loudness: { integrated: -24, momentaryMax: -19.6, peak: -3.1 },
            licence: 'elevenlabs-paid-sfx',
            credits: creditsOf(library['paper.slide']),
          },
        ],
        candidates: [],
        rejected: ['b21c'],
      },
    };
    const text = Schema.encodeSync(LockJson)(lock);
    expect(text.endsWith('}\n')).toBe(true);
    expect(Schema.encodeSync(LockJson)(Schema.decodeSync(LockJson)(text))).toBe(text);
    expect(lock['paper.slide']?.variants[0]?.credits).toBe(40);
  });
});
