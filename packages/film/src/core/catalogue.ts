// A film's render catalogue: every render its project folder holds, what each
// is (its address, variant and kind), what it drew (its stamp) and its files,
// and the owner's approvals and comments, each on one render as it was
// stamped. The catalogue is the only thing that says what a file in the
// project folder shows: nothing reads a file's name back.
//
// A render's slot is its address, variant and kind: a new render of a slot
// replaces the one before it, and an approval of the old render stays,
// stale, because an approval (and a comment) is keyed by the version it was
// given on: the stamp's key, and the mix a video carries. A render is current
// while its key is the key its address's sources have now (`tools/stamp.ts`)
// and a video carries the mix the film makes now (`mixKey`); a video that
// drew its sources as they are but carries an older mix is stale by its
// sound, and its sound is cut again from the master (a re-mux), not drawn.
// The catalogue never computes a key.
//
// Pure: `tools/catalogue.ts` keeps it as `catalogue.json` in the project
// folder, and computes the stamps.

import { Array as Arr, Match, Option, Schema } from 'effect';
import { Address, addressKey, sceneAddress } from './address.ts';
import type { Say } from './api.ts';
import { PointId, type PointRef, pointIdOf } from './point.ts';
import { maybe } from './schema.ts';
import { FilmPiece } from './shorts.ts';

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
const RenderSettings = Schema.Struct({
  scale: Schema.Finite,
  captions: Schema.Boolean,
});
type RenderSettings = typeof RenderSettings.Type;

/** A render's files, relative to the project folder. */
const RenderFiles = Schema.Struct({
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
type RenderFiles = typeof RenderFiles.Type;

/**
 * The sound a video carries: the film's master as mixed from the plan `mix`
 * names (`mixKey`; none when the plan did not build), cut at `pieces`, in
 * order: the cut a re-mux takes again from a new master.
 */
export const RenderSound = Schema.Struct({
  mix: maybe(Schema.String),
  pieces: Schema.Array(FilmPiece),
});
export type RenderSound = typeof RenderSound.Type;

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
  /** The sound a video carries; none for a silent video, stills and sheets. */
  sound: maybe(RenderSound),
  /** When it was recorded, ms since the epoch. */
  at: Schema.Finite,
});
export type Render = typeof Render.Type;

/**
 * What the owner's say (an approval, a comment) is about: one variant of one
 * choice point (`core/choice.ts`) at its address, as it was when said
 * (`key`: a render's stamp key, a take's sha256, an option's name). A render
 * records no `point`: its point is its address's render set. Any other point
 * names itself (`score`, `take:paper.slide`, `look:ground`).
 */
const SayFields = {
  address: Address,
  point: maybe(PointId),
  variant: Schema.String,
  key: Schema.String,
};

/**
 * An approve run's identity (`uniqueId`: base 36, `<time>-<random>`): what
 * its approvals carry, so its undo takes them and no other, another run's
 * at the very same moment too. Never flag-like: it goes on a CLI's argv.
 */
export const OpId = Schema.String.check(Schema.isPattern(/^[0-9a-z]+(-[0-9a-z]+)*$/)).pipe(
  Schema.brand('OpId'),
);
export type OpId = typeof OpId.Type;

/**
 * The owner's approval of one variant, as it was when approved; `op`, the
 * approve run that gave it (`film project approve`), when one did. An
 * approval given before runs carried one, or by a say, has none, and no
 * undo takes it.
 */
const Approval = Schema.Struct({ ...SayFields, at: Schema.Finite, op: maybe(OpId) });
type Approval = typeof Approval.Type;

/** The owner's comment on one variant, as it was when said. */
const Comment = Schema.Struct({
  id: Schema.String,
  ...SayFields,
  text: Schema.String,
  at: Schema.Finite,
});
type Comment = typeof Comment.Type;

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
interface Slot {
  readonly address: Address;
  readonly variant: string;
  readonly kind: RenderKind;
}

const sameSlot = (a: Slot, b: Slot) =>
  addressKey(a.address) === addressKey(b.address) && a.variant === b.variant && a.kind === b.kind;

/** One variant of one choice point: what an approval or a comment is about. */
export interface Topic {
  readonly address: Address;
  /** The point, when it is not the address's render set. */
  readonly point: Option.Option<PointRef>;
  readonly variant: string;
}

/** A topic as it is now: `key` says what the variant is (a render's stamp key). */
export interface Subject extends Topic {
  readonly key: string;
}

/**
 * One variant of the point `ref` at `address` as a topic. A render set's
 * point is its address's, so it is recorded without one; any other point
 * names itself.
 */
export const topicAt = (address: Address, ref: PointRef, variant: string): Topic => ({
  address,
  point: Option.liftPredicate(ref, (r) => r._tag !== 'Render'),
  variant,
});

/** The point `topic` is on. */
const pointOf = (topic: Topic): PointRef =>
  Option.getOrElse(topic.point, (): PointRef => ({ _tag: 'Render', address: topic.address }));

/**
 * A render's version, what the owner's say is keyed by: its stamp's key, and
 * the mix it carries (`<stamp>+<mix>`), so a re-mux is a new version.
 */
export const renderVersion = (render: Render): string =>
  Option.match(
    Option.flatMap(render.sound, (s) => s.mix),
    {
      onNone: () => render.stamp.key,
      onSome: (mix) => `${render.stamp.key}+${mix}`,
    },
  );

/** A render as what the owner's say is about: its render set's variant, as it is now. */
export const subjectOf = (render: Render): Subject => ({
  ...topicOf(render),
  key: renderVersion(render),
});

/** A slot's video render set as a topic (its point and variant). */
const topicOf = (slot: Pick<Slot, 'address' | 'variant'>): Topic =>
  topicAt(slot.address, { _tag: 'Render', address: slot.address }, slot.variant);

/** Whether `on` (an approval or comment) is about `topic`: the same point's same variant. */
const about = (on: Topic, topic: Topic) =>
  pointIdOf(pointOf(on)) === pointIdOf(pointOf(topic)) && on.variant === topic.variant;

/** `catalogue` with `render` in its slot, in place of the render there before. */
export const recordRender = (catalogue: Catalogue, render: Render): Catalogue => ({
  ...catalogue,
  renders: [...catalogue.renders.filter((r) => !sameSlot(r, render)), render],
});

/** The render in `slot`, when there is one. */
export const renderIn = (catalogue: Catalogue, slot: Slot): Option.Option<Render> =>
  Arr.findFirst(catalogue.renders, (r) => sameSlot(r, slot));

/**
 * Where a variant (a render, a score option, a take) stands against the
 * sources it was made for: `current`, `stale` (made for an earlier version:
 * it still plays) or `missing` (nothing made here: nothing to see or hear).
 */
export const VariantState = Schema.Literals(['current', 'stale', 'missing']);
export type VariantState = typeof VariantState.Type;

/** Why a render is stale: its scene's `sources` changed, or only the film's `sound` did. */
export const StaleBy = Schema.Literals(['sources', 'sound']);
export type StaleBy = typeof StaleBy.Type;

/**
 * What a slot's render is measured against: the key its address's sources
 * have now, and the mix the film makes now (`mixKey`), none when the film
 * has no track yet or its plan does not build (the check names why): then
 * no render is judged by its sound.
 */
interface RenderNow {
  readonly key: string;
  readonly sound: Option.Option<string>;
}

/** Whether `render` carries the film's mix now (always, when there is none to judge by). */
const soundsNow = (render: Render, sound: Option.Option<string>): boolean =>
  Option.match(sound, {
    onNone: () => true,
    onSome: (now) => Option.exists(render.sound, (s) => Option.contains(s.mix, now)),
  });

/** Why `render` is stale against `now`, or none while it is current. */
const staleBy = (render: Render, now: RenderNow): Option.Option<StaleBy> => {
  if (render.stamp.key !== now.key) return Option.some('sources');
  if (!soundsNow(render, now.sound)) return Option.some('sound');
  return Option.none();
};

/** `render` against `now`: its state, and why it is stale. */
export const renderState = (
  render: Option.Option<Render>,
  now: RenderNow,
): { readonly state: VariantState; readonly staleBy: Option.Option<StaleBy> } =>
  Option.match(render, {
    onNone: () => ({ state: 'missing' as const, staleBy: Option.none() }),
    onSome: (r) => {
      const why = staleBy(r, now);
      return {
        state: Option.match(why, {
          onNone: (): VariantState => 'current',
          onSome: (): VariantState => 'stale',
        }),
        staleBy: why,
      };
    },
  });

/** The newest of `renders` (by when each was recorded). */
const newest = (renders: ReadonlyArray<Render>): Option.Option<Render> =>
  Arr.last(renders.toSorted((a, b) => a.at - b.at));

/**
 * What the record alone says `address`'s videos are measured against, for a
 * reader that loads no film (the review's index): the sources the newest
 * video at `address` drew, and the mix the newest video anywhere carries. A
 * video is stale by it when a newer one at its address drew other sources, or
 * a newer one carries another mix; that the newest is current against the
 * film's sources now is the project's to say (`projectOf`, a fresh process).
 */
export const recordedNow = (catalogue: Catalogue, address: Address): Option.Option<RenderNow> => {
  const videos = catalogue.renders.filter((r) => r.kind === 'video');
  return Option.map(
    newest(videos.filter((r) => addressKey(r.address) === addressKey(address))),
    (latest): RenderNow => ({
      key: latest.stamp.key,
      sound: Option.flatMap(
        newest(videos.filter((r) => Option.isSome(Option.flatMap(r.sound, (s) => s.mix)))),
        (r) => Option.flatMap(r.sound, (s) => s.mix),
      ),
    }),
  );
};

/**
 * What a slot needs to be current: nothing; a `remux` (its video drew its
 * sources as they are, at these settings, and only the film's sound changed:
 * the sound is cut again at the pieces it recorded); or a `draw` (no render,
 * other sources or settings, or a video that recorded no sound to re-cut).
 */
type RenderNeed = 'current' | 'remux' | 'draw';

/** What `slot` needs to be current against `now`, rendered at `settings` (`RenderNeed`). */
export const renderNeed = (
  catalogue: Catalogue,
  slot: Slot,
  now: RenderNow,
  settings: RenderSettings,
): RenderNeed =>
  Option.match(renderIn(catalogue, slot), {
    onNone: (): RenderNeed => 'draw',
    onSome: (r): RenderNeed => {
      const same = r.settings.scale === settings.scale && r.settings.captions === settings.captions;
      const why = staleBy(r, now);
      if (!same || Option.contains(why, 'sources')) return 'draw';
      if (Option.isNone(why)) return 'current';
      if (Option.isSome(r.sound)) return 'remux';
      return 'draw';
    },
  });

/**
 * The owner's say on a variant: `approved` as it is now, `stale` when an
 * approval was given on an earlier version of it (an earlier render of its
 * slot, a take made for an earlier request), or `none`.
 */
export const ApprovalState = Schema.Literals(['none', 'approved', 'stale']);
export type ApprovalState = typeof ApprovalState.Type;

/** `subject`'s approval state (`ApprovalState`). */
export const approvalState = (catalogue: Catalogue, subject: Subject): ApprovalState => {
  const given = catalogue.approvals.filter((a) => about(a, subject));
  if (given.some((a) => a.key === subject.key)) return 'approved';
  if (given.length > 0) return 'stale';
  return 'none';
};

/** `catalogue` with `subject` approved as it is now, once; by the approve run `op`, when one. */
export const approve = (
  catalogue: Catalogue,
  subject: Subject,
  at: number,
  op: Option.Option<OpId> = Option.none(),
): Catalogue => {
  if (approvalState(catalogue, subject) === 'approved') return catalogue;
  const { address, point, variant, key } = subject;
  return {
    ...catalogue,
    approvals: [...catalogue.approvals, { address, point, variant, key, at, op }],
  };
};

/**
 * `catalogue` with every approval of `topic` withdrawn, whatever version it
 * was given on (the same point's same variant); `given` an approve run's op,
 * only the approvals of `topic` that run gave: its exact undo. An approval
 * with no op is never taken by it.
 */
export const withdraw = (
  catalogue: Catalogue,
  topic: Topic,
  given: Option.Option<OpId> = Option.none(),
): Catalogue => ({
  ...catalogue,
  approvals: catalogue.approvals.filter(
    (a) =>
      !(
        about(a, topic) &&
        Option.match(given, { onNone: () => true, onSome: (op) => Option.contains(a.op, op) })
      ),
  ),
});

/** A catalogue after a withdraw of scenes, and the scenes it took an approval from. */
interface Withdrawn {
  readonly catalogue: Catalogue;
  readonly took: ReadonlyArray<string>;
}

/** `catalogue` with `scenes`' renders of `variant` withdrawn (`withdraw`), and those it took one from. */
export const withdrawScenes = (
  catalogue: Catalogue,
  scenes: ReadonlyArray<string>,
  variant: string,
  given: Option.Option<OpId>,
): Withdrawn =>
  scenes.reduce<Withdrawn>(
    (done, scene) => {
      const next = withdraw(done.catalogue, topicOf(sceneSlot(scene, variant)), given);
      return {
        catalogue: next,
        took: Arr.appendAll(
          done.took,
          Arr.filter([scene], () => next.approvals.length < done.catalogue.approvals.length),
        ),
      };
    },
    { catalogue, took: [] },
  );

/**
 * `catalogue` after `say` on `subject` (as it is now) at `at`: the one change
 * a say makes; an approve is of the run `op`, when it names one.
 */
export const said = (
  catalogue: Catalogue,
  subject: Subject,
  say: Say,
  at: number,
  op: Option.Option<OpId> = Option.none(),
): Catalogue =>
  Match.valueTags(say, {
    Approve: () => approve(catalogue, subject, at, op),
    Withdraw: ({ given }) => withdraw(catalogue, subject, given),
    Comment: ({ text }) => comment(catalogue, subject, text, at),
  });

/** The next comment's id in `catalogue`: `c1`, `c2`, … */
export const nextCommentId = (catalogue: Catalogue): string => `c${catalogue.comments.length + 1}`;

/** `catalogue` with `text` said of `subject` as it is now, under the next id. */
export const comment = (
  catalogue: Catalogue,
  subject: Subject,
  text: string,
  at: number,
): Catalogue => {
  const { address, point, variant, key } = subject;
  return {
    ...catalogue,
    comments: [
      ...catalogue.comments,
      { id: nextCommentId(catalogue), address, point, variant, key, text, at },
    ],
  };
};

/** The comments on `topic`, oldest first, on any version of it. */
export const commentsOn = (catalogue: Catalogue, topic: Topic): ReadonlyArray<Comment> =>
  catalogue.comments.filter((c) => about(c, topic)).toSorted((a, b) => a.at - b.at);

/** A comment as it is listed beside what it is about: whether it was said of it as it is now. */
export const SaidComment = Schema.Struct({
  ...Comment.fields,
  onThis: Schema.Boolean,
});
export type SaidComment = typeof SaidComment.Type;

/** The comments on `subject`, oldest first, each marked whether it was said of it as it is now. */
export const saidOn = (catalogue: Catalogue, subject: Subject): ReadonlyArray<SaidComment> =>
  commentsOn(catalogue, subject).map((c) => ({ ...c, onThis: c.key === subject.key }));

/** Where a scene sits in the film as it is laid out now, in film seconds: its start and how long it lasts. */
export const SceneSpan = Schema.Struct({ start: Schema.Finite, dur: Schema.Finite });
export type SceneSpan = typeof SceneSpan.Type;

/** One scene of the project: its sources' key now, its render, and the owner's say. */
export const ProjectScene = Schema.Struct({
  scene: Schema.String,
  /** The key the scene's sources have now. */
  key: Schema.String,
  state: VariantState,
  /** Why its render is stale, when it is. */
  staleBy: maybe(StaleBy),
  approval: ApprovalState,
  render: maybe(Render),
  /** Where it sits in the film now (none from a project read before it said so). */
  span: maybe(SceneSpan),
  comments: Schema.Array(SaidComment),
});
export type ProjectScene = typeof ProjectScene.Type;

/**
 * One act of the project: its scenes (in film order), the key its sources
 * have now, and what was said of it. Its approval is its scenes'.
 */
export const ProjectAct = Schema.Struct({
  name: Schema.String,
  scenes: Schema.Array(Schema.String),
  key: Schema.String,
  comments: Schema.Array(SaidComment),
});
export type ProjectAct = typeof ProjectAct.Type;

/**
 * The approvals an approve run gave: its op, the moment, and the scenes
 * whose approval it added (not one approved already). A withdraw given that
 * op (`Say`'s `Withdraw`) undoes exactly them.
 */
export const Gave = Schema.Struct({
  op: OpId,
  at: Schema.Finite,
  scenes: Schema.Array(Schema.String),
});
export type Gave = typeof Gave.Type;

/**
 * What a withdraw given an approve's op took: the op, and the scenes it took
 * an approval from; none when the approvals were gone already (withdrawn
 * since, by another or by an Undo before).
 */
export const Took = Schema.Struct({ op: OpId, scenes: Schema.Array(Schema.String) });
export type Took = typeof Took.Type;

/**
 * `film project <film> --json`: the film by its address tree for one
 * variant: what was said of the whole film, its acts (none when it declares
 * no look), and every scene in film order. An approve's answer carries what
 * it `gave`, when it gave any approval; a withdraw given an op, what it
 * `took`; a read neither.
 */
export const Project = Schema.Struct({
  film: Schema.String,
  variant: Schema.String,
  /** The key the whole film's sources have now. */
  key: Schema.String,
  /** The mix the film makes now (none when it has no track yet or its plan does not build). */
  sound: maybe(Schema.String),
  comments: Schema.Array(SaidComment),
  acts: Schema.Array(ProjectAct),
  scenes: Schema.Array(ProjectScene),
  gave: maybe(Gave),
  took: maybe(Took),
});
export type Project = typeof Project.Type;

/**
 * What the render at `address` is measured against in `project`, as the film
 * stands now: the key its sources have and the mix the film makes. None for
 * an address the project does not list (a short, several scenes at once).
 * The one rule a render's currency is judged by, in the project and in a
 * set's approve alike.
 */
export const projectNow = (project: Project, address: Address): Option.Option<RenderNow> => {
  const keyed = (key: string): RenderNow => ({ key, sound: project.sound });
  return Match.value(address).pipe(
    Match.tag('Film', () => Option.some(keyed(project.key))),
    Match.tag('Act', ({ act }) =>
      Option.map(
        Arr.findFirst(project.acts, (a) => a.name === act),
        (a) => keyed(a.key),
      ),
    ),
    Match.tag('Scenes', ({ ids }) =>
      Option.flatMap(
        Option.liftPredicate(ids, (i) => i.length === 1),
        ([id]) =>
          Option.map(
            Arr.findFirst(project.scenes, (s) => s.scene === id),
            (s) => keyed(s.key),
          ),
      ),
    ),
    Match.orElse(() => Option.none()),
  );
};

/** A scene of the film, with the key its sources have now. */
export interface SceneKey {
  readonly scene: string;
  readonly key: string;
  /** Where it sits in the film now, when the film was laid out. */
  readonly span?: SceneSpan;
}

/** An act of the film: its scenes, with the key its sources have now. */
export interface ActKey {
  readonly act: string;
  readonly scenes: ReadonlyArray<string>;
  readonly key: string;
}

/**
 * The film's address tree with each part's key now (the film's own, its
 * acts', its scenes'), and the mix the film makes now (`RenderNow.sound`).
 */
export interface Keyed {
  readonly key: string;
  readonly sound: Option.Option<string>;
  readonly acts: ReadonlyArray<ActKey>;
  readonly scenes: ReadonlyArray<SceneKey>;
}

/** The video slot of one scene's `variant`. */
export const sceneSlot = (scene: string, variant: string): Slot => ({
  address: sceneAddress(scene),
  variant,
  kind: 'video',
});

/** `address`'s render set's `variant` as it is now (`key`): what is said of a film or an act. */
export const partSubject = (address: Address, variant: string, key: string): Subject => ({
  ...topicOf({ address, variant }),
  key,
});

/** The film (its parts in film order, with their keys now) as the project lists it for `variant`. */
export const projectOf = (catalogue: Catalogue, keyed: Keyed, variant: string): Project => ({
  film: catalogue.film,
  variant,
  key: keyed.key,
  sound: keyed.sound,
  comments: saidOn(catalogue, partSubject({ _tag: 'Film' }, variant, keyed.key)),
  acts: keyed.acts.map((act): ProjectAct => ({
    name: act.act,
    scenes: act.scenes,
    key: act.key,
    comments: saidOn(catalogue, partSubject({ _tag: 'Act', act: act.act }, variant, act.key)),
  })),
  scenes: keyed.scenes.map(({ scene, key, span }): ProjectScene => {
    const render = renderIn(catalogue, sceneSlot(scene, variant));
    return {
      scene,
      key,
      ...renderState(render, { key, sound: keyed.sound }),
      approval: Option.match(render, {
        onNone: (): ApprovalState => 'none',
        onSome: (r) => approvalState(catalogue, subjectOf(r)),
      }),
      render,
      span: Option.fromUndefinedOr(span),
      // A comment is on this render when it was said of the render shown.
      comments: saidOn(catalogue, {
        ...topicOf(sceneSlot(scene, variant)),
        key: Option.match(render, { onNone: () => key, onSome: renderVersion }),
      }),
    };
  }),
  // A read gave and took nothing: an approve's answer says what it gave, an
  // undo's what it took (`film project approve`, `withdraw --given`).
  gave: Option.none(),
  took: Option.none(),
});

/**
 * A catalogue after an approval, the scenes it approved, and of them the
 * ones it `made` approved: those whose approval it added, not one approved
 * already (another's approval, which its undo must leave alone).
 */
interface Approved {
  readonly catalogue: Catalogue;
  readonly approved: ReadonlyArray<string>;
  readonly made: ReadonlyArray<string>;
}

/**
 * `catalogue` with every scene render of `variant` that is current (drawn
 * from its scene's sources as they are now, carrying the mix `sound` the
 * film makes now) approved by the approve run `op`, the scenes it approved,
 * and those it made approved. A stale or missing scene is left for a render
 * (or a re-mux) first.
 */
export const approveCurrent = (
  catalogue: Catalogue,
  scenes: ReadonlyArray<SceneKey>,
  sound: Option.Option<string>,
  variant: string,
  at: number,
  op: OpId,
): Approved => {
  const current = scenes.flatMap(({ scene, key }) =>
    Option.toArray(
      Option.map(
        Option.filter(renderIn(catalogue, sceneSlot(scene, variant)), (r) =>
          Option.isNone(staleBy(r, { key, sound })),
        ),
        (render) => ({ scene, render }),
      ),
    ),
  );
  return {
    catalogue: current.reduce(
      (cat, { render }) => approve(cat, subjectOf(render), at, Option.some(op)),
      catalogue,
    ),
    approved: current.map(({ scene }) => scene),
    made: current
      .filter(({ render }) => approvalState(catalogue, subjectOf(render)) !== 'approved')
      .map(({ scene }) => scene),
  };
};

/** What the approve run `op` that made `made` approved at `at` gave: none when it made none. */
export const gaveOf = (made: ReadonlyArray<string>, at: number, op: OpId): Option.Option<Gave> =>
  Option.map(
    Option.liftPredicate(made, (m) => m.length > 0),
    (scenes) => ({ op, at, scenes }),
  );

/** What a withdraw `given` an op took (`took`, the scenes it took one from); none for a plain withdraw. */
export const tookOf = (
  given: Option.Option<OpId>,
  took: ReadonlyArray<string>,
): Option.Option<Took> => Option.map(given, (op) => ({ op, scenes: took }));
