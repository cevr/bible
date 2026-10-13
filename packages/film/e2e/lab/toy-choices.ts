// Choices over a toy film, its server faked: one point of each kind the page
// lays out (a score's options, a look, a take's two versions, a level), for
// the e2e suites that walk what the page offers.

import { Option } from 'effect';
import { pageHref } from '../../src/core/api.ts';
import { type Json, json, openReview, route } from '../../src/lab/fixtures/harness.ts';

/** A variant as the server encodes it. */
const variant = (
  id: string,
  fields: {
    readonly state?: string;
    readonly picked?: boolean;
    readonly verbs?: ReadonlyArray<string>;
    readonly media?: Json;
  } = {},
): Json => ({
  id,
  label: id.slice(0, 12),
  lines: [`${id.slice(0, 12)} line`],
  state: fields.state ?? 'current',
  picked: fields.picked ?? false,
  verbs: fields.verbs ?? [],
  media: fields.media ?? { _tag: 'Heard', alone: false, inPlace: true },
  key: id,
  approval: 'none',
  comments: [],
});

/** A point as the server encodes it. */
const point = (
  id: string,
  kind: string,
  address: Json,
  variants: ReadonlyArray<Json>,
  knob: Option.Option<Json> = Option.none(),
): Json => {
  const at = { id, kind, address, title: id, lines: [], start: 0, marks: [], variants };
  return Option.match(knob, { onNone: () => at, onSome: (k) => ({ ...at, knob: k }) });
};

const FILM_AT: Json = { _tag: 'Film' };
const OPEN_AT: Json = { _tag: 'Scenes', ids: ['open'] };

/** A film's choices of four kinds: a score's options, a look, a take's two versions and a level. */
const CHOICES: Json = {
  film: 'toy',
  pictures: [{ ref: 'out/toy/toy.mp4', name: 'toy.mp4', size: 2048, mtime: 0, phone: 'none' }],
  points: [
    point('score', 'score', FILM_AT, [
      variant('strings', { picked: true }),
      variant('piano', { state: 'stale', verbs: ['pick'] }),
      variant('choir', {
        state: 'missing',
        media: { _tag: 'Heard', alone: false, inPlace: false },
      }),
    ]),
    point('look:ground', 'look', FILM_AT, [
      variant('now', { picked: true, media: { _tag: 'Unseen' } }),
      variant('light', { verbs: ['pick'], media: { _tag: 'Unseen' } }),
    ]),
    point('take:paper.page', 'take', OPEN_AT, [
      variant('a'.repeat(64), {
        picked: true,
        verbs: ['unpick'],
        media: { _tag: 'Heard', alone: true, inPlace: true },
      }),
      variant('b'.repeat(64), {
        verbs: ['pick', 'reject'],
        media: { _tag: 'Heard', alone: true, inPlace: true },
      }),
    ]),
    point(
      'level:const:PAPER',
      'level',
      OPEN_AT,
      [],
      Option.some({ value: -24, min: -40, max: 0, step: 0.5, unit: 'dB' }),
    ),
  ],
};

const CHOICE_ROUTES = [
  route('GET', /^\/api\/review\/index/, () => json({ folders: [] })),
  route('GET', /^\/api\/films$/, () => json({ films: ['toy'] })),
  route('GET', /^\/api\/films\/toy\/choices$/, () => json(CHOICES)),
  route('GET', /^\/api\/films\/toy\/choices\/check$/, () => json({ findings: [] })),
  route('GET', /^\/api\/films\/toy\/check$/, () => json({ findings: [] })),
  route('GET', /^\/api\/films\/toy\/steps$/, () => json({})),
];

/** The toy film's choices, a point selected (`?point=`), so its auditions are offered. */
export const onChoices = (at = 'score') =>
  openReview(CHOICE_ROUTES, { href: pageHref.choices('toy', at) });
