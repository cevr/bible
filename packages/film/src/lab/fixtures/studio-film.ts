// A synthetic film over every review page of the studio, for the tests that
// walk them all (the touch-target guard): one film, `toy`, of an act (open,
// close) and two loose scenes (coda, end), open rendered so its row links
// its Stack; its choices are a score of three options, a look of two, a
// sound's kept take and two candidates in open, a layer across the act and a
// level's knob; and the review's index holds the film's project folder with
// open's render set and two loose videos (one with its phone proxy ready). What the disclosed states need is there too: two
// pictures under the Choices transport, a comment on the film, the act, scene open and
// the score's strings and the set's main version (their counts), and the check's two findings, one at a
// time. The app's series hold one draft of three beats, its first take
// ready and its second voicing. Each route answers as the lab's server
// encodes it.

import { Option, Schema } from 'effect';
import { sceneAddress } from '../../core/address.ts';
import { Render, RenderVariantName } from '../../core/catalogue.ts';
import { type FakeRoute, type Json, file, json, route, text as textAnswer } from './harness.ts';

/** The film's name. */
export const STUDIO_FILM = 'toy';

/** The film's project folder, as the review's roots hold it. */
export const STUDIO_FOLDER = 'out/toy';

/** The render set of scene open, in the folder: the Set page's point. */
export const STUDIO_SET = 'render:scenes:open';

const FILM_AT: Json = { _tag: 'Film' };
const scenesAt = (...ids: ReadonlyArray<string>): Json => ({ _tag: 'Scenes', ids });

/** What was said of a part (a variant of `point` when given), as the server lists it. */
const said = (address: Json, text: string, point: Option.Option<string> = Option.none()): Json => ({
  id: `c-${text.length}`,
  address,
  ...Option.match(point, { onNone: () => ({}), onSome: (p) => ({ point: p }) }),
  variant: 'main',
  key: 'k',
  text,
  at: 0,
  onThis: true,
});

/** A variant heard over the picture, as the server encodes it. */
const heard = (
  id: string,
  fields: {
    readonly picked?: boolean;
    readonly verbs?: ReadonlyArray<string>;
    /** How it is shown; heard alone and in place when none. */
    readonly media?: Json;
    readonly comments?: ReadonlyArray<Json>;
  } = {},
): Json => ({
  id,
  label: id.slice(0, 12),
  lines: [`${id.slice(0, 12)} · 1.5 s · -14.3 LUFS`],
  state: 'current',
  picked: fields.picked ?? false,
  verbs: fields.verbs ?? [],
  media: fields.media ?? { _tag: 'Heard', alone: true, inPlace: true },
  key: id,
  approval: 'none',
  comments: fields.comments ?? [],
});

/** A point as the server encodes it. */
const point = (
  id: string,
  kind: string,
  address: Json,
  variants: ReadonlyArray<Json>,
  knob: Option.Option<Json> = Option.none(),
): Json => ({
  id,
  kind,
  address,
  title: id,
  lines: [],
  start: 0,
  marks: [],
  ...Option.match(knob, { onNone: () => ({}), onSome: (k) => ({ knob: k }) }),
  variants,
});

/** A sound's takes in a scene: the kept one and two candidates. */
const takes = (sound: string, scene: string, seed: string): Json =>
  point(`take:${sound}`, 'take', scenesAt(scene), [
    heard(seed.repeat(64), { picked: true, verbs: ['unpick'] }),
    heard(`${seed}1`.repeat(32), { verbs: ['pick', 'reject'] }),
    heard(`${seed}2`.repeat(32), { verbs: ['pick', 'reject'] }),
  ]);

/** The film's choices. */
const choices: Json = {
  film: STUDIO_FILM,
  pictures: ['toy', 'toy.warm'].map((name) => ({
    ref: `${STUDIO_FOLDER}/${name}.mp4`,
    name: `${name}.mp4`,
    size: 2048,
    mtime: 0,
    phone: 'none',
  })),
  points: [
    point('score', 'score', FILM_AT, [
      heard('strings', {
        picked: true,
        comments: [said(FILM_AT, 'warmer in the close', Option.some('score'))],
      }),
      heard('piano', { verbs: ['pick'] }),
      heard('choir', { verbs: ['pick'] }),
    ]),
    point('look:ground', 'look', FILM_AT, [
      heard('now', { picked: true, media: { _tag: 'Unseen' } }),
      heard('light', { verbs: ['pick'], media: { _tag: 'Unseen' } }),
    ]),
    takes('paper.page', 'open', 'a'),
    takes('paper.hum', 'close', 'b'),
    point('take:room.tone', 'take', scenesAt('open', 'close'), [
      heard('c'.repeat(64), { picked: true, verbs: ['unpick'] }),
    ]),
    point(
      'level:const:PAPER',
      'level',
      scenesAt('open'),
      [],
      Option.some({ value: -24, min: -40, max: 0, step: 0.5, unit: 'dB' }),
    ),
  ],
};

/** Scene `id`'s main render as the catalogue records it, encoded. */
const renderOf = (id: string): Json =>
  Schema.encodeSync(Schema.toCodecJson(Render))({
    address: sceneAddress(id),
    variant: RenderVariantName.make('main'),
    kind: 'video',
    settings: { scale: 1, captions: false },
    stamp: { commit: Option.none(), key: 'k' },
    span: Option.none(),
    files: {
      clip: Option.some(`scenes/${id}/main.mp4`),
      share: Option.none(),
      captions: Option.none(),
      chapters: Option.none(),
      images: [],
    },
    sound: Option.none(),
    at: 0,
  });

/** A scene's video in the folder, as the review serves it. */
const videoOf = (scene: string): Json => ({
  ref: `${STUDIO_FOLDER}/scenes/${scene}/main.share.mp4`,
  name: 'main.share.mp4',
  size: 1024,
  mtime: 0,
  phone: 'none',
});

/** A loose video in the folder (no set holds it), its phone proxy as `phone` says. */
const looseOf = (name: string, phone: string): Json => ({
  ref: `${STUDIO_FOLDER}/${name}`,
  name,
  size: 2048,
  mtime: 0,
  phone,
});

/** A scene as the project encodes it, unrendered; open has a comment. */
const scene = (id: string, state: string) => ({
  scene: id,
  key: 'k',
  state,
  approval: 'none',
  comments: [id].filter((s) => s === 'open').map((s) => said(scenesAt(s), 'hold the page')),
});

const project: Json = {
  project: {
    film: STUDIO_FILM,
    variant: RenderVariantName.make('main'),
    key: 'fk',
    comments: [said(FILM_AT, 'the flow holds')],
    acts: [
      {
        name: 'opening',
        scenes: ['open', 'close'],
        key: 'ak',
        comments: [said({ _tag: 'Act', act: 'opening' }, 'a beat slower')],
      },
    ],
    scenes: [
      { ...scene('open', 'current'), render: renderOf('open') },
      scene('close', 'stale'),
      scene('coda', 'current'),
      scene('end', 'missing'),
    ],
  },
  folder: STUDIO_FOLDER,
  videos: { open: videoOf('open') },
};

/** Open's render set, with `versions` to compare. */
const renderSetOf = (versions: ReadonlyArray<string>): Json => ({
  id: STUDIO_SET,
  kind: 'render',
  address: scenesAt('open'),
  title: 'scene open',
  lines: [],
  start: 0,
  marks: [],
  variants: versions.map((id) => ({
    id,
    label: id,
    lines: [`${id} look`],
    state: 'current',
    picked: false,
    verbs: [],
    media: { _tag: 'Seen', video: videoOf('open') },
    // Each drawn from the sources the project has now (open's `k`), with no mix: current.
    key: 'k',
    approval: 'none',
    comments: [id]
      .filter((v) => v === 'main')
      .map(() => said(scenesAt('open'), 'the page lands', Option.some(STUDIO_SET))),
  })),
});

/** The review's index: the film's folder, open's render set of `versions`, two loose videos, and `docs`. */
const indexOf = (versions: ReadonlyArray<string>, docs: ReadonlyArray<Json> = []): Json => ({
  folders: [
    {
      ref: STUDIO_FOLDER,
      title: STUDIO_FILM,
      mtime: 0,
      sets: [renderSetOf(versions)],
      videos: [looseOf('take-1.mp4', 'ready'), looseOf('take-2.mp4', 'pending')],
      images: [],
      docs: [...docs],
    },
  ],
});

/** The toy's production: two versions, a decision, an open question, and a set filed by hand that no root holds now. */
export const STUDIO_PRODUCTION = 'toy-cut';

/**
 * The toy production's ledger, as `GET /api/productions` sends it, with
 * `later` versions after its two; `film` names the film it makes (none: a
 * track, so the toy keeps its Films card).
 */
export const productionLedgerWith = (
  later: ReadonlyArray<Json>,
  film: ReadonlyArray<string> = [],
): Json => ({
  production: STUDIO_PRODUCTION,
  ...Object.fromEntries(film.map((f) => ['film', f])),
  title: 'The toy, cut by cut',
  blurb: 'A film in two versions.',
  versions: [
    { at: 0, title: 'First cut' },
    { at: 1000, title: 'Second cut', because: 'The first cut holds: open is approved' },
    ...later,
  ],
  said: [
    { _tag: 'Decided', at: 1000, text: 'The first cut holds', quote: 'ship it' },
    { _tag: 'Asked', at: 1500, text: 'Which cut of the open?', set: 'gone-2026-10-01' },
  ],
  filed: [{ set: 'gone-2026-10-01', version: 1 }],
});

/** The toy production's ledger at its second version. */
const productionLedger = productionLedgerWith([]);

/** An agent's ask on the toy: a choice of three takes; the slow one asks why. */
export const STUDIO_ASK = 'a0123456789';

const askMachine: Json = {
  start: 'pick',
  steps: {
    pick: {
      blocks: [
        { kind: 'heading', text: 'The open, its take' },
        {
          kind: 'prose',
          text: 'Three takes of the open line. The slow one changes the cut after it.',
        },
        {
          kind: 'choose',
          id: 'take',
          label: 'Which take?',
          options: [
            { value: 'warm', label: 'Warm' },
            { value: 'bright', label: 'Bright' },
            { value: 'slow', label: 'Slow' },
          ],
        },
      ],
      next: [{ to: 'why', when: { answer: 'take', is: ['slow'] } }, { to: 'done' }],
    },
    why: {
      blocks: [{ kind: 'free_text', id: 'why', label: 'Why the slow one?' }],
      next: [{ to: 'done' }],
    },
    done: { end: true },
  },
};

/** The ask as `GET /api/asks/<id>` sends it, its run at `state` with the steps `answered`. */
export const askRecordWith = (
  state: Json = { _tag: 'Asking', step: 'pick', answers: {} },
  answered: ReadonlyArray<Json> = [],
): Json => ({
  id: STUDIO_ASK,
  title: 'Which take opens the toy?',
  why: 'The open sets the pace of the act.',
  by: 'toy-agent',
  film: STUDIO_FILM,
  created: '2026-10-14T00:00:00.000Z',
  ask: askMachine,
  state,
  answered: [...answered],
});

/** The ask at its first step. */
const askRecord = askRecordWith();

/**
 * A guided review on the toy, one page of sections, each its material in
 * place, then its question: the draft's script (its takes and marks), the
 * Board's panels, the cut, the open's take and the set's notes.
 */
export const STUDIO_GUIDED = 'a0123456780';

/** The set's notes the guided review shows: a Markdown file the review lists. */
const STUDIO_NOTES = `${STUDIO_FOLDER}/notes.md`;

const keepIt = (id: string, label: string): Json => ({
  kind: 'choose',
  id,
  label,
  options: [
    { value: 'redo', label: 'Again' },
    { value: 'keep', label: 'Keep it', recommended: true },
  ],
});

const guidedMachine: Json = {
  start: 'script',
  steps: {
    script: {
      title: 'The script',
      blocks: [
        { kind: 'script', series: 'toy-talks', draft: '01-first-breath' },
        keepIt('script', 'Keep the script?'),
      ],
      next: [{ to: 'board' }],
    },
    board: {
      title: 'The Board',
      blocks: [{ kind: 'board', film: STUDIO_FILM }, keepIt('board', 'Keep the Board?')],
      next: [{ to: 'cut' }],
    },
    cut: {
      title: 'The cut',
      blocks: [
        { kind: 'video', ref: `${STUDIO_FOLDER}/take-1.mp4`, at: 2, caption: 'From the turn.' },
        { kind: 'audio', film: STUDIO_FILM, beat: 'open' },
        { kind: 'document', ref: STUDIO_NOTES, caption: 'The notes on the cut.' },
        keepIt('cut', 'Keep the cut?'),
        { kind: 'free_text', id: 'more', label: 'Anything else?' },
      ],
      next: [{ to: 'done' }],
    },
    done: { end: true, text: 'Thank you.' },
  },
};

/** The guided review as `GET /api/asks/<id>` sends it, at its start. */
const guidedRecord: Json = {
  id: STUDIO_GUIDED,
  title: 'Review the toy',
  why: 'Each part goes on to the next stage once kept.',
  by: 'toy-agent',
  film: STUDIO_FILM,
  created: '2026-10-15T00:00:00.000Z',
  ask: guidedMachine,
  state: { _tag: 'Asking', step: 'script', answers: {} },
  answered: [],
};

/** The still a Board panel's try shows: a real image the guided review's board route serves. */
const STILL = new URL('../../tools/fixtures/still.svg', import.meta.url).pathname;

/** The toy's Board: open's card, a picture panel with no try yet, and one with a try kept, its still a tap from full size. */
const guidedBoard: Json = {
  film: STUDIO_FILM,
  panels: [
    {
      id: 'open.title',
      beat: 'open',
      at: 'title',
      tries: [],
      text: { _tag: 'Card', payoff: 'breath' },
    },
    { id: 'open.field', beat: 'open', at: 'field', tries: [] },
    {
      id: 'open.breath',
      beat: 'open',
      at: 'breath',
      tries: [
        {
          n: 1,
          file: 'open.breath.1.png',
          sha256: 'openbreath1',
          made: 'generate',
          refs: [],
          at: '2026-10-15T00:00:00.000Z',
        },
      ],
      kept: 1,
    },
  ],
  approvals: [],
};

/** The routes the guided review reads beside the studio's: its record, the index with the notes, the Board, the take. */
export const guidedRoutes: ReadonlyArray<FakeRoute> = [
  route('GET', new RegExp(`^/api/asks/${STUDIO_GUIDED}$`), () => json(guidedRecord)),
  route('GET', /^\/api\/review\/index/, () =>
    json(indexOf(['main', 'warm'], [{ ref: STUDIO_NOTES, name: 'notes.md', size: 64, mtime: 0 }])),
  ),
  route('GET', /^\/api\/review\/files\/out\/toy\/notes\.md/, () =>
    textAnswer('# Notes\n\nThe turn lands **after** the breath.\n', 200),
  ),
  route('GET', /^\/api\/films\/toy\/board$/, () => json(guidedBoard)),
  route('GET', /^\/api\/films\/toy\/board\/files\/open\.breath\.1\.png$/, () => file(STILL)),
  route('GET', /^\/api\/films\/toy\/studio\/takes\/open\/attempts$/, () =>
    json({
      beat: 'open',
      attempts: [
        {
          file: 'open.abc.flac',
          transcript: 'The first thing God gave was breath.',
          wer: 0,
          at: 0,
          duration: 2,
          kept: true,
          current: true,
        },
      ],
    }),
  ),
];

/** A series of the app's, listed beside the films, and its one draft. */
export const STUDIO_SERIES = 'toy-talks';
export const STUDIO_DRAFT = '01-first-breath';

/** The draft as `GET /api/series/<series>/<draft>` sends it, its first beat's line said `say`. */
export const draftRecordWith = (say = 'The first thing God {*}gave was breath.'): Json => ({
  series: STUDIO_SERIES,
  draft: STUDIO_DRAFT,
  title: 'The first breath',
  beats: [
    {
      id: '1',
      label: 'Hook',
      say,
      brief: 'A figure of clay on a bench, still.',
      cite: ['Gen 2:7'],
    },
    { id: '2', label: 'Turn', say: 'He spoke, {//1} and it was.', cite: ['Ps 33:9'] },
    { id: '3', label: 'Card', brief: 'The title, on paper.', cite: [] },
  ],
});

/** The draft as its Markdown reads now: its first beat's second word stressed. */
const draftRecord = draftRecordWith();

/** A take's word, `at` seconds in, heard for a third of a second. */
const takeWord = (text: string, at: number): Json => ({
  text,
  start: at,
  end: at + 0.3,
  voiced: { start: at, end: at + 0.3 },
});

/** The draft's staging takes: the first beat's ready (seven words in 2.8 s: 150 wpm), the second voicing. */
export const draftVoice: Json = {
  film: `${STUDIO_SERIES}/${STUDIO_DRAFT}`,
  spent: 1240,
  cap: 20000,
  beats: [
    {
      id: '1',
      take: {
        _tag: 'Ready',
        file: 'k1.mp3',
        duration: 2.8,
        words: ['The', 'first', 'thing', 'God', 'gave', 'was', 'breath.'].map((w, i) =>
          takeWord(w, i * 0.4),
        ),
      },
    },
    { id: '2', take: { _tag: 'Voicing' } },
  ],
};

/** The review's routes over the film: its index, its films, its choices, its project and their checks. */
export const studioRoutes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/api\/review\/index/, () => json(indexOf(['main', 'warm']))),
  route('GET', /^\/api\/review\/duration/, () => json({ seconds: 20 })),
  route('GET', /^\/api\/films$/, () => json({ films: [STUDIO_FILM] })),
  route('GET', /^\/api\/films\/toy\/choices$/, () => json(choices)),
  route('GET', /^\/api\/films\/toy\/choices\/check$/, () =>
    json({
      findings: [
        {
          level: 'warning',
          tag: 'Balance',
          message: 'the score sits under the voice',
          address: { part: FILM_AT, time: 2 },
        },
      ],
    }),
  ),
  route('GET', /^\/api\/films\/toy\/check$/, () =>
    json({
      findings: [
        { level: 'warning', tag: 'score', message: 'piano is stale' },
        {
          level: 'warning',
          tag: 'cue',
          message: 'the page turns early',
          address: { part: scenesAt('open'), time: 2 },
        },
      ],
    }),
  ),
  route('GET', /^\/api\/films\/toy\/steps$/, () => json({})),
  route('GET', /^\/api\/films\/toy\/project$/, () => json(project)),
  route('GET', /^\/api\/productions$/, () => json({ productions: [productionLedger] })),
  route('GET', /^\/api\/asks\/a0123456789$/, () => json(askRecord)),
  route('GET', /^\/api\/series$/, () =>
    json({
      series: [
        {
          name: STUDIO_SERIES,
          title: 'Toy talks',
          drafts: [{ name: STUDIO_DRAFT, title: 'The first breath' }],
        },
      ],
    }),
  ),
  route('GET', /^\/api\/series\/toy-talks\/01-first-breath$/, () => json(draftRecord)),
  route('GET', /^\/api\/series\/toy-talks\/01-first-breath\/voice$/, () => json(draftVoice)),
];

/** The studio's routes with open's render set holding three versions: a pair leaves one out. */
export const studioRoutesOfThree: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/api\/review\/index/, () => json(indexOf(['main', 'warm', 'cool']))),
  ...studioRoutes,
];
