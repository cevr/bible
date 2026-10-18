import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import {
  DEFAULT_JITTER,
  type Library,
  LibraryEntry,
  type Lock,
  LockJson,
  type Variant,
  SILENT,
  VOICE_LEVEL,
  candidatesOf,
  creditLine,
  creditLink,
  creditsOf,
  influenceOf,
  defineLibrary,
  keptLoudness,
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
  keptFit,
  soundCredits,
  soundState,
  sourceLabel,
  trialSources,
} from './sfx.ts';
import { chime, room } from './synth/graph/presets.ts';
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
    kind: 'code',
    sound: { play: chime({ root: 'D5', partials: 'glass', secs: 2 }) },
    variants: 5,
    use: 'one-shot',
  },
  'room.paper': {
    kind: 'code',
    sound: { play: room({ secs: 20 }) },
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

  test("a code sound's request is its graph, not its seeds", () => {
    const tone = library['tone.chime'];
    expect(requestKey({ ...tone, variants: 3 })).toBe(requestKey(tone));
    const higher = chime({ root: 'E5', partials: 'glass', secs: 2 });
    expect(requestKey({ ...tone, sound: { play: higher } })).not.toBe(requestKey(tone));
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

describe('soundState and keptLoudness', () => {
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

  test('nothing kept is missing; a code sound is derived', () => {
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

  test('the kept variants’ mean loudness as the mix levels them; none kept, or a code sound, has none', () => {
    const quieter: Variant = {
      ...made('old'),
      loudness: { integrated: -30, momentaryMax: -21.6, peak: -5 },
    };
    const lock = Option.some({ variants: [made('new'), quieter], candidates: [], rejected: [] });
    expect(keptLoudness(slide, lock)).toEqual(Option.some(-20.6));
    expect(keptLoudness(library['amb.court'], lock)).toEqual(Option.some(-27));
    expect(keptLoudness(slide, Option.none())).toEqual(Option.none());
    // A code sound's lock holds the takes it was; its seeds play.
    expect(keptLoudness(library['tone.chime'], lock)).toEqual(Option.none());
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

// The owner's rule (2026-10-16): a recording may be CC0, or CC BY with a
// credits line. A CC BY licence carries everything its line says.
describe("a recording's licence", () => {
  const decode = Schema.decodeUnknownResult(LibraryEntry);
  const recorded = (licence: Readonly<Record<string, string | boolean>>) => ({
    kind: 'recorded',
    licence,
    use: 'bed',
  });
  const by = {
    id: 'CC-BY-4.0',
    title: 'city night hum 04 160927_0989.wav',
    author: 'klankbeeld',
    authorUrl: 'https://freesound.org/people/klankbeeld',
    source: 'https://freesound.org/people/klankbeeld/sounds/440621',
    openverse: '3bdb3b4b-c840-4fba-8033-48477bf14dee',
    changed: true,
  };

  test('takes CC0 as it stood, and CC BY 3.0 and 4.0 with their credit', () => {
    expect(
      Result.isSuccess(decode(recorded({ id: 'CC0-1.0', author: 'a', source: 'https://f/1' }))),
    ).toBe(true);
    expect(Result.isSuccess(decode(recorded(by)))).toBe(true);
    expect(Result.isSuccess(decode(recorded({ ...by, id: 'CC-BY-3.0' })))).toBe(true);
  });

  test('refuses a CC BY licence its line could not be written from, and any other licence', () => {
    const { title: _title, ...untitled } = by;
    const { changed: _changed, ...unsaid } = by;
    const { authorUrl: _url, ...unlinked } = by;
    for (const licence of [
      untitled,
      unsaid,
      unlinked,
      { ...by, title: '' },
      // A line that names nobody, or links to no page.
      { ...by, author: '' },
      { ...by, source: '' },
      { ...by, authorUrl: '' },
      { ...by, authorUrl: 'klankbeeld' },
      { ...by, source: 'http://freesound.org/people/klankbeeld/sounds/440621' },
    ])
      expect(Result.isFailure(decode(recorded(licence)))).toBe(true);
    // A CC0 record names its author and its page too.
    const free: ReadonlyArray<Readonly<Record<string, string>>> = [
      { id: 'CC0-1.0', author: '', source: 'https://f/1' },
      { id: 'CC0-1.0', author: 'a', source: '' },
      { id: 'CC0-1.0', author: 'a', source: 'https://f/1', authorUrl: 'a' },
    ];
    for (const licence of free) expect(Result.isFailure(decode(recorded(licence)))).toBe(true);
    for (const id of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-SA-4.0', 'Sampling+'])
      expect(Result.isFailure(decode(recorded({ ...by, id })))).toBe(true);
  });
});

describe('soundCredits', () => {
  const by = (title: string, source: string) =>
    ({
      id: 'CC-BY-4.0',
      title,
      author: 'klankbeeld',
      authorUrl: 'https://freesound.org/people/klankbeeld',
      source,
      changed: true,
    }) as const;
  const credited = defineLibrary({
    ...library,
    'amb.roof': { kind: 'recorded', licence: by('city night hum 04', 'https://f/1'), use: 'bed' },
    'amb.hall': { kind: 'recorded', licence: by('M Murmer', 'https://f/2'), use: 'bed' },
    'amb.yard': { kind: 'recorded', licence: by('city night hum 04', 'https://f/1'), use: 'bed' },
    'steps.stone': {
      kind: 'recorded',
      licence: { id: 'CC0-1.0', author: 'LordFluffeh', source: 'https://f/3' },
      use: 'one-shot',
    },
  });
  const cue = { scene: 'cold', at: 'start' } as const;
  const bed = (sound: string) => ({ sound, from: cue, to: cue });
  const effect = (sound: string) => ({ sound, at: [cue] });

  test('owes one line per CC BY recording the film places, each recording once', () => {
    const credits = soundCredits(credited, {
      beds: [bed('amb.roof'), bed('amb.court'), bed('amb.yard'), bed('amb.roof')],
      effects: { steps: effect('steps.stone'), slide: effect('paper.slide') },
    });
    expect(credits.map(creditLine)).toEqual([
      '"city night hum 04" by klankbeeld, CC BY 4.0, changed',
    ]);
    expect(credits.map(creditLink)).toEqual([
      '"city night hum 04" (https://f/1) by klankbeeld (https://freesound.org/people/klankbeeld), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), changed',
    ]);
  });

  test('a CC BY 3.0 recording names its own deed, and an unchanged one says nothing of change', () => {
    const kept = { title: 'rain', author: 'a', authorUrl: 'https://a', source: 'https://f/4' };
    expect(creditLine({ ...kept, licence: 'CC-BY-3.0', changed: false })).toBe(
      '"rain" by a, CC BY 3.0',
    );
    expect(creditLink({ ...kept, licence: 'CC-BY-3.0', changed: false })).toBe(
      '"rain" (https://f/4) by a (https://a), CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/)',
    );
    expect(creditLine({ ...kept, licence: 'CC-BY-3.0', changed: true })).toBe(
      '"rain" by a, CC BY 3.0, changed',
    );
  });

  test('a CC0 recording, and a CC BY one the film does not place, owe none', () => {
    expect(soundCredits(credited, { effects: { steps: effect('steps.stone') } })).toEqual([]);
    expect(soundCredits(credited, { beds: [bed('amb.court')], effects: {} })).toEqual([]);
  });

  test('code kept from a CC BY recording’s fit owes the line the recording did; code from none owes none', () => {
    const fitted = defineLibrary({
      ...credited,
      'amb.hall': {
        kind: 'code',
        sound: { play: room({ secs: 8 }) },
        variants: 3,
        licence: by('M Murmer', 'https://f/2'),
        use: 'bed',
      },
      'room.paper': { kind: 'code', sound: { play: room({ secs: 8 }) }, variants: 1, use: 'bed' },
    });
    const placed = { beds: [bed('amb.hall'), bed('room.paper')], effects: {} };
    expect(soundCredits(fitted, placed)).toEqual(
      soundCredits(credited, { beds: [bed('amb.hall')], effects: {} }),
    );
    expect(soundCredits(fitted, placed).map(creditLine)).toEqual([
      '"M Murmer" by klankbeeld, CC BY 4.0, changed',
    ]);
  });
});

describe('code kept from a recording', () => {
  test('says a CC BY recording was changed: a fit is a change of it', () => {
    const entry = (changed: boolean) => ({
      kind: 'code',
      sound: { play: room({ secs: 8 }) },
      variants: 3,
      licence: {
        id: 'CC-BY-4.0',
        title: 'M Murmer',
        author: 'Processaurus',
        authorUrl: 'https://freesound.org/people/Processaurus',
        source: 'https://f/2',
        changed,
      },
      use: 'bed',
    });
    const decoded = (changed: boolean) => Schema.decodeUnknownResult(LibraryEntry)(entry(changed));
    expect(Result.isSuccess(decoded(true))).toBe(true);
    expect(Result.isFailure(decoded(false))).toBe(true);
  });
});

describe('a kept fit', () => {
  const fit = {
    sound: { play: room({ secs: 8 }) },
    variants: 3,
    from: { file: 'public/amb.hall.flac', sha256: 'ab' },
    earshot: 'c0ffee',
    size: 'small',
    left: [],
  };

  test('is its fit file’s sound and seeds, which a code entry plays with the recording’s licence', () => {
    const kept = keptFit(fit);
    expect(kept).toEqual({ sound: fit.sound, variants: 3 });
    expect(() => keptFit({ sound: fit.sound })).toThrow();
  });
});
