// The choice point: at an address of a film, a set of variants to compare,
// one of them picked (a sound's takes: the kept ones), each commented on and
// approved. One shape for every kind, so the review shows one card with the
// same controls at every level of the film (the film, an act, a scene, a
// layer); the kind says only where a pick lands and how a variant is heard
// or seen:
//
// - render: an address's renders, a variant each (the catalogue's); seen
//   side by side; reviewed and approved, never picked;
// - score: the score's options (`play` in `sound.ts`); each heard as the
//   film's mix with it playing;
// - take: a library sound's takes (`library.lock.json`); heard alone and in
//   place; kept (picked), unkept or rejected;
// - voice: a beat's recorded attempts; heard alone; one kept as the take;
// - look: a look's named levels (`looks` in `palette.ts`); one picked;
// - level: a sound layer's level (a bed's, an effect's, the score's), a
//   knob and no variants.
//
// The owner's approvals and comments are the catalogue's records
// (`catalogue.ts`), each on one variant as it was when given (its `key`).
// Pure: the tools' adapters (`tools/choices.ts`, `tools/review.ts`) build
// the points, and the review page shows them.

import { Array as Arr, Option, Schema } from 'effect';
import { Address } from './address.ts';
import {
  ApprovalState,
  type Catalogue,
  SaidComment,
  StaleBy,
  type Subject,
  VariantState,
  approvalState,
  saidOn,
  topicAt,
} from './catalogue.ts';
import { PointRef, pointIdOf } from './point.ts';
import { CheckLine, Seconds, maybe } from './schema.ts';
import { ReviewFile, ReviewVideo } from './served.ts';

/** What a choice point chooses between; each kind has one adapter. */
export const ChoiceKind = Schema.Literals(['render', 'score', 'take', 'voice', 'look', 'level']);
export type ChoiceKind = typeof ChoiceKind.Type;

/**
 * What may be done to a variant beside comparing, commenting and approving:
 * picked (it plays), unpicked (a kept take waits again) or rejected (a take
 * never offered again).
 */
export const ChoiceVerb = Schema.Literals(['pick', 'unpick', 'reject']);
export type ChoiceVerb = typeof ChoiceVerb.Type;

/**
 * How a variant is met: seen (a video, compared in sync), heard (alone,
 * and in place: the film's whole mix with it playing) or neither.
 */
export const VariantMedia = Schema.Union([
  Schema.TaggedStruct('Seen', { video: ReviewVideo }),
  Schema.TaggedStruct('Heard', { alone: Schema.Boolean, inPlace: Schema.Boolean }),
  Schema.TaggedStruct('Unseen', {}),
]).pipe(Schema.toTaggedUnion('_tag'));
export type VariantMedia = typeof VariantMedia.Type;

/** One variant of a choice point. */
export const ChoiceVariant = Schema.Struct({
  /** Its name at its point: an option's, a take's sha256, an attempt's file, a render's variant. */
  id: Schema.String,
  label: Schema.String,
  /** What it is, a line each: its styles, its length and loudness, its size and commit. */
  lines: Schema.Array(Schema.String),
  state: VariantState,
  /** Why a stale render is stale (its sources, or only the film's sound); none for every other variant. */
  staleBy: maybe(StaleBy),
  picked: Schema.Boolean,
  /** The verbs its state allows. */
  verbs: Schema.Array(ChoiceVerb),
  media: VariantMedia,
  /** What it is now, which the owner's say is given on (a render's stamp key, a take's sha256). */
  key: Schema.String,
  approval: ApprovalState,
  comments: Schema.Array(SaidComment),
  /** A markdown file said of it (a montage's notes). */
  notes: maybe(ReviewFile),
});
export type ChoiceVariant = typeof ChoiceVariant.Type;

/** An instant on the film's clock where the point plays: an effect's placement, a layer's start. */
export const ChoiceMark = Schema.Struct({ t: Seconds, label: Schema.String });
export type ChoiceMark = typeof ChoiceMark.Type;

/** A number the point sets beside its variants: a sound layer's level, in dB against the voice. */
export const ChoiceKnob = Schema.Struct({
  value: Schema.Finite,
  min: Schema.Finite,
  max: Schema.Finite,
  step: Schema.Finite,
  unit: Schema.String,
  /** Why it cannot be written, when it cannot (its value is computed). */
  fixed: maybe(Schema.String),
});
export type ChoiceKnob = typeof ChoiceKnob.Type;

/** A choice point: at an address, variants to compare, pick, comment on and approve. */
export const ChoicePoint = Schema.Struct({
  /**
   * Unique in its film: `score`, `take:paper.slide`, `look:ground`,
   * `render:scenes:cold`; its `ref` as `point.ts` writes it.
   */
  id: Schema.String,
  /** Which point it is, as data: what a verb on it reads, never its id parsed back. */
  ref: PointRef,
  kind: ChoiceKind,
  /** Where in the film it belongs; none for a montage's set, which no film owns. */
  address: maybe(Address),
  title: Schema.String,
  lines: Schema.Array(Schema.String),
  /** Where its videos start, in seconds. */
  start: Seconds,
  /** The instants a set's moments view shows, when it names them. */
  moments: maybe(Schema.Array(Seconds)),
  marks: Schema.Array(ChoiceMark),
  knob: maybe(ChoiceKnob),
  variants: Schema.Array(ChoiceVariant),
});
export type ChoicePoint = typeof ChoicePoint.Type;

/** A variant as its adapter describes it, before the owner's say is read. */
export type VariantDraft = Omit<ChoiceVariant, 'approval' | 'comments' | 'notes' | 'staleBy'> & {
  readonly notes?: Option.Option<ReviewFile>;
  readonly staleBy?: Option.Option<StaleBy>;
};

/** Each kind of point's kind: what it chooses between (a montage's set is a render set). */
const KIND = {
  Render: 'render',
  Montage: 'render',
  Score: 'score',
  Take: 'take',
  Voice: 'voice',
  Look: 'look',
  Level: 'level',
} as const satisfies { readonly [Tag in PointRef['_tag']]: ChoiceKind };

/** A point's ref, with its id and kind, both read off it. */
export const pointHead = (ref: PointRef): Pick<ChoicePoint, 'id' | 'ref' | 'kind'> => ({
  id: pointIdOf(ref),
  ref,
  kind: KIND[ref._tag],
});

/** A point as its adapter describes it: which point it is, and its variants' say still to read. */
export interface PointDraft extends Omit<
  ChoicePoint,
  'id' | 'kind' | 'variants' | 'moments' | 'marks' | 'knob' | 'start'
> {
  readonly variants: ReadonlyArray<VariantDraft>;
  readonly start?: number;
  readonly moments?: Option.Option<ReadonlyArray<number>>;
  readonly marks?: ReadonlyArray<ChoiceMark>;
  readonly knob?: Option.Option<ChoiceKnob>;
}

/** What the owner's say on `variant` of the point `ref` at `address` is about. */
export const subjectAt = (
  ref: PointRef,
  address: Address,
  variant: { readonly id: string; readonly key: string },
): Subject => ({ ...topicAt(address, ref, variant.id), key: variant.key });

/** Why a variant of each kind is stale when nothing more says why, and how to make one current. */
const STALE = {
  render: 'it was drawn for an earlier version; render it again, then approve the new render',
  score: 'it was composed for an earlier plan; compose it again, then approve that',
  take: 'it was made for an earlier declaration; approve a take made for the one now',
  voice: 'it was recorded for an earlier line; approve an attempt at the line now',
  look: 'it is no level the look offers now',
  level: 'it is no level the film sets now',
} as const satisfies { readonly [K in ChoiceKind]: string };

/** Why a render stale by `StaleBy` is, and how to make it current. */
const STALE_BY = {
  sources: 'its sources changed since it was made; render it again, then approve the new render',
  sound:
    "the film's sound changed since it was made; render it again (a re-mux), then approve that",
} as const satisfies { readonly [S in StaleBy]: string };

/**
 * Why `variant` of a point of `kind` is no approval's subject, or none when it
 * is: an approval is of a variant as it is now, so only a current one is
 * approved. The one rule for every say that approves (the project's scenes,
 * the choices); the page's disabled button is its face.
 */
export const approvalRefused = (
  kind: ChoiceKind,
  variant: {
    readonly state: VariantState;
    readonly staleBy: Option.Option<StaleBy>;
  },
): Option.Option<string> => {
  if (variant.state === 'current') return Option.none();
  if (variant.state === 'missing')
    return Option.some('nothing is made of it yet; make it, then approve it');
  return Option.some(
    `it is stale: ${Option.match(variant.staleBy, {
      onNone: () => STALE[kind],
      onSome: (by) => STALE_BY[by],
    })}`,
  );
};

/** `draft` as its point, with each variant's approval and comments as `catalogue` records them. */
export const withSay = (catalogue: Option.Option<Catalogue>, draft: PointDraft): ChoicePoint => {
  const { ref } = draft;
  return {
    ...draft,
    ...pointHead(ref),
    start: draft.start ?? 0,
    moments: draft.moments ?? Option.none(),
    marks: draft.marks ?? [],
    knob: draft.knob ?? Option.none(),
    variants: draft.variants.map((variant): ChoiceVariant => {
      const said = Option.map(
        Option.all({ cat: catalogue, address: draft.address }),
        ({ cat, address }) => ({ cat, subject: subjectAt(ref, address, variant) }),
      );
      return {
        ...variant,
        notes: variant.notes ?? Option.none(),
        staleBy: variant.staleBy ?? Option.none(),
        approval: Option.match(said, {
          onNone: (): ApprovalState => 'none',
          onSome: ({ cat, subject }) => approvalState(cat, subject),
        }),
        comments: Option.match(said, {
          onNone: () => [],
          onSome: ({ cat, subject }) => saidOn(cat, subject),
        }),
      };
    }),
  };
};

/** A point of `points` by its id. */
export const pointNamed = (
  points: ReadonlyArray<ChoicePoint>,
  id: string,
): Option.Option<ChoicePoint> => Arr.findFirst(points, (p) => p.id === id);

/** A variant of `point` by its id. */
export const variantNamed = (point: ChoicePoint, id: string): Option.Option<ChoiceVariant> =>
  Arr.findFirst(point.variants, (v) => v.id === id);

/** A variant that is seen, with its video: what a set compares side by side. */
export interface SeenVariant extends ChoiceVariant {
  readonly video: ReviewVideo;
}

/** A point's seen variants, each with its video. */
export const seenVariants = (point: ChoicePoint): ReadonlyArray<SeenVariant> =>
  point.variants.flatMap((variant) =>
    VariantMedia.match(variant.media, {
      Seen: ({ video }) => [{ ...variant, video }],
      Heard: () => [],
      Unseen: () => [],
    }),
  );

/** A point as a set compares it: its seen variants alone, each with its video. */
export interface SeenPoint extends Omit<ChoicePoint, 'variants'> {
  readonly variants: ReadonlyArray<SeenVariant>;
}

/** `point` as a set compares it. */
export const seenPoint = (point: ChoicePoint): SeenPoint => ({
  ...point,
  variants: seenVariants(point),
});

// ---------------------------------------------------------------------------
// On the wire: the review's `choices` routes (`api.ts`).

/** `GET /lab/<film>/choices`: the film's choice points, and the renders they are heard against. */
export const FilmChoices = Schema.Struct({
  film: Schema.String,
  /**
   * The film's whole-film renders under the review's roots, newest first, as
   * its project folders' catalogues record them: the picture each variant's
   * mix is heard against (its own sound muted). None until the whole film is
   * rendered.
   */
  pictures: Schema.Array(ReviewVideo),
  points: Schema.Array(ChoicePoint),
});
export type FilmChoices = typeof FilmChoices.Type;

/** `POST /lab/<film>/choices/pick`: a verb on one variant of one point. */
export const PickPost = Schema.Struct({
  point: Schema.String,
  variant: Schema.String,
  verb: ChoiceVerb,
});
export type PickPost = typeof PickPost.Type;

/** `POST /lab/<film>/choices/level`: a level point's knob set. */
export const KnobPost = Schema.Struct({ point: Schema.String, value: Schema.Finite });
export type KnobPost = typeof KnobPost.Type;

/** What a pick answers: the file it changed, the film's choices as they now stand, and the check after it. */
export const ChoiceWrite = Schema.Struct({
  file: Schema.String,
  /** What changed: `score play piano`, `sound paper.slide keep 3f2a…`, `level PAPER -24`. */
  target: Schema.String,
  choices: FilmChoices,
  findings: Schema.Array(CheckLine),
});
export type ChoiceWrite = typeof ChoiceWrite.Type;

/** `GET /lab/<film>/choices/check`: `film check --sound` now (dead air, balance against the mix it makes). */
export const SoundCheck = Schema.Struct({ findings: Schema.Array(CheckLine) });
export type SoundCheck = typeof SoundCheck.Type;
