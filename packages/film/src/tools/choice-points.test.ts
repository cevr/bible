// A film's choice points as its sources declare them, one adapter per kind,
// on a small film laid out in memory: the score's options with `play` picked
// (and no pick offered on what plays); each look's levels with `play` picked
// (FL8: `now` is the level drawn today); a beat's attempts newest first, the
// one its timings name picked, one for an earlier line stale and offered no
// pick; each sound layer's level a knob (its own number, the constant several
// layers share as one knob, a computed level fixed); a sound made from data,
// its seeds picked and fixed, with a code trial's seeds beside what plays; and
// the owner's approvals and comments read onto the variant they were given on.

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result } from 'effect';
import { type Catalogue, approve, comment, emptyCatalogue } from '../core/catalogue.ts';
import { type ChoicePoint, type VariantDraft, subjectAt } from '../core/choice.ts';
import { layout } from '../core/layout.ts';
import { pointIdOf } from '../core/point.ts';
import type { Sound } from '../core/schema.ts';
import { type Variant, defineLibrary, requestKey } from '../core/sfx.ts';
import { measuredSounds } from '../core/testing.ts';
import {
  type BeatAttempts,
  filmPoints,
  levelPoints,
  lookPoints,
  scorePoint,
  takePoints,
  voicePoints,
} from './choice-points.ts';
import type { MeasuredFilm } from './film-repo.ts';
import { holdScenes, holdTimings, spokenTake, testFilm } from './testing.ts';

const music = (style: string) => ({
  model: 'music_v2_5' as const,
  styles: ['instrumental', style],
  avoid: ['vocals'],
  movements: [{ from: 'held', name: 'The page', styles: ['quiet'] }],
});

const SOUND: Sound = {
  score: {
    play: 'piano',
    under: -18,
    alone: -6,
    options: { piano: music('felt piano'), strings: music('strings') },
  },
  beds: [
    {
      sound: 'room.paper',
      level: -24,
      from: { scene: 'held', at: 'start' },
      to: { scene: 'brief', at: 'start' },
    },
  ],
  effects: { page: { sound: 'tone.chime', level: -26, at: [{ scene: 'brief', at: 'start' }] } },
};

/** `sound.ts` as the level adapter reads it: an own level, a shared constant, a computed one. */
const SOUND_TS = `const PAPER = -24;

export const sound = {
  score: { play: 'piano', under: -18, alone: PAPER, options: {} },
  beds: [{ sound: 'room.paper', level: PAPER, from: { scene: 'held' } }],
  effects: {
    page: { sound: 'tone.chime', level: PAPER - 2, at: [{ scene: 'brief' }] },
  },
};
`;

const film = (over: Partial<MeasuredFilm> = {}): MeasuredFilm => ({
  ...testFilm(holdScenes, {
    ...holdTimings,
    scenes: { ...holdTimings.scenes, held: { ...spokenTake('x'), file: 'held-2.flac' } },
  }),
  sound: Option.some(SOUND),
  looks: { ground: { options: { now: 0, light: 0.5, lighter: 0.75 }, play: 'now' } },
  ...over,
});

const placed = Result.getOrThrow(layout(holdScenes, holdTimings));

const attempt = (file: string, at: number, hash: string) => ({
  beat: 'held',
  file,
  take: { ...spokenTake('x'), file, hash },
  heard: 'x',
  wer: 0,
  at,
});

const NOW = spokenTake('x').hash;

const BEATS: ReadonlyArray<BeatAttempts> = [
  {
    beat: 'held',
    hash: NOW,
    attempts: [
      attempt('held-1.flac', 1, 'an earlier line'),
      attempt('held-2.flac', 2, NOW),
      attempt('held-3.flac', 3, NOW),
    ],
  },
  { beat: 'brief', hash: NOW, attempts: [] },
];

const points = (catalogue: Option.Option<Catalogue>): ReadonlyArray<ChoicePoint> =>
  filmPoints({
    loaded: film(),
    placed,
    soundSource: Option.some({ file: 'sound.ts', text: SOUND_TS }),
    beats: BEATS,
    catalogue,
  });

const named = (all: ReadonlyArray<ChoicePoint>, id: string) =>
  Option.fromUndefinedOr(all.find((p) => p.id === id));

describe('the adapters', () => {
  test("the score's options, `play` picked, the others offered a pick", () => {
    const score = Option.getOrThrow(scorePoint(film(), placed));
    expect(score.ref).toEqual({ _tag: 'Score' });
    expect(score.address).toEqual(Option.some({ _tag: 'Film' }));
    expect(score.variants.map((v) => [v.id, v.state, v.picked, v.verbs])).toEqual([
      ['piano', 'missing', true, []],
      ['strings', 'missing', false, ['pick']],
    ]);
    // Never composed: nothing to hear in place.
    expect(score.variants.map((v) => v.media)).toEqual([
      { _tag: 'Heard', alone: false, inPlace: false },
      { _tag: 'Heard', alone: false, inPlace: false },
    ]);
    expect(Option.isNone(scorePoint(film({ sound: Option.none() }), placed))).toBe(true);
  });

  test("each look's levels, `play` (today's `now`) picked", () => {
    const [ground] = lookPoints(film());
    expect(ground?.ref).toEqual({ _tag: 'Look', name: 'ground' });
    expect(ground?.variants.map((v) => [v.id, v.picked, v.verbs, v.key])).toEqual([
      ['now', true, [], 'now=0'],
      ['light', false, ['pick'], 'light=0.5'],
      ['lighter', false, ['pick'], 'lighter=0.75'],
    ]);
    expect(lookPoints(film({ looks: {} }))).toEqual([]);
  });

  test("a beat's attempts newest first, the timings' take picked, an earlier line's stale", () => {
    const [held, ...rest] = voicePoints(film(), BEATS);
    // A beat with no attempts has no point.
    expect(rest).toEqual([]);
    expect(held?.ref).toEqual({ _tag: 'Voice', beat: 'held' });
    expect(held?.address).toEqual(Option.some({ _tag: 'Scenes', ids: ['held'] }));
    expect(held?.variants.map((v) => [v.id, v.state, v.picked, v.verbs])).toEqual([
      ['held-3.flac', 'current', false, ['pick']],
      ['held-2.flac', 'current', true, []],
      ['held-1.flac', 'stale', false, []],
    ]);
  });

  test("each layer's level a knob: its own number, a shared constant as one, a computed one fixed", () => {
    const all = points(Option.none());
    const knob = (id: string) =>
      Option.map(
        Option.flatMap(named(all, id), (p) => p.knob),
        (k) => [k.value, Option.isSome(k.fixed)],
      );
    expect(knob('level:score:under')).toEqual(Option.some([-18, false]));
    // `PAPER` is named by the score's `alone` and the bed: one knob for both.
    expect(knob('level:const:PAPER')).toEqual(Option.some([-24, false]));
    expect(Option.map(named(all, 'level:const:PAPER'), (p) => p.lines)).toEqual(
      Option.some(['score alone', 'bed room.paper']),
    );
    expect(Option.isNone(named(all, 'level:score:alone'))).toBe(true);
    const computed = Option.flatMap(
      Option.flatMap(named(all, 'level:effect:page'), (p) => p.knob),
      (k) => k.fixed,
    );
    expect(Option.getOrThrow(computed)).toContain('PAPER - 2');
    expect(all.map((p) => p.kind)).toEqual(['score', 'look', 'voice', 'level', 'level', 'level']);
  });
});

describe("the owner's say", () => {
  test('an approval and a comment read onto the variant they were given on, and no other', () => {
    const [ground] = lookPoints(film());
    const light = Option.getOrThrow(Option.fromUndefinedOr(ground?.variants[1]));
    const subject = subjectAt({ _tag: 'Look', name: 'ground' }, { _tag: 'Film' }, light);
    const said = comment(approve(emptyCatalogue('test'), subject, 1), subject, 'warmer', 2);
    const look = named(points(Option.some(said)), 'look:ground');
    expect(
      Option.map(look, (p) => p.variants.map((v) => [v.id, v.approval, v.comments.length])),
    ).toEqual(
      Option.some([
        ['now', 'none', 0],
        ['light', 'approved', 1],
        ['lighter', 'none', 0],
      ]),
    );
    // The score shares the address, not the point: nothing said of it.
    expect(
      Option.map(named(points(Option.some(said)), 'score'), (p) =>
        p.variants.map((v) => v.approval),
      ),
    ).toEqual(Option.some(['none', 'none']));
  });
});

describe('a take point when the mix plan does not build', () => {
  const chime = defineLibrary({
    'tone.chime': {
      kind: 'generated',
      prompt: 'a chime',
      why: 'a test sound',
      secs: 1,
      use: 'one-shot',
    },
  });
  const kept: Variant = {
    request: requestKey(chime['tone.chime']),
    file: 'files/chime.flac',
    sha256: 'chime',
    made: '2026-09-30T00:00:00Z',
    model: 'eleven_text_to_sound_v2',
    format: 'pcm_44100',
    secs: 1,
    loudness: { integrated: -24, momentaryMax: -20, peak: -3 },
    licence: 'elevenlabs-paid-sfx',
    credits: 40,
  };
  const withEffect = (at: Sound['effects'][string]['at']) =>
    film({
      sound: Option.some({ ...SOUND, beds: [], effects: { page: { sound: 'tone.chime', at } } }),
      sounds: measuredSounds(
        chime,
        { 'tone.chime': { variants: [kept], candidates: [], rejected: [] } },
        '',
      ),
    });

  test('shows why its placements are missing, not an empty take list', () => {
    const [placedTake] = takePoints(withEffect([{ scene: 'brief', at: 'start' }]), placed);
    expect(placedTake?.marks).toHaveLength(1);
    const [lost] = takePoints(withEffect([{ scene: 'brief', cue: 'nosuch' }]), placed);
    expect(lost?.marks).toEqual([]);
    expect(lost?.lines.some((line) => line.includes('nosuch'))).toBe(true);
    const effect = levelPoints(
      withEffect([{ scene: 'brief', cue: 'nosuch' }]),
      placed,
      'sound.ts',
      SOUND_TS,
    ).find((p) => pointIdOf(p.ref) === 'level:effect:page');
    expect(effect?.lines.some((line) => line.includes('nosuch'))).toBe(true);
  });
});

describe('a take point of a sound made from data', () => {
  const TICK = { play: { _tag: 'Partials', pitch: 'E5', set: 'glass', secs: 0.1 } } as const;
  const library = defineLibrary({
    'tone.tick': { kind: 'code', sound: TICK, variants: 2, use: 'one-shot' },
    'tone.chime': {
      kind: 'generated',
      prompt: 'a chime',
      why: 'a test sound',
      secs: 1,
      use: 'one-shot',
      code: { sound: TICK, variants: 2 },
    },
    'tone.bell': {
      kind: 'procedural',
      recipe: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 0.3 },
      variants: 2,
      use: 'one-shot',
    },
  });
  const take = (request: string, sha256: string): Variant => ({
    request,
    file: `files/${sha256}.flac`,
    sha256,
    made: '2026-09-30T00:00:00Z',
    model: 'eleven_text_to_sound_v2',
    format: 'pcm_44100',
    secs: 1,
    loudness: { integrated: -24, momentaryMax: -20, peak: -3 },
    licence: 'elevenlabs-paid-sfx',
    credits: 40,
  });
  const at = [{ scene: 'brief', at: 'start' }] as const;
  const loaded = film({
    sound: Option.some({
      ...SOUND,
      beds: [],
      effects: {
        tick: { sound: 'tone.tick', at },
        chime: { sound: 'tone.chime', at },
        bell: { sound: 'tone.bell', at },
      },
    }),
    sounds: measuredSounds(
      library,
      {
        // A take of tick from when it was generated, for a request it no longer makes.
        'tone.tick': { variants: [take('generated', 'before')], candidates: [], rejected: [] },
        'tone.chime': {
          variants: [take(requestKey(library['tone.chime']), 'kept')],
          candidates: [],
          rejected: [],
        },
      },
      '',
    ),
  });
  const pointOf = (name: string) =>
    Option.getOrThrow(
      Option.fromUndefinedOr(takePoints(loaded, placed).find((p) => p.title === name)),
    );
  const heard = { _tag: 'Heard', alone: true, inPlace: true } as const;
  /** Why no verb reaches a variant, or `-` when one can. */
  const fixedOf = (v: VariantDraft) => Option.getOrElse(v.fixed ?? Option.none(), () => '-');

  test("a code sound's seeds, all picked and fixed, and the take its lock holds from before", () => {
    const tick = pointOf('tone.tick');
    expect(tick.lines).toEqual(['2 seeds · code']);
    expect(tick.marks).toHaveLength(1);
    expect(tick.variants.map((v) => [v.label, v.picked, v.verbs, v.state])).toEqual([
      ['seed 1', true, [], 'current'],
      ['seed 2', true, [], 'current'],
      ['was 1', false, [], 'stale'],
    ]);
    // A seed is named by its source's label, which names its data and the renderer.
    const [one, two, before] = tick.variants;
    expect(one?.id).toMatch(/^code:[0-9a-f]+:[0-9a-f]+\/1$/);
    expect(two?.id).toMatch(/\/2$/);
    expect(tick.variants.map((v) => v.key)).toEqual(tick.variants.map((v) => v.id));
    expect(before?.id).toBe('before');
    // Measured as the mix plays it.
    expect(one?.lines).toEqual([expect.stringMatching(/^-?\d+\.\d LUFS · hit \d\.\d\d s$/)]);
    expect(tick.variants.map(fixedOf)).toEqual([
      'a code sound is tuned by editing its data',
      'a code sound is tuned by editing its data',
      'a code sound is tuned by editing its data: its seeds play, not its takes',
    ]);
    expect(tick.variants.map((v) => v.media)).toEqual([heard, heard, heard]);
  });

  test("a generated sound's code trial beside its takes, never picked", () => {
    const chime = pointOf('tone.chime');
    expect(chime.lines).toEqual(['1 kept · 0 waiting', 'code trial: 2 seeds']);
    expect(chime.variants.map((v) => [v.label, v.picked, v.verbs])).toEqual([
      ['kept 1', true, ['unpick']],
      ['code trial 1', false, []],
      ['code trial 2', false, []],
    ]);
    expect(chime.variants.map(fixedOf)).toEqual([
      '-',
      'a code trial is tuned by editing its data, and chosen in an ask',
      'a code trial is tuned by editing its data, and chosen in an ask',
    ]);
    // The trial plays the graph its entry declares, as the code sound does.
    const tick = pointOf('tone.tick');
    expect(chime.variants[1]?.id).toBe(tick.variants[0]?.id);
  });

  test("a recipe's seeds, and its port as its code trial", () => {
    const bell = pointOf('tone.bell');
    expect(bell.lines).toEqual(['2 seeds · recipe', 'code trial: 2 seeds']);
    expect(bell.variants.map((v) => [v.label, v.picked, v.id.split(':')[0]])).toEqual([
      ['seed 1', true, 'synth'],
      ['seed 2', true, 'synth'],
      ['code trial 1', false, 'code'],
      ['code trial 2', false, 'code'],
    ]);
    expect(fixedOf(Option.getOrThrow(Arr.head(bell.variants)))).toBe(
      'a recipe is tuned by editing its data',
    );
  });
});
