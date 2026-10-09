// The things a review page shows that the owner says something of (a
// variant, a set's version, an act, the film), as the page's commands. Each
// thing on the page registers itself while it is shown (`Thing`): what it
// reads as, whether it takes a comment, and the verbs its own controls allow
// now. The commands read the thing the context selects (a context menu's,
// the focused one, ⌘K's) and run its verb, so a key, a menu and the
// inspector's button are one write: Inspect (`i`) opens the thing's
// inspector, Comment (`m`) opens it at its comment box, Approve (`a`),
// Unapprove, Reject (`x`) and Unkeep (`u`) say what their buttons say, and
// an act's or the film's approve of its current scenes is in its menu and in
// ⌘K, with no key: a batch is never one stray press away. A verb answers
// quietly: its write says what it did as it lands, in the page's receipts
// (`loaded.tsx`), whichever way it was asked. Framework-free.

import { Effect, Option } from 'effect';
import { type Command, quiet, quietly } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Selection } from '../../command/selection.ts';
import type { Target } from '../../command/target.ts';
import { type Say, withdrawSay } from '../../core/api.ts';
import type { ApprovalState } from '../../core/catalogue.ts';
import type { ChoiceVariant } from '../../core/choice.ts';

/** What may be said of a thing beside a comment. */
export type VerbId = 'approve' | 'approve-part' | 'unapprove' | 'reject' | 'unkeep';

/** One verb a thing allows now: its words there, and its write, answering whether it landed. */
export interface ThingVerb {
  readonly id: VerbId;
  readonly label: string;
  readonly run: () => Promise<boolean>;
}

/** The approve button's words for an approval. */
export const APPROVE_TITLE = {
  none: 'Approve',
  approved: 'Approved',
  stale: 'Approve again',
} as const satisfies Record<ApprovalState, string>;

/** One control's say: whether its own is in flight, and the say, answering whether it was said. */
export interface OwnSay {
  readonly waiting: () => boolean;
  readonly say: (variant: ChoiceVariant, say: Say) => Promise<boolean>;
}

/**
 * A variant's approve and unapprove as commands, on every page that says of
 * variants (a choice's variant, a project's scene, a set's version): approve
 * while it is current and not approved as it is (`Approve again` once it has
 * changed), unapprove while it is approved at all; none where it is not said
 * of (`said`) or while the control's own say is in flight.
 */
export const approvalVerbs = (
  variant: ChoiceVariant,
  saying: OwnSay,
  said: boolean,
): ReadonlyArray<ThingVerb> => {
  const free = said && !saying.waiting();
  const approve: ThingVerb = {
    id: 'approve',
    label: APPROVE_TITLE[variant.approval],
    run: () => saying.say(variant, { _tag: 'Approve' }),
  };
  const unapprove: ThingVerb = {
    id: 'unapprove',
    label: 'Unapprove',
    run: () => saying.say(variant, withdrawSay()),
  };
  return [
    ...[approve].filter(
      () => free && variant.state === 'current' && variant.approval !== 'approved',
    ),
    ...[unapprove].filter(() => free && variant.approval !== 'none'),
  ];
};

/** A thing on a review page, as its own row knows it now. */
export interface Thing {
  readonly selection: Selection;
  /** What it reads as in a label: `strings of score`, `act opening`. */
  readonly title: () => string;
  /** Whether it takes a comment now. */
  readonly commentable: () => boolean;
  /** The verbs its controls allow now (none while its own write is in flight). */
  readonly verbs: () => ReadonlyArray<ThingVerb>;
}

/** Where the inspector opens: at the thing's Info, or at its comment box. */
export type OpenAt = 'info' | 'comment';

/** What the commands drive: the things shown now, and the inspector. */
export interface Things {
  /** The thing `selection` names, while it is shown. */
  readonly at: (selection: Selection) => Option.Option<Thing>;
  readonly open: (selection: Selection, at: OpenAt) => void;
}

/** What the inspector opens on. */
const INSPECTED: ReadonlyArray<Target> = ['Variant', 'Version', 'Act', 'Film'];

/**
 * `ctx` without the selected things of the review's kinds that the page has
 * none of now: a link's `?inspect=` naming a version since removed selects
 * nothing, so the focused card's keys act on it (`withFocused`). A hub part
 * (`Hub.refine`): what the page knows that its URL does not.
 */
export const withRegistered = (things: Things, ctx: Context): Context => ({
  ...ctx,
  selection: ctx.selection.filter(
    (s) => !INSPECTED.includes(s._tag) || Option.isSome(things.at(s)),
  ),
});

/** The first selected thing that is shown: what a command about a thing acts on. */
const thingOf = (things: Things, ctx: Context): Option.Option<Thing> =>
  Option.firstSomeOf(ctx.selection.map(things.at));

/** A verb's command: its words, keys and the things it is about. */
interface VerbSpec {
  readonly id: VerbId;
  readonly label: string;
  readonly keys: ReadonlyArray<string>;
  readonly about: ReadonlyArray<Target>;
}

const VERBS: ReadonlyArray<VerbSpec> = [
  { id: 'approve', label: 'Approve', keys: ['a'], about: ['Variant', 'Version'] },
  { id: 'approve-part', label: 'Approve the current scenes', keys: [], about: ['Act', 'Film'] },
  { id: 'unapprove', label: 'Unapprove', keys: [], about: INSPECTED },
  { id: 'reject', label: 'Reject', keys: ['x'], about: ['Variant'] },
  { id: 'unkeep', label: 'Unkeep', keys: ['u'], about: ['Variant'] },
];

/** The verb `id` of the thing `ctx` selects, if it allows it now. */
const verbIn = (things: Things, ctx: Context, id: VerbId): Option.Option<ThingVerb> =>
  Option.flatMap(thingOf(things, ctx), (thing) =>
    Option.fromUndefinedOr(thing.verbs().find((v) => v.id === id)),
  );

const verbCommand = (things: Things, spec: VerbSpec): Command => ({
  id: `review.${spec.id}`,
  label: spec.label,
  labelIn: (ctx) =>
    Option.match(verbIn(things, ctx, spec.id), {
      onNone: () => spec.label,
      onSome: (v) => v.label,
    }),
  group: 'Review',
  keys: spec.keys,
  about: spec.about,
  touch: `long-press it, then ${spec.label}; or in its inspector`,
  when: (ctx) => Option.isSome(verbIn(things, ctx, spec.id)),
  run: (ctx) =>
    Option.match(verbIn(things, ctx, spec.id), {
      onNone: () => Effect.succeed(quiet),
      onSome: (v) => Effect.as(Effect.promise(v.run), quiet),
    }),
});

/** The command opening the selected thing's inspector `at` its Info or its comment box. */
const openCommand = (
  things: Things,
  at: OpenAt,
  spec: { readonly id: string; readonly label: string; readonly key: string },
): Command => {
  const thing = (ctx: Context) =>
    Option.filter(thingOf(things, ctx), (t) => at === 'info' || t.commentable());
  return {
    id: spec.id,
    label: spec.label,
    labelIn: (ctx) =>
      Option.match(thing(ctx), {
        onNone: () => spec.label,
        onSome: (t) => `${spec.label} ${t.title()}`,
      }),
    group: 'Review',
    keys: [spec.key],
    about: INSPECTED,
    touch: 'tap its name, or long-press it',
    when: (ctx) => Option.isSome(thing(ctx)),
    run: quietly((ctx) => Option.map(thing(ctx), (t) => things.open(t.selection, at))),
  };
};

/** The review's commands over the things shown. */
export const thingCommands = (things: Things): ReadonlyArray<Command> => [
  openCommand(things, 'info', { id: 'review.inspect', label: 'Inspect', key: 'i' }),
  openCommand(things, 'comment', { id: 'review.comment', label: 'Comment on', key: 'm' }),
  ...VERBS.map((spec) => verbCommand(things, spec)),
];
