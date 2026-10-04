// What the review's cards say of a file, what a say's receipt says, and
// which copy of a video it plays: pure, so each reads the same in a test as
// on the page.

import { Array as Arr, Match, Option } from 'effect';
import type { ApprovalState, StaleBy, VariantState } from '../../core/catalogue.ts';
import { type ReviewFile, type ReviewFolder, type ReviewVideo } from '../../core/review.ts';
import { STALE_BY } from '../../core/choice.ts';
import { type Say, reviewFileUrl, reviewPhoneUrl } from '../../core/api.ts';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { CommandId, Undoing } from '../../command/command.ts';
import type { LabFailure } from '../api.ts';

/** What a failed read or write says: its words, without its tag. */
export const failedText = (result: AsyncResult.AsyncResult<unknown, LabFailure>): string =>
  Option.getOrElse(
    Option.map(AsyncResult.error(result), (e) => e.message.replace(/^\w+: /, '')),
    () => '',
  );

/**
 * A write's receipt, in its control's words as it is sent (`writeStatus`):
 * what it says while it is out, what it did once it answered `A`, and its
 * Undo, bound to the change the answer made.
 */
export interface Words<A> {
  readonly doing: string;
  readonly done: (answer: A) => string;
  /**
   * Its Undo from the answer: the command, bound to the change the answer
   * made; none when it made none (a value already so), or for a write that
   * nothing undoes (a say). Absent: nothing undoes it.
   */
  readonly undo?: (answer: A) => Option.Option<Undoing>;
  /**
   * The command a refusal's receipt offers past it (a voice heard as
   * something else: Accept anyway), asked once with the refusal it said;
   * none offers nothing.
   */
  readonly past?: (failure: LabFailure) => Option.Option<CommandId>;
}

/** What a say did, of `subject`, as its receipt says: `Approved B · warm · Score`. */
export const sayText = (say: Say, subject: string): string =>
  Match.value(say).pipe(
    Match.tagsExhaustive({
      Approve: () => `Approved ${subject}`,
      Withdraw: () => `Unapproved ${subject}`,
      Comment: () => `Commented on ${subject}`,
    }),
  );

/** A size in bytes as a card says it: `812 KB`, `2.4 GB`. */
export const sizeText = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  for (const unit of units) {
    // A tenth only where it tells: 2.4 GB, 36 MB.
    if (n < 10 && unit !== 'B') return `${n.toFixed(1)} ${unit}`;
    if (n < 1024) return `${n.toFixed(0)} ${unit}`;
    n /= 1024;
  }
  return `${n.toFixed(1)} TB`;
};

/** How long ago `mtime` was, at `now` (both ms): `just now`, `12 min ago`, `3 h ago`, `2 d ago`. */
export const agoText = (mtime: number, now: number): string => {
  const seconds = (now - mtime) / 1000;
  if (seconds < 90) return 'just now';
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 129_600) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
};

/** How wide a video's poster still is: the frame a card shows before it plays. */
export const POSTER_W = 960;

/**
 * Which copy a video plays: the Proxy (`phone`, its 720p copy, made for big
 * videos) or the Original (`full`, the file itself). The stored words stay.
 */
export type Quality = 'phone' | 'full';

/**
 * The URL a video plays from at `quality`: on Proxy its proxy once made, or
 * the file when it is small enough to need none; none while its proxy is
 * still being made, so a phone never streams the original in its place.
 * On Original, the file.
 */
export const videoSource = (video: ReviewVideo, quality: Quality): Option.Option<string> => {
  if (quality === 'full' || video.phone === 'none') return Option.some(reviewFileUrl(video.ref));
  if (video.phone === 'ready') return Option.some(reviewPhoneUrl(video.ref));
  return Option.none();
};

/** `n` things, named in the singular: `1 video`, `3 videos`, none for none. */
const counted = (n: number, thing: string): Option.Option<string> => {
  if (n === 0) return Option.none();
  if (n === 1) return Option.some(`1 ${thing}`);
  return Option.some(`${n} ${thing}s`);
};

/** How many versions a stack holds: `1 version`, `3 versions`. */
export const versionsText = (n: number): string =>
  Option.getOrElse(counted(n, 'version'), () => '0 versions');

/** What a folder holds: `2 version stacks · 3 videos · 1 doc`. */
export const countsText = (folder: ReviewFolder): string =>
  Arr.getSomes([
    counted(folder.sets.length, 'version stack'),
    counted(folder.videos.length, 'video'),
    counted(folder.images.length, 'image'),
    counted(folder.docs.length, 'doc'),
    counted(folder.downloads?.length ?? 0, 'download'),
  ]).join(' · ');

/** The folder's name as its card shows it: its manifest's title, else its ref's last part. */
export const folderTitle = (folder: ReviewFolder): string =>
  Option.getOrElse(folder.title, () => folder.ref);

/** A folder's captions for a video (`<name>.vtt`, or its master's for a share copy). */
export const captionsFor = (
  video: ReviewFile,
  docs: ReadonlyArray<ReviewFile>,
): Option.Option<ReviewFile> => {
  const base = video.name.replace(/\.(mp4|webm|mov|m4v)$/, '');
  const names = [`${base}.vtt`, `${base.replace(/\.share$/, '')}.vtt`];
  return Option.fromUndefinedOr(docs.find((doc) => names.includes(doc.name)));
};

/**
 * A state as an ARIA attribute says it (`aria-pressed`, `aria-busy`, a
 * `data-*` flag). A function, not an inline template: it types the value as
 * `'true' | 'false'`.
 */
export const pressed = (on: boolean) => `${on}` as const;

/** Whether a doc reads as markdown (shown inline); the rest are linked. */
export const isMarkdown = (doc: ReviewFile): boolean => doc.name.endsWith('.md');

/** What each approval state says, wherever a page says it. */
export const APPROVAL_TEXT = {
  none: 'needs review',
  approved: 'approved',
  stale: 'needs review: an earlier version was approved',
} as const satisfies Record<ApprovalState, string>;

/** An approval as a variant's verdict says it, after its label: none said for none. */
export const approvalText = (approval: ApprovalState): string =>
  Match.value(approval).pipe(
    Match.when('none', () => ''),
    Match.orElse((a) => ` — ${APPROVAL_TEXT[a]}`),
  );

/** What a variant's state says: a render, a take, a score option alike. */
const STATE_TEXT = {
  current: 'current',
  stale: 'out of date: made for an earlier version',
  missing: 'not made yet',
} as const satisfies Record<VariantState, string>;

/** A variant's state as its badge says it, with why it is stale when that is known. */
export const stateText = (state: VariantState, staleBy: Option.Option<StaleBy>): string =>
  Option.match(
    Option.filter(staleBy, () => state === 'stale'),
    { onNone: () => STATE_TEXT[state], onSome: (by) => `out of date: ${STALE_BY[by].why}` },
  );

/**
 * What the review's index can say of a variant's state: why it is stale when
 * the record proves it (a newer render at its address drew other sources, or
 * carries another mix), else nothing. Never "current": whether the newest is
 * current against the film's sources now only `film project` can say.
 */
export const recordedStaleText = (variant: {
  readonly state: VariantState;
  readonly staleBy: Option.Option<StaleBy>;
}): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(variant, (v) => v.state === 'stale'),
    (v) => stateText(v.state, v.staleBy),
  );
