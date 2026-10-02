// What the review's cards say of a file, and which copy of a video it
// plays: pure, so each reads the same in a test as on the page.

import { Array as Arr, Match, Option } from 'effect';
import type { ApprovalState, StaleBy, VariantState } from '../../core/catalogue.ts';
import { type ReviewFile, type ReviewFolder, type ReviewVideo } from '../../core/review.ts';
import { STALE_BY } from '../../core/choice.ts';
import { reviewFileUrl, reviewPhoneUrl } from '../../core/api.ts';

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

/** Which copy a video plays: its 720p phone copy (when made) or the file itself. */
export type Quality = 'phone' | 'full';

/** The URL a video plays from at `quality`: the phone copy only once it is ready. */
export const videoUrl = (video: ReviewVideo, quality: Quality): string => {
  if (quality === 'phone' && video.phone === 'ready') return reviewPhoneUrl(video.ref);
  return reviewFileUrl(video.ref);
};

/** `n` things, named in the singular: `1 video`, `3 videos`, none for none. */
const counted = (n: number, thing: string): Option.Option<string> => {
  if (n === 0) return Option.none();
  if (n === 1) return Option.some(`1 ${thing}`);
  return Option.some(`${n} ${thing}s`);
};

/** What a folder holds: `2 comparisons · 3 videos · 1 doc`. */
export const countsText = (folder: ReviewFolder): string =>
  Arr.getSomes([
    counted(folder.sets.length, 'comparison'),
    counted(folder.videos.length, 'video'),
    counted(folder.images.length, 'image'),
    counted(folder.docs.length, 'doc'),
    counted(folder.downloads?.length ?? 0, 'download'),
  ]).join(' · ');

/** The folder's name as its card shows it: its manifest's title, else its ref's last part. */
export const folderTitle = (folder: ReviewFolder): string =>
  Option.getOrElse(folder.title, () => folder.ref);

/** Whether `folder` matches what the filter holds (any case), by its ref or its title. */
export const folderMatches = (folder: ReviewFolder, filter: string): boolean => {
  const needle = filter.trim().toLowerCase();
  if (needle === '') return true;
  const title = Option.getOrElse(folder.title, () => '');
  return `${folder.ref} ${title}`.toLowerCase().includes(needle);
};

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
  none: 'not approved',
  approved: 'approved',
  stale: 'approved an earlier version',
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
  stale: 'stale: made for an earlier version',
  missing: 'not made yet',
} as const satisfies Record<VariantState, string>;

/** A variant's state as its badge says it, with why it is stale when that is known. */
export const stateText = (state: VariantState, staleBy: Option.Option<StaleBy>): string =>
  Option.match(
    Option.filter(staleBy, () => state === 'stale'),
    { onNone: () => STATE_TEXT[state], onSome: (by) => `stale: ${STALE_BY[by].why}` },
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
