// A synthetic film over every review page of the studio, for the tests that
// walk them all (the touch-target guard): one film, `toy`, of an act (open,
// close) and two loose scenes (coda, end), open rendered so its row links
// its Versions; its choices are a score of three options, a look of two, a
// sound's kept take and two candidates in open, a layer across the act and a
// level's knob; and the review's index holds the film's project folder with
// open's render set and two loose videos (one with its phone proxy ready). What the disclosed states need is there too: two
// pictures under the Choices transport, a comment on the film, the act, scene open and
// the score's strings and the set's main version (their counts), and the check's two findings, one at a
// time. Each route answers as the lab's server encodes it.

import { Option, Schema } from 'effect';
import { sceneAddress } from '../../core/address.ts';
import { Render } from '../../core/catalogue.ts';
import { type FakeRoute, type Json, json, route } from './harness.ts';

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
    variant: 'main',
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
    variant: 'main',
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

/** Open's render set, with two versions to compare. */
const renderSet: Json = {
  id: STUDIO_SET,
  kind: 'render',
  address: scenesAt('open'),
  title: 'scene open',
  lines: [],
  start: 0,
  marks: [],
  variants: ['main', 'warm'].map((id) => ({
    id,
    label: id,
    lines: [`${id} look`],
    state: 'current',
    picked: false,
    verbs: [],
    media: { _tag: 'Seen', video: videoOf('open') },
    key: id,
    approval: 'none',
    comments: [id]
      .filter((v) => v === 'main')
      .map(() => said(scenesAt('open'), 'the page lands', Option.some(STUDIO_SET))),
  })),
};

const index: Json = {
  folders: [
    {
      ref: STUDIO_FOLDER,
      title: STUDIO_FILM,
      mtime: 0,
      sets: [renderSet],
      videos: [looseOf('take-1.mp4', 'ready'), looseOf('take-2.mp4', 'pending')],
      images: [],
      docs: [],
    },
  ],
};

/** The review's routes over the film: its index, its films, its choices, its project and their checks. */
export const studioRoutes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/api\/review\/index/, () => json(index)),
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
];
