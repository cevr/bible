import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import {
  DEFAULT_JITTER,
  type Library,
  type Lock,
  LockJson,
  type Variant,
  SILENT,
  VOICE_LEVEL,
  creditsOf,
  defineLibrary,
  gainFor,
  jitterOf,
  levelOf,
  lockLoudness,
  pendingOf,
  playPlacings,
  requestKey,
  resolveSound,
  resolveUse,
  soundState,
  variantCount,
} from './sfx.ts';

const library = defineLibrary({
  'paper.slide': {
    kind: 'generated',
    prompt: 'a sheet of paper slides across a desk',
    secs: 1,
    use: 'one-shot',
  },
  'paper.tear': { kind: 'generated', prompt: 'paper tears', secs: 0.8, use: 'one-shot' },
  'amb.court': {
    kind: 'generated',
    prompt: 'a quiet stone courtroom',
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
    expect(requestKey({ ...slide, prompt: 'another' })).not.toBe(requestKey(slide));
    expect(requestKey({ ...slide, secs: 2 })).not.toBe(requestKey(slide));
    expect(requestKey({ ...slide, influence: 0.9 })).not.toBe(requestKey(slide));
    // The API's default influence is the same request as naming it.
    expect(requestKey({ ...slide, influence: 0.3 })).toBe(requestKey(slide));
  });

  test('a recipe is its request', () => {
    const chime = library['tone.chime'];
    expect(requestKey({ ...chime, variants: 3 })).toBe(requestKey(chime));
    expect(requestKey({ ...chime, recipe: { ...chime.recipe, root: 'E5' } })).not.toBe(
      requestKey(chime),
    );
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
    expect(variantCount(slide, lock)).toBe(1);
    expect(pendingOf({ ...slide, prompt: 'else' }, lock)).toHaveLength(0);
  });

  test('kept variants for this request are current', () => {
    const lock = Option.some({ variants: [made(requestKey(slide))], candidates: [], rejected: [] });
    expect(soundState(slide, lock)).toEqual({ _tag: 'Current', variants: 1, candidates: 0 });
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
