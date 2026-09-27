import { describe, expect, test } from 'bun:test';
import { Option, Predicate, Result } from 'effect';
import { layout } from '../core/layout.ts';
import { hashText, parse, takeScript, voiceKey } from '../core/narration.ts';
import type { RiveDocument, RiveProblem, SceneBoard } from '../core/rive.ts';
import type { Cast, Music, Sound, Timed, Timings } from '../core/schema.ts';
import { type EventTimes, effectKey, filmEnd, musicKey, musicPlan } from '../core/sound.ts';
import {
  type CheckOptions,
  type Finding,
  effectFindings,
  musicFindings,
  projectFindings,
  staleTakes,
  staticFindings,
  unknownVoices,
} from './check.ts';
import type { ProjectState } from './project.ts';
import { testFilm, testVoice } from './testing.ts';

const noTakes: Timings = { voice: '', scenes: {} };
const tags = (fs: ReadonlyArray<{ readonly _tag: string }>) => fs.map((f) => f._tag);

// ---------------------------------------------------------------------------
// Static

const take = (text: string) => ({ hash: hashText(text), file: 'x.mp3', duration: 2, words: [] });
const cast: Cast = {
  model: 'eleven_v3',
  settings: { stability: 0.5 },
  voices: [
    { name: 'lead', voiceId: 'L' },
    { name: 'ask', voiceId: 'A' },
  ],
};

describe('staleTakes', () => {
  const scenes: ReadonlyArray<Timed> = [
    { id: 'kept', say: 'Still {m}the same' },
    { id: 'edited', say: 'Now it says more' },
    { id: 'new', say: 'Never read' },
    { id: 'quiet' },
  ];
  const timings: Timings = {
    voice: voiceKey(testVoice),
    scenes: { kept: take('Still the same'), edited: take('Now it says') },
  };

  test('a missing take, and a take of other text, are stale; marks never are', () => {
    expect(staleTakes(testFilm(scenes, timings)).map((s) => [s.scene, s.reason])).toEqual([
      ['edited', 'text changed'],
      ['new', 'missing'],
    ]);
  });

  test('another voice makes every take stale', () => {
    const film = testFilm(scenes, { ...timings, voice: 'someone-else' });
    expect(staleTakes(film).map((s) => s.reason)).toEqual([
      'voice changed',
      'voice changed',
      'missing',
    ]);
  });

  test('a take read by a cast goes stale when a turn moves', () => {
    const said = 'Declared? {@ask}But he is guilty.';
    const recorded: Timings = {
      voice: voiceKey(cast),
      scenes: { d: take(takeScript(parse(said))) },
    };
    const film = (say: string) => testFilm([{ id: 'd', say }], recorded, cast);
    expect(staleTakes(film(said))).toEqual([]);
    expect(staleTakes(film('Declared? But {@ask}he is guilty.')).map((s) => s.reason)).toEqual([
      'text changed',
    ]);
  });
});

describe('unknownVoices', () => {
  test('a line handed to a voice the film does not have', () => {
    const scenes: ReadonlyArray<Timed> = [
      { id: 'ok', say: 'One. {@ask}Two.' },
      { id: 'lost', say: 'One. {@narrator}Two.' },
      { id: 'quiet' },
    ];
    const found = unknownVoices(testFilm(scenes, noTakes, cast));
    expect(found.map((f) => [f.scene, f.voice, f.known])).toEqual([
      ['lost', 'narrator', ['lead', 'ask']],
    ]);
    expect(unknownVoices(testFilm(scenes, noTakes)).map((f) => f.scene)).toEqual(['ok', 'lost']);
  });

  test('is an error in the static check, beside the take it cannot record', () => {
    const scenes: ReadonlyArray<Timed> = [{ id: 'lost', say: 'One. {@narrator}Two.' }];
    const film = testFilm(scenes, noTakes, cast);
    const found = staticFindings(
      film,
      layout(scenes, noTakes),
      { allowStale: true },
      Option.none(),
      events,
    );
    expect(found.map((r) => [r.level, r.finding._tag])).toEqual([
      ['error', 'UnknownVoice'],
      ['warning', 'TakeStale'],
    ]);
  });
});

const soundScenes: ReadonlyArray<Timed> = [
  { id: 'open', min: 8 },
  { id: 'middle', min: 2 },
  { id: 'close', min: 8 },
];
const placedSound = layout(soundScenes, noTakes);
const music = (acts: Music['acts']): Music => ({
  model: 'music_v2',
  styles: [],
  avoid: [],
  acts,
  gain: 0.5,
});

describe('musicFindings', () => {
  const inOrder = music([
    { from: 'open', name: 'Opening', styles: [] },
    { from: 'close', name: 'Closing', styles: [] },
  ]);
  const hash = musicKey(inOrder, Result.getOrThrow(musicPlan(inOrder, placedSound)));

  test('a current score is fine; a re-timed one is stale; an unmade one is missing', () => {
    expect(
      musicFindings(inOrder, placedSound, { music: { hash, file: 'm.mp3' }, effects: {} }),
    ).toEqual([]);
    const stale = musicFindings(inOrder, placedSound, {
      music: { hash: 'old', file: 'm.mp3' },
      effects: {},
    });
    expect(stale).toMatchObject([
      { _tag: 'AssetStale', asset: 'music', stored: 'old', wanted: hash },
    ]);
    expect(tags(musicFindings(inOrder, placedSound, { effects: {} }))).toEqual(['AssetMissing']);
  });

  test('every act out of order or under 3 s is reported, not just the first', () => {
    const found = musicFindings(
      music([
        { from: 'open', name: 'Opening', styles: [] },
        { from: 'close', name: 'Closing', styles: [] },
        { from: 'middle', name: 'Middle', styles: [] },
        { from: 'middle', name: 'Coda', styles: [] },
      ]),
      placedSound,
      { effects: {} },
    );
    const acts = found.map((f) => {
      if (f._tag === 'ActTooShort') return [f._tag, f.act];
      return [f._tag];
    });
    expect(acts).toEqual([
      ['ActTooShort', 'Closing'],
      ['ActTooShort', 'Middle'],
    ]);
  });

  test('an act naming no scene', () => {
    const found = musicFindings(
      music([{ from: 'nowhere', name: 'Lost', styles: [] }]),
      placedSound,
      { effects: {} },
    );
    expect(found).toMatchObject([{ _tag: 'UnknownScene', scene: 'nowhere' }]);
  });
});

/** `open` fires its Event `hit` a second in. */
const events: EventTimes = new Map([['open', new Map([['hit', 1]])]]);

describe('effectFindings', () => {
  test('every placement naming an unknown scene, Event or mark, and every stale effect', () => {
    const hit = { prompt: 'a hit', secs: 1, at: [{ scene: 'open', event: 'hit' }] };
    const sound: Sound = {
      effects: {
        hit,
        lost: {
          prompt: 'lost',
          secs: 1,
          at: [
            { scene: 'nowhere' },
            { scene: 'open', event: 'nope' },
            { scene: 'open', mark: 'nope' },
          ],
        },
      },
    };
    const found = effectFindings(
      sound,
      placedSound,
      {
        effects: {
          hit: { hash: effectKey(hit), file: 'h.mp3' },
          lost: { hash: 'x', file: 'l.mp3' },
        },
      },
      events,
    );
    expect(tags(found)).toEqual(['UnknownScene', 'UnknownEvent', 'UnknownMark', 'AssetStale']);
  });
});

describe('staticFindings', () => {
  const film = {
    ...testFilm(soundScenes, { voice: '', scenes: {} }),
    scenes: [...soundScenes, { id: 'said', say: 'Words' }].map((b) => ({ picture: '', ...b })),
    sound: Option.some<Sound>({
      effects: { hit: { prompt: 'a hit', secs: 1, at: [{ scene: 'open', event: 'hit' }] } },
    }),
  };
  const placed = layout(film.scenes, film.timings);

  test('stale work is an error, an unmade sound a warning', () => {
    expect(
      staticFindings(film, placed, { allowStale: false }, Option.none(), events).map((r) => [
        r.level,
        r.finding._tag,
      ]),
    ).toEqual([
      ['error', 'TakeStale'],
      ['warning', 'AssetMissing'],
    ]);
  });

  test('--allow-stale turns stale work into warnings', () => {
    expect(
      staticFindings(film, placed, { allowStale: true }, Option.none(), events).map((r) => r.level),
    ).toEqual(['warning', 'warning']);
  });
});

describe('the audio master', () => {
  const scenes: ReadonlyArray<Timed> = [
    { id: 'said', say: 'Hi there.' },
    { id: 'quiet', min: 3 },
  ];
  const recorded: Timings = { voice: voiceKey(testVoice), scenes: { said: take('Hi there.') } };
  const film = testFilm(scenes, recorded);
  const placed = layout(scenes, recorded);
  const end = filmEnd(placed);
  const found = (master: Option.Option<number>, allowStale = false) =>
    staticFindings(film, placed, { allowStale }, master, events).map((r) => [
      r.level,
      r.finding._tag,
    ]);

  test('a master as long as the film, within a frame, passes', () => {
    expect(found(Option.some(end))).toEqual([]);
    expect(found(Option.some(end + 0.01))).toEqual([]);
  });

  test('no master, once every take is recorded, is AudioMissing', () => {
    expect(found(Option.none())).toEqual([['error', 'AudioMissing']]);
  });

  test('a master cut short by an interrupted mix, or mixed for another cut, is AudioStale', () => {
    expect(found(Option.some(end - 1))).toEqual([['error', 'AudioStale']]);
    expect(found(Option.some(end + 1))).toEqual([['error', 'AudioStale']]);
  });

  test('--allow-stale reports them as warnings', () => {
    expect(found(Option.none(), true)).toEqual([['warning', 'AudioMissing']]);
    expect(found(Option.some(end - 1), true)).toEqual([['warning', 'AudioStale']]);
  });

  test('a film with a take still to record has no master to check', () => {
    const unrecorded = testFilm(scenes, noTakes);
    const laid = layout(scenes, noTakes);
    const tagsOf = staticFindings(
      unrecorded,
      laid,
      { allowStale: true },
      Option.none(),
      events,
    ).map((r) => r.finding._tag);
    expect(tagsOf).toEqual(['TakeStale']);
  });
});

// ---------------------------------------------------------------------------
// Project

/** The scene a finding names, if it names one. */
const sceneOf = (finding: Finding): string => {
  if (Predicate.hasProperty(finding, 'scene') && Predicate.isString(finding.scene))
    return finding.scene;
  return '';
};

describe('projectFindings', () => {
  const scenes: ReadonlyArray<Timed> = [
    { id: 'drawn', say: 'One {x}two {y}three.' },
    { id: 'seeded', say: 'Four {z}five.' },
    { id: 'loose' },
    { id: 'still', say: 'Six {w}seven.' },
    { id: 'gone' },
  ];
  const film = testFilm(scenes, noTakes);
  const placed = layout(scenes, noTakes);
  const strict: CheckOptions = { allowStale: false };

  /** A 4 s board firing `events` on its main timeline, or holding one frame with no timeline. */
  const board = (
    name: string,
    events: ReadonlyArray<readonly [string, number]>,
    over: Partial<SceneBoard> = {},
  ): SceneBoard => ({
    name,
    id: `${name}:1`,
    width: 1920,
    height: 1080,
    x: 0,
    y: 0,
    main: Option.some({ id: `${name}:2`, fps: 60, frames: 240, seconds: 4 }),
    events: events.map(([event, at]) => ({ name: event, id: `${name}:${event}`, at })),
    unkeyed: [],
    runs: [],
    storyboard: false,
    component: true,
    ...over,
  });

  const doc = (problems: ReadonlyArray<RiveProblem> = []): RiveDocument => ({
    boards: new Map(
      [
        // `y` is keyed before `x`: the warp cannot pass back through it.
        board('drawn', [
          ['x', 2],
          ['y', 1],
        ]),
        board('seeded', [['z', 1]], { storyboard: true }),
        board('loose', [], { component: false }),
        board('still', [], { main: Option.none() }),
      ].map((b): readonly [string, SceneBoard] => [b.name, b]),
    ),
    fonts: [],
    problems,
  });

  const state = (current = true, problems: ReadonlyArray<RiveProblem> = []) =>
    Option.some<ProjectState>({ doc: doc(problems), current });

  const found = (
    project: Option.Option<ProjectState>,
    only: Option.Option<ReadonlySet<string>> = Option.none(),
    options: CheckOptions = strict,
  ) =>
    projectFindings(film, placed, project, only, options).map((r) => [
      r.level,
      r.finding._tag,
      sceneOf(r.finding),
    ]);

  test('a film never synced has no project', () => {
    expect(found(Option.none())).toEqual([['error', 'ProjectMissing', '']]);
  });

  test("each beat's scene: there, nestable, drawn, and every mark on an Event it can land on", () => {
    expect(found(state())).toEqual([
      ['error', 'MarkOrder', 'drawn'],
      ['warning', 'SceneUndrawn', 'seeded'],
      ['error', 'SceneNotComponent', 'loose'],
      ['error', 'TimelineMissing', 'still'],
      ['error', 'SceneMissing', 'gone'],
    ]);
  });

  test('--scene checks just those beats; the project as a whole is still checked', () => {
    const problem: RiveProblem = {
      severity: 'warning',
      kind: 'unused',
      file: 'scenes/drawn.rml',
      line: 4,
      message: 'never drawn',
    };
    const picked = projectFindings(
      film,
      placed,
      state(false, [problem]),
      Option.some(new Set(['gone'])),
      strict,
    );
    expect(picked.map((r) => [r.level, r.finding._tag])).toEqual([
      ['warning', 'ProjectProblem'],
      ['error', 'SceneMissing'],
      ['error', 'FilmStale'],
    ]);
    expect(picked[0]?.finding.message).toBe('scenes/drawn.rml:4: never drawn (unused)');
  });

  test('a Film out of date is an error, or with --allow-stale a warning', () => {
    const stale = (options: CheckOptions) =>
      found(state(false), Option.some(new Set<string>()), options);
    expect(stale(strict)).toEqual([['error', 'FilmStale', '']]);
    expect(stale({ allowStale: true })).toEqual([['warning', 'FilmStale', '']]);
  });

  test('a mark with no Event of its name is unpinned', () => {
    const unpinned = testFilm([{ id: 'drawn', say: 'One {x}two {q}three.' }], noTakes);
    const laid = layout(unpinned.scenes, noTakes);
    const reported = projectFindings(unpinned, laid, state(), Option.none(), strict);
    expect(reported.map((r) => r.finding.message)).toEqual([
      'scene "drawn": no Event "q" on the main timeline for the mark {q}; key one where the picture hits the word',
    ]);
  });
});
