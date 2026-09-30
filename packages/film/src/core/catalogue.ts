// A film's render catalogue: every render its project folder holds, what each
// is (its address, variant and kind), what it drew (its stamp) and its files,
// and the owner's approvals and comments, each on one render as it was
// stamped. The catalogue is the only thing that says what a file in the
// project folder shows: nothing reads a file's name back.
//
// A render's slot is its address, variant and kind: a new render of a slot
// replaces the one before it, and an approval of the old render stays,
// stale, because an approval (and a comment) is keyed by the stamp's key it
// was given on. A render is current while its key is the key its address's
// sources have now (`tools/stamp.ts`); the catalogue never computes a key.
//
// Pure: `tools/catalogue.ts` keeps it as `catalogue.json` in the project
// folder, and computes the stamps.

import { Array as Arr, Match, Option, Schema } from 'effect';
import { Address, addressKey, sceneAddress } from './address.ts';

/** A key a JSON file may leave out, read as an `Option`. */
const maybe = <S extends Schema.Top>(schema: S) => Schema.OptionFromOptionalKey(schema);

/**
 * What a render drew: the commit it was made at (none outside a git
 * checkout), and the content key of its sources as they stood (its scenes'
 * modules and everything they import, their timings and their placement).
 */
export const Stamp = Schema.Struct({
  commit: maybe(Schema.String),
  key: Schema.String,
});
export type Stamp = typeof Stamp.Type;

/**
 * A variant's name: it names the render's files, so lower case, digits, `.`,
 * `_` and `-`, starting with a letter or digit (`main`, `ink-2`, `lab-7`).
 */
export const RenderVariantName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/));

/** What a render made: a video (with its captions), stills, a contact sheet or a look-book. */
export const RenderKind = Schema.Literals(['video', 'stills', 'contact', 'lookbook']);
export type RenderKind = typeof RenderKind.Type;

/** How a render was made, beside what it drew: a render at another size is another render. */
export const RenderSettings = Schema.Struct({
  scale: Schema.Finite,
  captions: Schema.Boolean,
});
export type RenderSettings = typeof RenderSettings.Type;

/** A render's files, relative to the project folder. */
export const RenderFiles = Schema.Struct({
  /** The video. */
  clip: maybe(Schema.String),
  /** Its smaller copy to send and to stream. */
  share: maybe(Schema.String),
  captions: maybe(Schema.String),
  /** The YouTube chapters, for a whole film that declares acts. */
  chapters: maybe(Schema.String),
  /** Stills, a contact sheet, a look-book: in time order. */
  images: Schema.Array(Schema.String),
});
export type RenderFiles = typeof RenderFiles.Type;

/** One render the project folder holds. */
export const Render = Schema.Struct({
  address: Address,
  /** Which of the address's renders: a look or score option, or `main`. */
  variant: RenderVariantName,
  kind: RenderKind,
  settings: RenderSettings,
  stamp: Stamp,
  /** The film seconds it covers, for a stretch of the film (an act, scenes). */
  span: maybe(Schema.Struct({ from: Schema.Finite, to: Schema.Finite })),
  files: RenderFiles,
  /** When it was recorded, ms since the epoch. */
  at: Schema.Finite,
});
export type Render = typeof Render.Type;

/** The owner's approval of one render: its address and variant, as stamped with `key`. */
export const Approval = Schema.Struct({
  address: Address,
  variant: Schema.String,
  key: Schema.String,
  at: Schema.Finite,
});
export type Approval = typeof Approval.Type;

/** The owner's comment on one render: its address and variant, as stamped with `key`. */
export const Comment = Schema.Struct({
  id: Schema.String,
  address: Address,
  variant: Schema.String,
  key: Schema.String,
  text: Schema.String,
  at: Schema.Finite,
});
export type Comment = typeof Comment.Type;

/** `catalogue.json`: a film's renders, approvals and comments. */
export const Catalogue = Schema.Struct({
  film: Schema.String,
  renders: Schema.Array(Render),
  approvals: Schema.Array(Approval),
  comments: Schema.Array(Comment),
});
export type Catalogue = typeof Catalogue.Type;

export const CatalogueJson = Schema.fromJsonString(Catalogue);

/** A film's catalogue before its first render. */
export const emptyCatalogue = (film: string): Catalogue => ({
  film,
  renders: [],
  approvals: [],
  comments: [],
});

/** The render a variant plays when none is named. */
export const MAIN_VARIANT = 'main';

/** The address, variant and kind that name one render's place in the catalogue. */
export interface Slot {
  readonly address: Address;
  readonly variant: string;
  readonly kind: RenderKind;
}

const sameSlot = (a: Slot, b: Slot) =>
  addressKey(a.address) === addressKey(b.address) && a.variant === b.variant && a.kind === b.kind;

/** Whether `on` (an approval or comment) is about `render`'s address and variant. */
const about = (
  on: { readonly address: Address; readonly variant: string },
  render: { readonly address: Address; readonly variant: string },
) => addressKey(on.address) === addressKey(render.address) && on.variant === render.variant;

/** `catalogue` with `render` in its slot, in place of the render there before. */
export const recordRender = (catalogue: Catalogue, render: Render): Catalogue => ({
  ...catalogue,
  renders: [...catalogue.renders.filter((r) => !sameSlot(r, render)), render],
});

/** The render in `slot`, when there is one. */
export const renderIn = (catalogue: Catalogue, slot: Slot): Option.Option<Render> =>
  Arr.findFirst(catalogue.renders, (r) => sameSlot(r, slot));

/** Whether a render was made from its address's sources as they are: `key` is theirs now. */
export const RenderState = Schema.Literals(['missing', 'current', 'stale']);
export type RenderState = typeof RenderState.Type;

/** `render` against its sources' key now: `current` when it drew them as they are. */
export const renderState = (render: Option.Option<Render>, key: string): RenderState =>
  Option.match(render, {
    onNone: () => 'missing',
    onSome: (r) =>
      Match.value(r.stamp.key === key).pipe(
        Match.when(true, (): RenderState => 'current'),
        Match.orElse((): RenderState => 'stale'),
      ),
  });

/**
 * Whether the slot must be rendered again: it holds no render, or one that
 * drew other sources (`key`) or was made at other `settings`.
 */
export const needsRender = (
  catalogue: Catalogue,
  slot: Slot,
  key: string,
  settings: RenderSettings,
): boolean =>
  !Option.exists(
    renderIn(catalogue, slot),
    (r) =>
      r.stamp.key === key &&
      r.settings.scale === settings.scale &&
      r.settings.captions === settings.captions,
  );

/**
 * The owner's say on a render: `approved` as it is stamped, `stale` when an
 * approval was given on an earlier render of its slot, or `none`.
 */
export const ApprovalState = Schema.Literals(['none', 'approved', 'stale']);
export type ApprovalState = typeof ApprovalState.Type;

/** `render`'s approval state (`ApprovalState`). */
export const approvalState = (catalogue: Catalogue, render: Render): ApprovalState => {
  const given = catalogue.approvals.filter((a) => about(a, render));
  if (given.some((a) => a.key === render.stamp.key)) return 'approved';
  if (given.length > 0) return 'stale';
  return 'none';
};

/** `catalogue` with `render` approved as it is stamped, once. */
export const approve = (catalogue: Catalogue, render: Render, at: number): Catalogue => {
  if (approvalState(catalogue, render) === 'approved') return catalogue;
  return {
    ...catalogue,
    approvals: [
      ...catalogue.approvals,
      { address: render.address, variant: render.variant, key: render.stamp.key, at },
    ],
  };
};

/** `catalogue` with `text` said of `render` as it is stamped, under `id`. */
export const comment = (
  catalogue: Catalogue,
  render: Render,
  text: string,
  id: string,
  at: number,
): Catalogue => ({
  ...catalogue,
  comments: [
    ...catalogue.comments,
    { id, address: render.address, variant: render.variant, key: render.stamp.key, text, at },
  ],
});

/** The comments on `render`'s address and variant, oldest first, on any of its renders. */
export const commentsOn = (catalogue: Catalogue, render: Slot): ReadonlyArray<Comment> =>
  catalogue.comments.filter((c) => about(c, render)).toSorted((a, b) => a.at - b.at);

/** A comment as the project lists it: whether it was made on the render there now. */
export const ProjectComment = Schema.Struct({
  ...Comment.fields,
  onThisRender: Schema.Boolean,
});
export type ProjectComment = typeof ProjectComment.Type;

/** One scene of the project: its sources' key now, its render, and the owner's say. */
export const ProjectScene = Schema.Struct({
  scene: Schema.String,
  /** The key the scene's sources have now. */
  key: Schema.String,
  state: RenderState,
  approval: ApprovalState,
  render: maybe(Render),
  comments: Schema.Array(ProjectComment),
});
export type ProjectScene = typeof ProjectScene.Type;

/** `film project <film> --json`: every scene of the film, in film order, for one variant. */
export const Project = Schema.Struct({
  film: Schema.String,
  variant: Schema.String,
  scenes: Schema.Array(ProjectScene),
});
export type Project = typeof Project.Type;

export const ProjectJson = Schema.fromJsonString(Project);

/** A scene of the film, with the key its sources have now. */
export interface SceneKey {
  readonly scene: string;
  readonly key: string;
}

/** The video slot of one scene's `variant`. */
export const sceneSlot = (scene: string, variant: string): Slot => ({
  address: sceneAddress(scene),
  variant,
  kind: 'video',
});

/** The film's scenes (in film order, with their keys now) as the project lists them for `variant`. */
export const projectOf = (
  catalogue: Catalogue,
  scenes: ReadonlyArray<SceneKey>,
  variant: string,
): Project => ({
  film: catalogue.film,
  variant,
  scenes: scenes.map(({ scene, key }): ProjectScene => {
    const slot = sceneSlot(scene, variant);
    const render = renderIn(catalogue, slot);
    const approval = Option.match(render, {
      onNone: (): ApprovalState => 'none',
      onSome: (r) => approvalState(catalogue, r),
    });
    return {
      scene,
      key,
      state: renderState(render, key),
      approval,
      render,
      comments: commentsOn(catalogue, slot).map((c) => ({
        ...c,
        onThisRender: Option.exists(render, (r) => r.stamp.key === c.key),
      })),
    };
  }),
});

/** A catalogue after an approval, and the scenes it approved. */
export interface Approved {
  readonly catalogue: Catalogue;
  readonly approved: ReadonlyArray<string>;
}

/**
 * `catalogue` with every scene render of `variant` that is current (drawn
 * from its scene's sources as they are now) approved, and the scenes it
 * approved. A stale or missing scene is left for a render first.
 */
export const approveCurrent = (
  catalogue: Catalogue,
  scenes: ReadonlyArray<SceneKey>,
  variant: string,
  at: number,
): Approved => {
  const current = scenes.flatMap(({ scene, key }) =>
    Option.toArray(
      Option.filter(renderIn(catalogue, sceneSlot(scene, variant)), (r) => r.stamp.key === key),
    ),
  );
  return {
    catalogue: current.reduce((cat, render) => approve(cat, render, at), catalogue),
    approved: current.flatMap((r) =>
      Match.valueTags(r.address, {
        Scenes: ({ ids }) => ids,
        Film: () => [],
        Act: () => [],
        Short: () => [],
      }),
    ),
  };
};
